import json
from datetime import datetime, timezone

from query_api import handler as query_handler


class FakeS3Client:
    pass


class FakeBoto3:
    def client(self, service_name):
        assert service_name == "s3"
        return FakeS3Client()


def test_query_handler_returns_400_for_bad_params(monkeypatch):
    monkeypatch.setenv("DATA_LAKE_BUCKET", "lake")
    result = query_handler.handler({"queryStringParameters": {"station": "bad"}}, None)
    assert result["statusCode"] == 400


def test_query_handler_returns_200_with_meta(monkeypatch):
    monkeypatch.setenv("DATA_LAKE_BUCKET", "lake")
    monkeypatch.setattr(query_handler, "boto3", FakeBoto3())
    monkeypatch.setattr(query_handler, "_list_data_keys", lambda *_: ["processed/a.parquet"])
    monkeypatch.setattr(
        query_handler,
        "_read_data_rows",
        lambda *_: [{"epoch": "2024-05-01T00:00:00Z", "sv": "G01", "vtec": 1.0}],
    )

    event = {
        "queryStringParameters": {
            "station": "AUCK",
            "start_time": "2024-05-01T00:00:00Z",
            "end_time": "2024-05-01T01:00:00Z",
        }
    }
    result = query_handler.handler(event, None)
    body = json.loads(result["body"])
    assert result["statusCode"] == 200
    assert "data" in body and "meta" in body
    assert body["meta"]["row_count"] == 1
    assert body["meta"]["truncated"] is False


def test_catalog_handler_returns_stations(monkeypatch):
    monkeypatch.setenv("DATA_LAKE_BUCKET", "lake")
    monkeypatch.setattr(query_handler, "boto3", FakeBoto3())
    monkeypatch.setattr(
        query_handler,
        "list_catalog_stations_processed",
        lambda *_, **__: ["2406", "auck", "wgtn"],
    )

    result = query_handler.handler({"path": "/catalog"}, None)
    body = json.loads(result["body"])
    assert result["statusCode"] == 200
    assert body["stations"] == ["2406", "AUCK", "WGTN"]


def test_catalog_handler_returns_dates(monkeypatch):
    monkeypatch.setenv("DATA_LAKE_BUCKET", "lake")
    monkeypatch.setattr(query_handler, "boto3", FakeBoto3())
    monkeypatch.setattr(
        query_handler,
        "list_catalog_dates_processed",
        lambda *_, **__: [(2026, 176), (2026, 175)],
    )

    result = query_handler.handler(
        {"path": "/catalog", "queryStringParameters": {"station": "WGTN"}},
        None,
    )
    body = json.loads(result["body"])
    assert result["statusCode"] == 200
    assert body["dates"] == [{"year": 2026, "doy": 176}, {"year": 2026, "doy": 175}]


def test_catalog_handler_returns_400_for_bad_station(monkeypatch):
    monkeypatch.setenv("DATA_LAKE_BUCKET", "lake")
    result = query_handler.handler(
        {"path": "/catalog", "queryStringParameters": {"station": "bad"}},
        None,
    )
    assert result["statusCode"] == 400


def test_sanitize_row_replaces_nan_and_inf():
    from query_api.handler import _sanitize_row
    import math

    row = {"epoch": "2024-05-01T00:00:00Z", "lat_ipp": float("nan"), "lon_ipp": float("inf"), "vtec": 8.7}
    sanitized = _sanitize_row(row)
    assert sanitized["lat_ipp"] is None
    assert sanitized["lon_ipp"] is None
    assert sanitized["vtec"] == 8.7
    assert sanitized["epoch"] == "2024-05-01T00:00:00Z"


def test_read_data_rows_sanitizes_parquet_non_finite_values(monkeypatch):
    class FakeBody:
        def read(self):
            return b"fake-parquet-bytes"

    class FakeS3:
        def get_object(self, **kwargs):
            return {"Body": FakeBody()}

    class FakeTable:
        @staticmethod
        def to_pylist():
            return [{"lat_ipp": float("nan"), "lon_ipp": float("inf"), "vtec": 3.0}]

    class FakeParquet:
        calls = []

        @staticmethod
        def read_table(*args, **kwargs):
            FakeParquet.calls.append((args, kwargs))
            return FakeTable()

    monkeypatch.setattr(query_handler, "pq", FakeParquet())
    rows = query_handler._read_data_rows(
        FakeS3(),
        "lake",
        "processed/a.parquet",
        datetime(2024, 5, 1, tzinfo=timezone.utc),
        datetime(2024, 5, 2, tzinfo=timezone.utc),
        "G01",
    )
    assert rows == [{"lat_ipp": None, "lon_ipp": None, "vtec": 3.0}]
    _, kwargs = FakeParquet.calls[0]
    assert kwargs["filters"] == [
        ("epoch", ">=", datetime(2024, 5, 1, tzinfo=timezone.utc)),
        ("epoch", "<=", datetime(2024, 5, 2, tzinfo=timezone.utc)),
        ("sv", "=", "G01"),
    ]
    assert "columns" in kwargs


def test_collect_query_rows_stops_at_max_rows(monkeypatch):
    seen_keys: list[str] = []

    def fake_read(_s3, _bucket, key, *_args):
        seen_keys.append(key)
        return [{"epoch": "2024-05-01T00:00:00Z"}] * 2

    monkeypatch.setattr(query_handler, "_read_data_rows", fake_read)
    rows = query_handler._collect_query_rows(
        FakeS3Client(),
        "lake",
        ["k1.parquet", "k2.parquet", "k3.parquet"],
        datetime(2024, 5, 1, tzinfo=timezone.utc),
        datetime(2024, 5, 2, tzinfo=timezone.utc),
        None,
        max_rows=3,
        read_workers=1,
    )
    assert len(rows) >= 3
    assert seen_keys == ["k1.parquet", "k2.parquet"]


def test_query_handler_returns_500_on_internal_error(monkeypatch):
    monkeypatch.setenv("DATA_LAKE_BUCKET", "lake")
    monkeypatch.setattr(query_handler, "boto3", FakeBoto3())
    monkeypatch.setattr(query_handler, "_list_data_keys", lambda *_: (_ for _ in ()).throw(RuntimeError("boom")))

    event = {
        "queryStringParameters": {
            "station": "AUCK",
            "start_time": "2024-05-01T00:00:00Z",
            "end_time": "2024-05-01T01:00:00Z",
        }
    }
    result = query_handler.handler(event, None)
    assert result["statusCode"] == 500


def test_fit_query_payload_shrinks_oversized_response():
    rows = [{"epoch": "2024-05-01T00:00:00Z", "sv": "G01", "payload": "x" * 2000} for _ in range(5000)]
    data, meta = query_handler._fit_query_payload(rows, truncated=True)
    body = json.dumps({"data": data, "meta": meta}, default=str)
    assert len(body.encode("utf-8")) <= query_handler.MAX_RESPONSE_BYTES
    assert meta["truncated"] is True
    assert meta["row_count"] == len(data)
    assert len(data) < len(rows)
