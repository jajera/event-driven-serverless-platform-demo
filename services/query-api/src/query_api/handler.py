"""Lambda handler for Query API."""

from __future__ import annotations

import json
import math
import os
import time
import uuid
from datetime import datetime
from io import BytesIO
from typing import Any

from concurrent.futures import ThreadPoolExecutor

try:
    import boto3
except Exception:  # pragma: no cover - local test compatibility
    boto3 = None  # type: ignore[assignment]

try:
    import pyarrow.parquet as pq
except Exception:  # pragma: no cover - import guard for non-lambda environments
    pq = None  # type: ignore[assignment]

from .logic import (
    filter_rows,
    list_catalog_dates_processed,
    list_catalog_stations_processed,
    resolve_parquet_keys,
    truncate_results,
    validate_query_params,
    validate_station_param,
)


def _sanitize_row(row: dict[str, Any]) -> dict[str, Any]:
    """Replace any non-finite float values (NaN/Inf) with None so the JSON response is spec-compliant."""
    result: dict[str, Any] = {}
    for k, v in row.items():
        if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
            result[k] = None
        else:
            result[k] = v
    return result


def _response(status_code: int, payload: dict[str, Any]) -> dict[str, Any]:
    headers = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": os.getenv("CORS_ALLOW_ORIGIN", "*"),
        "Access-Control-Allow-Headers": "Content-Type",
    }
    return {
        "statusCode": status_code,
        "headers": headers,
        "body": json.dumps(payload, default=str),
    }


def _list_data_keys(s3: Any, bucket: str, prefixes: list[str]) -> list[str]:
    keys_by_stem: dict[str, str] = {}
    parquet_supported = pq is not None
    for prefix in prefixes:
        continuation: str | None = None
        while True:
            kwargs: dict[str, Any] = {"Bucket": bucket, "Prefix": prefix, "MaxKeys": 1000}
            if continuation:
                kwargs["ContinuationToken"] = continuation
            response = s3.list_objects_v2(**kwargs)
            for obj in response.get("Contents", []):
                key = obj["Key"]
                if not (key.endswith(".parquet") or key.endswith(".json")):
                    continue
                if key.endswith(".parquet") and not parquet_supported:
                    continue
                stem = key.rsplit(".", 1)[0]
                current = keys_by_stem.get(stem)
                if current is None:
                    keys_by_stem[stem] = key
                    continue

                # Prefer parquet when it is supported, otherwise keep json fallback.
                if parquet_supported and current.endswith(".json") and key.endswith(".parquet"):
                    keys_by_stem[stem] = key
            if not response.get("IsTruncated"):
                break
            continuation = response.get("NextContinuationToken")
    return sorted(keys_by_stem.values())


QUERY_COLUMNS = [
    "epoch",
    "sv",
    "id_arc",
    "lat_ipp",
    "lon_ipp",
    "azi",
    "ele",
    "bias",
    "stec",
    "vtec",
    "veq",
]


def _read_data_rows(
    s3: Any,
    bucket: str,
    key: str,
    start_time: datetime,
    end_time: datetime,
    sv: str | None,
) -> list[dict[str, Any]]:
    response = s3.get_object(Bucket=bucket, Key=key)
    body = response["Body"].read()
    if not body:
        return []
    if key.endswith(".json"):
        parsed = json.loads(body.decode("utf-8"))
        if isinstance(parsed, list):
            rows = [row for row in parsed if isinstance(row, dict)]
        elif isinstance(parsed, dict) and isinstance(parsed.get("data"), list):
            rows = [row for row in parsed["data"] if isinstance(row, dict)]
        else:
            return []
        rows = [_sanitize_row(row) for row in rows]
        return filter_rows(rows, start_time, end_time, sv)
    if pq is None:
        raise RuntimeError("pyarrow is required to read parquet files")

    filters: list[tuple[str, str, Any]] = [
        ("epoch", ">=", start_time),
        ("epoch", "<=", end_time),
    ]
    if sv is not None:
        filters.append(("sv", "=", sv))
    try:
        table = pq.read_table(BytesIO(body), columns=QUERY_COLUMNS, filters=filters)
        return [_sanitize_row(row) for row in table.to_pylist()]
    except Exception:
        # Fall back to compatibility mode when parquet schema/types cannot satisfy pushdown.
        table = pq.read_table(BytesIO(body), columns=QUERY_COLUMNS)
        rows = [_sanitize_row(row) for row in table.to_pylist()]
        return filter_rows(rows, start_time, end_time, sv)


def _collect_query_rows(
    s3: Any,
    bucket: str,
    data_keys: list[str],
    start_time: datetime,
    end_time: datetime,
    sv: str | None,
    max_rows: int,
    read_workers: int,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    if not data_keys:
        return rows
    workers = max(1, read_workers)
    for start_idx in range(0, len(data_keys), workers):
        batch_keys = data_keys[start_idx : start_idx + workers]
        with ThreadPoolExecutor(max_workers=min(workers, len(batch_keys))) as executor:
            future_by_key = {
                key: executor.submit(_read_data_rows, s3, bucket, key, start_time, end_time, sv)
                for key in batch_keys
            }
            for key in batch_keys:
                rows.extend(future_by_key[key].result())
                if len(rows) >= max_rows:
                    return rows
    return rows


def _is_catalog_request(event: dict) -> bool:
    path = (event.get("path") or "").rstrip("/")
    return path.endswith("/catalog") or path == "/catalog"


def _invocation_trace_id(event: dict) -> str:
    request_id = (event.get("requestContext") or {}).get("requestId")
    if isinstance(request_id, str) and request_id:
        return request_id
    return str(uuid.uuid4())


def _handle_catalog(event: dict, trace_id: str) -> dict:
    params = event.get("queryStringParameters") or {}
    bucket = event.get("requestContext", {}).get("authorizer", {}).get("data_lake_bucket")
    bucket = bucket or os.getenv("DATA_LAKE_BUCKET")
    if not bucket:
        return _response(500, {"error": "Server misconfiguration: DATA_LAKE_BUCKET is required"})

    station = params.get("station")
    started = time.time()
    try:
        if station:
            station = validate_station_param(station)
        if boto3 is None:
            raise RuntimeError("boto3 is required")
        s3 = boto3.client("s3")
        if station:
            dates = list_catalog_dates_processed(s3, bucket, station)
            print(
                json.dumps(
                    {
                        "trace_id": trace_id,
                        "outcome": "success",
                        "operation": "catalog_dates",
                        "station": station.upper(),
                        "row_count": len(dates),
                        "duration_ms": int((time.time() - started) * 1000),
                    }
                )
            )
            return _response(
                200,
                {"dates": [{"year": year, "doy": doy} for year, doy in dates]},
            )
        stations = list_catalog_stations_processed(s3, bucket)
        print(
            json.dumps(
                {
                    "trace_id": trace_id,
                    "outcome": "success",
                    "operation": "catalog_stations",
                    "row_count": len(stations),
                    "duration_ms": int((time.time() - started) * 1000),
                }
            )
        )
        return _response(200, {"stations": [item.upper() for item in stations]})
    except ValueError as exc:
        return _response(400, {"error": str(exc)})
    except Exception as exc:
        print(
            json.dumps(
                {
                    "trace_id": trace_id,
                    "outcome": "error",
                    "operation": "catalog",
                    "duration_ms": int((time.time() - started) * 1000),
                    "error_type": type(exc).__name__,
                    "error_message": str(exc),
                }
            )
        )
        return _response(500, {"error": "Internal server error"})


MAX_RESPONSE_BYTES = 5_500_000  # Lambda synchronous invoke payload limit is 6 MB.


def _fit_query_payload(data: list[dict[str, Any]], truncated: bool) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Shrink row payload until the JSON body fits Lambda/API Gateway limits."""
    meta_truncated = truncated
    while data:
        payload = {
            "data": data,
            "meta": {
                "row_count": len(data),
                "truncated": meta_truncated,
            },
        }
        if len(json.dumps(payload, default=str).encode("utf-8")) <= MAX_RESPONSE_BYTES:
            return data, payload["meta"]
        data = data[: max(1, (len(data) * 3) // 4)]
        meta_truncated = True
    return [], {"row_count": 0, "truncated": meta_truncated}


def handler(event: dict, context: object) -> dict:
    """Query processed parquet data from S3 and return filtered rows."""
    trace_id = _invocation_trace_id(event)
    if _is_catalog_request(event):
        return _handle_catalog(event, trace_id)

    params = event.get("queryStringParameters") or {}
    bucket = event.get("requestContext", {}).get("authorizer", {}).get("data_lake_bucket")
    bucket = bucket or os.getenv("DATA_LAKE_BUCKET")
    if not bucket:
        return _response(500, {"error": "Server misconfiguration: DATA_LAKE_BUCKET is required"})

    try:
        normalized = validate_query_params(params)
    except ValueError as exc:
        return _response(400, {"error": str(exc)})

    started = time.time()
    try:
        if boto3 is None:
            raise RuntimeError("boto3 is required")
        s3 = boto3.client("s3")
        max_rows = int(os.getenv("QUERY_MAX_ROWS", "2000"))
        read_workers = int(os.getenv("QUERY_READ_WORKERS", "8"))
        prefixes = resolve_parquet_keys(normalized["station"], normalized["start_time"], normalized["end_time"])
        data_keys = _list_data_keys(s3, bucket, prefixes)
        rows = _collect_query_rows(
            s3,
            bucket,
            data_keys,
            normalized["start_time"],
            normalized["end_time"],
            normalized["sv"],
            max_rows,
            read_workers,
        )
        data, truncated = truncate_results(rows, max_rows)
        data, meta = _fit_query_payload(data, truncated)
        print(
            json.dumps(
                {
                    "trace_id": trace_id,
                    "outcome": "success",
                    "operation": "query",
                    "station": normalized["station"].upper(),
                    "row_count": meta["row_count"],
                    "truncated": meta["truncated"],
                    "duration_ms": int((time.time() - started) * 1000),
                }
            )
        )
        return _response(
            200,
            {
                "data": data,
                "meta": meta,
            },
        )
    except Exception as exc:
        print(
            json.dumps(
                {
                    "trace_id": trace_id,
                    "outcome": "error",
                    "operation": "query",
                    "error_type": type(exc).__name__,
                    "error_message": str(exc),
                    "duration_ms": int((time.time() - started) * 1000),
                }
            )
        )
        return _response(500, {"error": "Internal server error"})
