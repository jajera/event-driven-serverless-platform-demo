"""Lambda handler for Reprocess API."""

from __future__ import annotations

import json
import os
import time
import uuid
from decimal import Decimal
from typing import Any

try:
    import boto3
except Exception:  # pragma: no cover - local test compatibility
    boto3 = None  # type: ignore[assignment]

from .logic import build_queue_message, build_raw_prefix, key_matches_station, validate_reprocess_request


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


def _to_ddb_value(value: Any) -> dict[str, Any]:
    if value is None:
        return {"NULL": True}
    if isinstance(value, bool):
        return {"BOOL": value}
    if isinstance(value, (int, Decimal)):
        return {"N": str(value)}
    if isinstance(value, str):
        return {"S": value}
    if isinstance(value, dict):
        return {"M": {k: _to_ddb_value(v) for k, v in value.items()}}
    if isinstance(value, list):
        return {"L": [_to_ddb_value(v) for v in value]}
    return {"S": str(value)}


def _from_ddb_value(value: dict[str, Any]) -> Any:
    if "S" in value:
        return value["S"]
    if "N" in value:
        n = value["N"]
        return int(n) if n.isdigit() or (n.startswith("-") and n[1:].isdigit()) else float(n)
    if "BOOL" in value:
        return value["BOOL"]
    if "NULL" in value:
        return None
    if "M" in value:
        return {k: _from_ddb_value(v) for k, v in value["M"].items()}
    if "L" in value:
        return [_from_ddb_value(v) for v in value["L"]]
    return None


def _serialize_ddb_item(item: dict[str, Any]) -> dict[str, Any]:
    return {k: _from_ddb_value(v) for k, v in item.items()}


def _resolve_raw_key(s3: Any, bucket: str, station: str, year: int, doy: int) -> str:
    """Resolve an existing raw key for station/year/doy from S3."""
    prefix = build_raw_prefix(year, doy)
    continuation: str | None = None

    while True:
        kwargs: dict[str, Any] = {"Bucket": bucket, "Prefix": prefix, "MaxKeys": 1000}
        if continuation:
            kwargs["ContinuationToken"] = continuation

        response = s3.list_objects_v2(**kwargs)
        for obj in response.get("Contents", []):
            key = obj.get("Key")
            if isinstance(key, str) and key_matches_station(key, station):
                return key

        if not response.get("IsTruncated"):
            break
        continuation = response.get("NextContinuationToken")

    raise ValueError(f"No raw RINEX file found for station={station}, year={year}, doy={doy}")


def handler(event: dict, context: object) -> dict:
    """Handle POST /reprocess and GET /reprocess/{job_id}."""
    started = time.time()
    request_id = (event.get("requestContext") or {}).get("requestId")
    invocation_trace_id = request_id if isinstance(request_id, str) and request_id else str(uuid.uuid4())
    jobs_table_name = os.getenv("JOBS_TABLE_NAME")
    reprocess_queue_url = os.getenv("REPROCESS_QUEUE_URL")
    data_lake_bucket = event.get("requestContext", {}).get("authorizer", {}).get("data_lake_bucket")
    data_lake_bucket = data_lake_bucket or os.getenv("DATA_LAKE_BUCKET")
    if not jobs_table_name:
        return _response(500, {"error": "Server misconfiguration: JOBS_TABLE_NAME is required"})

    method = event.get("httpMethod", "POST").upper()
    if boto3 is None:
        return _response(500, {"error": "Server misconfiguration: boto3 is required"})
    ddb = boto3.client("dynamodb")
    sqs = boto3.client("sqs")
    s3 = boto3.client("s3")

    if method == "GET":
        job_id = (event.get("pathParameters") or {}).get("job_id")
        if not job_id:
            return _response(400, {"error": "Missing required parameter: job_id"})
        try:
            response = ddb.get_item(TableName=jobs_table_name, Key={"job_id": {"S": job_id}})
            item = response.get("Item")
            if not item:
                print(
                    json.dumps(
                        {
                            "trace_id": invocation_trace_id,
                            "job_id": job_id,
                            "outcome": "not_found",
                            "duration_ms": int((time.time() - started) * 1000),
                        }
                    )
                )
                return _response(404, {"error": f"Job not found: {job_id}"})
            payload = _serialize_ddb_item(item)
            print(
                json.dumps(
                    {
                        "trace_id": invocation_trace_id,
                        "job_id": job_id,
                        "status": payload.get("status"),
                        "outcome": "success",
                        "duration_ms": int((time.time() - started) * 1000),
                    }
                )
            )
            return _response(200, payload)
        except Exception as exc:
            print(
                json.dumps(
                    {
                        "trace_id": invocation_trace_id,
                        "outcome": "error",
                        "error_type": type(exc).__name__,
                        "error_message": str(exc),
                        "duration_ms": int((time.time() - started) * 1000),
                    }
                )
            )
            return _response(500, {"error": "Internal server error"})

    if method != "POST":
        return _response(405, {"error": f"Unsupported method: {method}"})

    if not reprocess_queue_url:
        return _response(500, {"error": "Server misconfiguration: REPROCESS_QUEUE_URL is required"})
    if not data_lake_bucket:
        return _response(500, {"error": "Server misconfiguration: DATA_LAKE_BUCKET is required"})

    body_raw = event.get("body") or "{}"
    try:
        payload = json.loads(body_raw)
        req = validate_reprocess_request(payload)
        raw_key = _resolve_raw_key(s3, data_lake_bucket, req["station"], req["year"], req["doy"])
    except (json.JSONDecodeError, ValueError) as exc:
        return _response(400, {"error": str(exc)})

    job_id = str(uuid.uuid4())
    trace_id = invocation_trace_id
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    job_item = {
        "job_id": job_id,
        "station": req["station"],
        "year": req["year"],
        "doy": req["doy"],
        "parameters": req["parameters"],
        "status": "queued",
        "trace_id": trace_id,
        "created_at": now,
        "updated_at": now,
    }

    try:
        ddb.put_item(
            TableName=jobs_table_name,
            Item={k: _to_ddb_value(v) for k, v in job_item.items()},
            ConditionExpression="attribute_not_exists(job_id)",
        )
        message = build_queue_message(raw_key, req["parameters"], job_id, trace_id)
        sqs.send_message(QueueUrl=reprocess_queue_url, MessageBody=json.dumps(message))
    except Exception as exc:
        # If queue enqueue fails after job creation, transition job to failed.
        try:
            ddb.update_item(
                TableName=jobs_table_name,
                Key={"job_id": {"S": job_id}},
                UpdateExpression=(
                    "SET #status = :status, error_type = :error_type, error_message = :error_message, "
                    "updated_at = :updated_at"
                ),
                ExpressionAttributeNames={"#status": "status"},
                ExpressionAttributeValues={
                    ":status": {"S": "failed"},
                    ":error_type": {"S": type(exc).__name__},
                    ":error_message": {"S": str(exc)},
                    ":updated_at": {"S": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())},
                },
            )
        except Exception:
            pass
        print(
            json.dumps(
                {
                    "trace_id": trace_id,
                    "job_id": job_id,
                    "outcome": "error",
                    "error_type": type(exc).__name__,
                    "error_message": str(exc),
                    "duration_ms": int((time.time() - started) * 1000),
                }
            )
        )
        return _response(500, {"error": "Internal server error"})

    print(
        json.dumps(
            {
                "trace_id": trace_id,
                "job_id": job_id,
                "station": req["station"],
                "year": req["year"],
                "doy": req["doy"],
                "outcome": "success",
                "duration_ms": int((time.time() - started) * 1000),
            }
        )
    )
    return _response(202, {"job_id": job_id, "status": "queued", "trace_id": trace_id})
