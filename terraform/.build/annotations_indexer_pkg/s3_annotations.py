"""S3 object annotation helpers (requires boto3 >= 1.43 with S3 Annotations API)."""

from __future__ import annotations

import json
from typing import Any


def _annotation_payload_bytes(payload: dict[str, Any] | str) -> bytes:
    if isinstance(payload, str):
        return payload.encode("utf-8")
    return json.dumps(payload).encode("utf-8")


def put_object_annotation(
    client,
    *,
    bucket: str,
    key: str,
    name: str,
    payload: dict[str, Any] | str,
) -> None:
    """Create or replace an S3 object annotation."""
    client.put_object_annotation(
        Bucket=bucket,
        Key=key,
        AnnotationName=name,
        AnnotationPayload=_annotation_payload_bytes(payload),
    )


def get_object_annotation(client, *, bucket: str, key: str, name: str) -> str:
    """Return annotation payload as a UTF-8 string."""
    response = client.get_object_annotation(
        Bucket=bucket,
        Key=key,
        AnnotationName=name,
    )
    payload = response["AnnotationPayload"]
    if hasattr(payload, "read"):
        return payload.read().decode("utf-8")
    if isinstance(payload, bytes):
        return payload.decode("utf-8")
    return str(payload or "{}")
