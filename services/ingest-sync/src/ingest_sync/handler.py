"""Lambda handler for ingest sync."""

from __future__ import annotations

import json
import os
import time
import uuid
from datetime import datetime, timezone
from typing import Any

try:
    import boto3
except Exception:  # pragma: no cover - local test compatibility
    boto3 = None  # type: ignore[assignment]

from .logic import compute_doy_prefixes, derive_raw_key, validate_lookback_hours


def _log(payload: dict[str, Any]) -> None:
    print(json.dumps(payload, default=str))


def _list_existing_raw_filenames(s3_client: Any, bucket: str, prefix: str) -> set[str]:
    filenames: set[str] = set()
    continuation_token: str | None = None
    while True:
        list_args: dict[str, Any] = {
            "Bucket": bucket,
            "Prefix": prefix,
            "MaxKeys": 1000,
        }
        if continuation_token:
            list_args["ContinuationToken"] = continuation_token
        response = s3_client.list_objects_v2(**list_args)
        for obj in response.get("Contents", []):
            key = obj.get("Key", "")
            if not isinstance(key, str) or not key:
                continue
            filenames.add(key.rsplit("/", 1)[-1])
        if not response.get("IsTruncated"):
            break
        continuation_token = response.get("NextContinuationToken")
    return filenames


def handler(event: dict, context: object) -> dict:
    """Synchronize recent source files into raw data-lake prefix."""
    trace_id = str(uuid.uuid4())
    started = time.time()
    source_bucket = os.getenv("SOURCE_BUCKET", "geonet-open-data")
    source_prefix = os.getenv("SOURCE_PREFIX", "gnss/rinexhourly/")
    data_lake_bucket = os.getenv("DATA_LAKE_BUCKET")

    if not data_lake_bucket:
        _log({"trace_id": trace_id, "outcome": "error", "error_message": "DATA_LAKE_BUCKET is required"})
        raise ValueError("DATA_LAKE_BUCKET is required")

    lookback_hours = validate_lookback_hours(os.getenv("LOOKBACK_HOURS", "2"))
    now = datetime.now(timezone.utc)
    prefixes = compute_doy_prefixes(now, lookback_hours)

    if boto3 is None:
        raise RuntimeError("boto3 is required")
    s3 = boto3.client("s3")
    synced = 0
    skipped = 0
    errors = 0
    prefixes_scanned: list[str] = []

    for year, doy in prefixes:
        relative_prefix = f"{year}/{doy:03d}/"
        prefixes_scanned.append(relative_prefix)
        list_prefix = f"{source_prefix.rstrip('/')}/{relative_prefix}"
        raw_prefix = f"raw/rinexhourly/{relative_prefix}"
        existing_filenames = _list_existing_raw_filenames(s3, data_lake_bucket, raw_prefix)

        continuation_token: str | None = None
        while True:
            try:
                list_args: dict[str, Any] = {
                    "Bucket": source_bucket,
                    "Prefix": list_prefix,
                    "MaxKeys": 1000,
                }
                if continuation_token:
                    list_args["ContinuationToken"] = continuation_token
                response = s3.list_objects_v2(**list_args)
            except Exception as exc:
                errors += 1
                _log(
                    {
                        "trace_id": trace_id,
                        "outcome": "error",
                        "error_type": type(exc).__name__,
                        "error_message": str(exc),
                        "prefix": list_prefix,
                    }
                )
                break

            for obj in response.get("Contents", []):
                source_key = obj["Key"]
                filename = source_key.rsplit("/", 1)[-1]
                raw_key = derive_raw_key(year, doy, filename)

                try:
                    if filename in existing_filenames:
                        skipped += 1
                        continue

                    s3.copy_object(
                        Bucket=data_lake_bucket,
                        Key=raw_key,
                        CopySource={"Bucket": source_bucket, "Key": source_key},
                    )
                    synced += 1
                    existing_filenames.add(filename)
                except Exception as exc:
                    errors += 1
                    _log(
                        {
                            "trace_id": trace_id,
                            "outcome": "error",
                            "error_type": type(exc).__name__,
                            "error_message": str(exc),
                            "source_key": source_key,
                            "target_key": raw_key,
                        }
                    )

            if not response.get("IsTruncated"):
                break
            continuation_token = response.get("NextContinuationToken")

    result = {
        "trace_id": trace_id,
        "outcome": "success" if errors == 0 else "partial",
        "synced": synced,
        "skipped": skipped,
        "errors": errors,
        "prefixes_scanned": prefixes_scanned,
        "duration_ms": int((time.time() - started) * 1000),
    }
    _log(result)
    return {
        "synced": synced,
        "skipped": skipped,
        "errors": errors,
        "prefixes_scanned": prefixes_scanned,
    }
