import os

import pytest

from ingest_sync import handler as ingest_handler

class FakeS3Client:
    def __init__(self):
        self.copy_calls = []
        self.dest_list_calls = 0

    def list_objects_v2(self, **kwargs):
        prefix = kwargs.get("Prefix")
        token = kwargs.get("ContinuationToken")
        if prefix == "raw/rinexhourly/2024/150/":
            self.dest_list_calls += 1
            return {
                "Contents": [{"Key": "raw/rinexhourly/2024/150/file_exists.24o"}],
                "IsTruncated": False,
            }
        if prefix == "gnss/rinexhourly/2024/150/" and token is None:
            return {
                "Contents": [
                    {"Key": "gnss/rinexhourly/2024/150/file_exists.24o"},
                    {"Key": "gnss/rinexhourly/2024/150/file_copy_ok.24o"},
                ],
                "IsTruncated": True,
                "NextContinuationToken": "next",
            }
        if prefix == "gnss/rinexhourly/2024/150/" and token == "next":
            return {
                "Contents": [{"Key": "gnss/rinexhourly/2024/150/file_copy_fail.24o"}],
                "IsTruncated": False,
            }
        return {"Contents": [], "IsTruncated": False}

    def copy_object(self, **kwargs):
        self.copy_calls.append(kwargs["Key"])
        if kwargs["Key"].endswith("file_copy_fail.24o"):
            raise RuntimeError("copy failed")
        return {"ETag": "ok"}


class FakeBoto3:
    def __init__(self, s3_client):
        self._s3 = s3_client

    def client(self, service_name):
        assert service_name == "s3"
        return self._s3


def test_ingest_handler_continues_on_copy_errors(monkeypatch):
    fake_s3 = FakeS3Client()
    monkeypatch.setenv("DATA_LAKE_BUCKET", "target-bucket")
    monkeypatch.setenv("SOURCE_BUCKET", "source-bucket")
    monkeypatch.setenv("SOURCE_PREFIX", "gnss/rinexhourly")
    monkeypatch.setenv("LOOKBACK_HOURS", "2")
    monkeypatch.setattr(ingest_handler, "compute_doy_prefixes", lambda *_: [(2024, 150)])
    monkeypatch.setattr(ingest_handler, "boto3", FakeBoto3(fake_s3))

    result = ingest_handler.handler({}, None)

    assert result["synced"] == 1
    assert result["skipped"] == 1
    assert result["errors"] == 1
    assert result["prefixes_scanned"] == ["2024/150/"]
    assert len(fake_s3.copy_calls) == 2
    assert fake_s3.dest_list_calls == 1


def test_ingest_handler_requires_target_bucket(monkeypatch):
    if "DATA_LAKE_BUCKET" in os.environ:
        monkeypatch.delenv("DATA_LAKE_BUCKET")
    with pytest.raises(ValueError):
        ingest_handler.handler({}, None)
