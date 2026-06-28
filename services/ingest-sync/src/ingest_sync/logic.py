"""Pure logic for ingest sync behavior."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone


def compute_rolling_window(current_utc: datetime, lookback_hours: int) -> tuple[datetime, datetime]:
    """Return the half-open [start, end) rolling window in UTC."""
    if current_utc.tzinfo is None:
        current_utc = current_utc.replace(tzinfo=timezone.utc)
    else:
        current_utc = current_utc.astimezone(timezone.utc)
    start = current_utc - timedelta(hours=lookback_hours)
    return start, current_utc


def compute_doy_prefixes(current_utc: datetime, lookback_hours: int) -> list[tuple[int, int]]:
    """Return all (year, doy) pairs overlapping the rolling window."""
    start, end = compute_rolling_window(current_utc, lookback_hours)
    prefixes: list[tuple[int, int]] = []
    seen: set[tuple[int, int]] = set()

    day_cursor = start.date()
    end_date = (end - timedelta(microseconds=1)).date()
    while day_cursor <= end_date:
        year = day_cursor.year
        doy = day_cursor.timetuple().tm_yday
        key = (year, doy)
        if key not in seen:
            prefixes.append(key)
            seen.add(key)
        day_cursor = day_cursor + timedelta(days=1)
    return prefixes


def validate_lookback_hours(value: str | None) -> int:
    """Parse LOOKBACK_HOURS and validate integer range [1, 168]."""
    if value is None:
        raise ValueError("LOOKBACK_HOURS is required")
    try:
        parsed = int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError("LOOKBACK_HOURS must be an integer") from exc
    if parsed < 1 or parsed > 168:
        raise ValueError("LOOKBACK_HOURS must be between 1 and 168")
    return parsed


def derive_raw_key(year: int, doy: int, filename: str) -> str:
    """Return canonical raw key path."""
    return f"raw/rinexhourly/{year}/{doy:03d}/{filename}"
