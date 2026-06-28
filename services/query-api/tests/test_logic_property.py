from __future__ import annotations

import random
from datetime import datetime, timedelta, timezone

from query_api.logic import filter_rows, truncate_results, validate_query_params


def _random_utc_datetime() -> datetime:
    year = random.randint(2000, 2030)
    month = random.randint(1, 12)
    day = random.randint(1, 28)
    hour = random.randint(0, 23)
    minute = random.randint(0, 59)
    second = random.randint(0, 59)
    return datetime(year, month, day, hour, minute, second, tzinfo=timezone.utc)


def test_property_query_time_range_filtering():
    for _ in range(200):
        start = _random_utc_datetime()
        end = start + timedelta(hours=random.randint(0, 72))
        rows = [
            {"epoch": (start - timedelta(seconds=1)).isoformat().replace("+00:00", "Z"), "sv": "G01"},
            {"epoch": start.isoformat().replace("+00:00", "Z"), "sv": "G01"},
            {"epoch": end.isoformat().replace("+00:00", "Z"), "sv": "G02"},
            {"epoch": (end + timedelta(seconds=1)).isoformat().replace("+00:00", "Z"), "sv": "G01"},
        ]
        filtered = filter_rows(rows, start, end, None)
        assert len(filtered) == 2
        assert all(start <= datetime.fromisoformat(r["epoch"].replace("Z", "+00:00")) <= end for r in filtered)

        filtered_sv = filter_rows(rows, start, end, "G01")
        assert len(filtered_sv) == 1
        assert filtered_sv[0]["sv"] == "G01"


def test_property_query_missing_parameter_rejection():
    for missing_key in ("station", "start_time", "end_time"):
        params = {
            "station": "AUCK",
            "start_time": "2024-05-01T00:00:00Z",
            "end_time": "2024-05-01T01:00:00Z",
        }
        params.pop(missing_key)
        try:
            validate_query_params(params)
        except ValueError as exc:
            assert missing_key in str(exc)
            continue
        raise AssertionError("Expected ValueError for missing required parameter")


def test_property_query_malformed_parameter_rejection_station():
    bad_stations = ["", "A", "AUC", "AUCK1", "AB@1", "A C1"]
    for bad_station in bad_stations:
        params = {
            "station": bad_station,
            "start_time": "2024-05-01T00:00:00Z",
            "end_time": "2024-05-01T01:00:00Z",
        }
        try:
            validate_query_params(params)
        except ValueError:
            continue
        raise AssertionError("Expected ValueError for malformed station")


def test_property_result_truncation():
    for size in [0, 1, 100, 9999, 10000, 10001, 15000]:
        rows = [{"idx": i} for i in range(size)]
        truncated_rows, is_truncated = truncate_results(rows, 10000)
        assert len(truncated_rows) <= 10000
        assert is_truncated == (size > 10000)
        if size > 10000:
            assert truncated_rows == rows[:10000]
        else:
            assert truncated_rows == rows
