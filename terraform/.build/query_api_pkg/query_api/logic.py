"""Pure logic for Query API."""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from typing import Any, Iterable

RAW_KEY_RE = re.compile(r"^raw/rinexhourly/(?P<year>\d{4})/(?P<doy>\d{3})/(?P<filename>[^/]+)$")
PROCESSED_BASE_PREFIX = "processed/tec"
PROCESSED_PREFIX_RE = re.compile(
    r"^processed/tec/station=(?P<station>[a-z0-9]{4})/year=(?P<year>\d{4})/doy=(?P<doy>\d{3})/"
)
PROCESSED_STATION_PREFIX_RE = re.compile(r"^processed/tec/station=([a-z0-9]{4})/")
MAX_QUERY_RANGE_DAYS = 7


def _parse_iso_utc(value: str) -> datetime:
    normalized = value.replace("Z", "+00:00")
    parsed = datetime.fromisoformat(normalized)
    if parsed.tzinfo is None:
        raise ValueError("timestamp must include timezone")
    return parsed.astimezone(timezone.utc)


def validate_query_params(params: dict) -> dict:
    """Validate and normalize query params."""
    required = ("station", "start_time", "end_time")
    for key in required:
        if not params.get(key):
            raise ValueError(f"Missing required parameter: {key}")

    station = str(params["station"]).strip()
    if len(station) != 4 or not station.isalnum():
        raise ValueError("Invalid station: must be 4 alphanumeric characters")

    try:
        start_time = _parse_iso_utc(str(params["start_time"]))
        end_time = _parse_iso_utc(str(params["end_time"]))
    except Exception as exc:
        raise ValueError("Invalid start_time/end_time: must be ISO 8601 UTC") from exc

    if start_time > end_time:
        raise ValueError("Invalid range: start_time must be <= end_time")
    if end_time - start_time > timedelta(days=MAX_QUERY_RANGE_DAYS):
        raise ValueError(f"Invalid range: maximum query window is {MAX_QUERY_RANGE_DAYS} days")

    sv = params.get("sv")
    if sv is not None:
        sv = str(sv).strip()
        if not sv:
            raise ValueError("Invalid sv: must be non-empty when provided")

    return {
        "station": station.lower(),
        "start_time": start_time,
        "end_time": end_time,
        "sv": sv,
    }


def resolve_parquet_keys(station: str, start_time: datetime, end_time: datetime) -> list[str]:
    """Resolve day-based parquet prefixes covering the full time range."""
    keys: list[str] = []
    day_cursor = start_time.date()
    while day_cursor <= end_time.date():
        keys.append(
            f"{PROCESSED_BASE_PREFIX}/station={{station}}/year={{year}}/doy={{doy:03d}}/".format(
                station=station.lower(),
                year=day_cursor.year,
                doy=day_cursor.timetuple().tm_yday,
            )
        )
        day_cursor = day_cursor + timedelta(days=1)
    return keys


def filter_rows(rows: list[dict], start_time: datetime, end_time: datetime, sv: str | None) -> list[dict]:
    """Filter rows by inclusive epoch range and optional satellite."""
    results = []
    for row in rows:
        epoch_raw = row.get("epoch")
        if epoch_raw is None:
            continue
        if isinstance(epoch_raw, datetime):
            epoch = epoch_raw.astimezone(timezone.utc) if epoch_raw.tzinfo else epoch_raw.replace(
                tzinfo=timezone.utc
            )
        else:
            try:
                epoch = _parse_iso_utc(str(epoch_raw))
            except Exception:
                continue

        if not (start_time <= epoch <= end_time):
            continue
        if sv is not None and str(row.get("sv")) != sv:
            continue
        results.append(row)
    return results


def truncate_results(rows: list[dict], max_rows: int = 2000) -> tuple[list[dict], bool]:
    """Return rows truncated to max_rows and truncation flag."""
    if len(rows) > max_rows:
        return rows[:max_rows], True
    return rows, False


def validate_station_param(station: str) -> str:
    """Validate a 4-character station identifier."""
    normalized = str(station).strip()
    if len(normalized) != 4 or not normalized.isalnum():
        raise ValueError("Invalid station: must be 4 alphanumeric characters")
    return normalized.lower()


def _station_from_filename(filename: str) -> str | None:
    stem = filename.rsplit(".", 1)[0]
    station = stem[:4]
    if len(station) == 4 and station.isalnum():
        return station.lower()
    return None


def ingest_catalog_keys(
    keys: Iterable[str],
    *,
    station_filter: str | None = None,
) -> tuple[set[str], set[tuple[int, int]]]:
    """Extract stations and year/DOY pairs from raw and processed S3 keys."""
    stations: set[str] = set()
    dates: set[tuple[int, int]] = set()
    station_filter = station_filter.lower() if station_filter else None

    for key in keys:
        raw_match = RAW_KEY_RE.match(key)
        if raw_match:
            year = int(raw_match.group("year"))
            doy = int(raw_match.group("doy"))
            station = _station_from_filename(raw_match.group("filename"))
            if station is None:
                continue
            stations.add(station)
            if station_filter is None or station == station_filter:
                dates.add((year, doy))
            continue

        processed_match = PROCESSED_PREFIX_RE.match(key)
        if processed_match:
            station = processed_match.group("station")
            year = int(processed_match.group("year"))
            doy = int(processed_match.group("doy"))
            stations.add(station)
            if station_filter is None or station == station_filter:
                dates.add((year, doy))

    return stations, dates


def list_common_prefixes(s3: Any, bucket: str, prefix: str) -> list[str]:
    """List common prefixes under a bucket prefix using S3 delimiter listing."""
    prefixes: list[str] = []
    continuation: str | None = None
    while True:
        kwargs: dict[str, Any] = {
            "Bucket": bucket,
            "Prefix": prefix,
            "Delimiter": "/",
            "MaxKeys": 1000,
        }
        if continuation:
            kwargs["ContinuationToken"] = continuation
        response = s3.list_objects_v2(**kwargs)
        prefixes.extend(cp["Prefix"] for cp in response.get("CommonPrefixes", []))
        if not response.get("IsTruncated"):
            break
        continuation = response.get("NextContinuationToken")
    return prefixes


def list_s3_keys(s3: Any, bucket: str, prefix: str) -> list[str]:
    """List object keys under a bucket prefix."""
    keys: list[str] = []
    continuation: str | None = None
    while True:
        kwargs: dict[str, Any] = {"Bucket": bucket, "Prefix": prefix, "MaxKeys": 1000}
        if continuation:
            kwargs["ContinuationToken"] = continuation
        response = s3.list_objects_v2(**kwargs)
        keys.extend(obj["Key"] for obj in response.get("Contents", []))
        if not response.get("IsTruncated"):
            break
        continuation = response.get("NextContinuationToken")
    return keys


def list_processed_station_prefixes(s3: Any, bucket: str) -> list[str]:
    """Return processed/tec/station=xxxx/ common prefixes."""
    prefixes: list[str] = []
    continuation: str | None = None
    while True:
        kwargs: dict[str, Any] = {
            "Bucket": bucket,
            "Prefix": f"{PROCESSED_BASE_PREFIX}/station=",
            "Delimiter": "/",
            "MaxKeys": 1000,
        }
        if continuation:
            kwargs["ContinuationToken"] = continuation
        response = s3.list_objects_v2(**kwargs)
        prefixes.extend(cp["Prefix"] for cp in response.get("CommonPrefixes", []))
        if not response.get("IsTruncated"):
            break
        continuation = response.get("NextContinuationToken")
    return prefixes


def list_catalog_stations_processed(s3: Any, bucket: str) -> list[str]:
    """List station identifiers present in processed outputs only."""
    stations: set[str] = set()
    for prefix in list_processed_station_prefixes(s3, bucket):
        match = PROCESSED_STATION_PREFIX_RE.match(prefix)
        if match:
            stations.add(match.group(1))
    return sorted(stations)


def list_catalog_dates_processed(s3: Any, bucket: str, station: str) -> list[tuple[int, int]]:
    """List year/DOY pairs for a station from processed outputs only."""
    station = validate_station_param(station)
    dates: set[tuple[int, int]] = set()
    for key in list_s3_keys(s3, bucket, f"{PROCESSED_BASE_PREFIX}/station={station}/"):
        processed_match = PROCESSED_PREFIX_RE.match(key)
        if processed_match:
            dates.add((int(processed_match.group("year")), int(processed_match.group("doy"))))
    return sorted(dates, key=lambda item: (item[0], item[1]), reverse=True)


def list_catalog_stations(s3: Any, bucket: str) -> list[str]:
    """List station identifiers present in raw ingest and processed outputs."""
    stations: set[str] = set()
    for prefix in list_processed_station_prefixes(s3, bucket):
        match = PROCESSED_STATION_PREFIX_RE.match(prefix)
        if match:
            stations.add(match.group(1))

    latest_doy_prefix: str | None = None
    latest_sort_key = (-1, -1)
    for year_prefix in list_common_prefixes(s3, bucket, "raw/rinexhourly/"):
        year_match = re.match(r"raw/rinexhourly/(\d{4})/", year_prefix)
        if not year_match:
            continue
        year = int(year_match.group(1))
        for doy_prefix in list_common_prefixes(s3, bucket, year_prefix):
            doy_match = re.match(r"raw/rinexhourly/\d{4}/(\d{3})/", doy_prefix)
            if not doy_match:
                continue
            doy = int(doy_match.group(1))
            sort_key = (year, doy)
            if sort_key > latest_sort_key:
                latest_sort_key = sort_key
                latest_doy_prefix = doy_prefix

    if latest_doy_prefix:
        for key in list_s3_keys(s3, bucket, latest_doy_prefix):
            raw_match = RAW_KEY_RE.match(key)
            if not raw_match:
                continue
            station = _station_from_filename(raw_match.group("filename"))
            if station:
                stations.add(station)

    return sorted(stations)


def list_catalog_dates(s3: Any, bucket: str, station: str) -> list[tuple[int, int]]:
    """List year/DOY pairs available for a station in raw and processed data."""
    station = validate_station_param(station)
    dates: set[tuple[int, int]] = set()

    for key in list_s3_keys(s3, bucket, f"{PROCESSED_BASE_PREFIX}/station={station}/"):
        processed_match = PROCESSED_PREFIX_RE.match(key)
        if processed_match:
            dates.add((int(processed_match.group("year")), int(processed_match.group("doy"))))

    station_upper = station.upper()
    for year_prefix in list_common_prefixes(s3, bucket, "raw/rinexhourly/"):
        year_match = re.match(r"raw/rinexhourly/(\d{4})/", year_prefix)
        if not year_match:
            continue
        year = int(year_match.group(1))
        for doy_prefix in list_common_prefixes(s3, bucket, year_prefix):
            doy_match = re.match(r"raw/rinexhourly/\d{4}/(\d{3})/", doy_prefix)
            if not doy_match:
                continue
            doy = int(doy_match.group(1))
            response = s3.list_objects_v2(
                Bucket=bucket,
                Prefix=f"{doy_prefix}{station_upper}",
                MaxKeys=1,
            )
            if response.get("Contents"):
                dates.add((year, doy))

    return sorted(dates, key=lambda item: (item[0], item[1]), reverse=True)
