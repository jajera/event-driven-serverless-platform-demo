"""Lambda handler for processed object S3 annotation indexing."""

from __future__ import annotations

import json
import os
import re
import time
import urllib.parse
import uuid
from typing import Any

try:
    import boto3
except Exception:  # pragma: no cover - local test compatibility
    boto3 = None  # type: ignore[assignment]

from s3_annotations import put_object_annotation

PROCESSED_KEY_RE = re.compile(
    r"^processed/tec/station=(?P<station>[a-z0-9]{4})/year=(?P<year>\d{4})/doy=(?P<doy>\d{3})/(?P<filename>[^/]+)$"
)
ANNOTATABLE_SUFFIXES = (".parquet", ".json")
SCHEMA_VERSION = "1"


def _parse_processed_key(key: str) -> dict[str, Any] | None:
    match = PROCESSED_KEY_RE.match(key)
    if not match:
        return None
    if not key.endswith(ANNOTATABLE_SUFFIXES):
        return None
    return {
        "station": match.group("station"),
        "year": int(match.group("year")),
        "doy": int(match.group("doy")),
        "filename": match.group("filename"),
    }


def _annotation_payload(parsed: dict[str, Any], key: str, content_type: str | None) -> dict[str, Any]:
    return {
        "schema_version": SCHEMA_VERSION,
        "dataset": "processed",
        "station": parsed["station"],
        "year": parsed["year"],
        "doy": parsed["doy"],
        "key": key,
        "content_type": content_type or "unknown",
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }


def handler(event: dict, context: object) -> dict:
    """Write S3 object annotations for newly created processed outputs."""
    trace_id = str(uuid.uuid4())
    bucket = os.getenv("DATA_LAKE_BUCKET")
    namespace = os.getenv("ANNOTATION_NAMESPACE", "processed-metadata")
    if not bucket:
        raise RuntimeError("DATA_LAKE_BUCKET is required")
    if boto3 is None:
        raise RuntimeError("boto3 is required")

    s3 = boto3.client("s3")
    indexed = 0
    skipped = 0
    failures = 0
    started = time.time()

    for record in event.get("Records", []):
        if record.get("eventSource") != "aws:s3":
            skipped += 1
            continue
        s3_info = record.get("s3") or {}
        record_bucket = s3_info.get("bucket", {}).get("name")
        key = urllib.parse.unquote_plus(s3_info.get("object", {}).get("key", ""))
        if record_bucket != bucket or not key:
            skipped += 1
            continue

        parsed = _parse_processed_key(key)
        if parsed is None:
            skipped += 1
            continue

        content_type = (record.get("s3", {}).get("object") or {}).get("contentType")
        payload = _annotation_payload(parsed, key, content_type if isinstance(content_type, str) else None)
        try:
            put_object_annotation(
                s3,
                bucket=bucket,
                key=key,
                name=namespace,
                payload=payload,
            )
            indexed += 1
        except Exception as exc:
            failures += 1
            print(
                json.dumps(
                    {
                        "outcome": "error",
                        "trace_id": trace_id,
                        "operation": "annotate_object",
                        "key": key,
                        "error_type": type(exc).__name__,
                        "error_message": str(exc),
                    }
                )
            )

    print(
        json.dumps(
            {
                "outcome": "success" if failures == 0 else "partial",
                "trace_id": trace_id,
                "operation": "annotate_batch",
                "indexed": indexed,
                "skipped": skipped,
                "failures": failures,
                "duration_ms": int((time.time() - started) * 1000),
            }
        )
    )
    if failures > 0:
        raise RuntimeError(f"annotation failures: {failures}")
    return {"indexed": indexed, "skipped": skipped, "failures": failures}
