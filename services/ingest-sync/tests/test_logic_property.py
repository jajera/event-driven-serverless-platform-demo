from __future__ import annotations

import random
from datetime import datetime, timedelta, timezone

from ingest_sync.logic import compute_doy_prefixes, compute_rolling_window


def _random_utc_datetime() -> datetime:
    year = random.randint(2000, 2030)
    month = random.randint(1, 12)
    day = random.randint(1, 28)
    hour = random.randint(0, 23)
    minute = random.randint(0, 59)
    second = random.randint(0, 59)
    return datetime(year, month, day, hour, minute, second, tzinfo=timezone.utc)


def test_property_rolling_window():
    for _ in range(200):
        current_utc = _random_utc_datetime()
        lookback_hours = random.randint(1, 168)
        start, end = compute_rolling_window(current_utc, lookback_hours)
        assert end == current_utc
        assert end - start == timedelta(hours=lookback_hours)
        assert start < end


def test_property_doy_prefix_completeness():
    for _ in range(200):
        current_utc = _random_utc_datetime()
        lookback_hours = random.randint(1, 168)
        start, end = compute_rolling_window(current_utc, lookback_hours)
        prefixes = compute_doy_prefixes(current_utc, lookback_hours)
        got = set(prefixes)

        day_cursor = start.date()
        end_date = (end - timedelta(microseconds=1)).date()
        expected = set()
        while day_cursor <= end_date:
            expected.add((day_cursor.year, day_cursor.timetuple().tm_yday))
            day_cursor = day_cursor + timedelta(days=1)

        assert got == expected
