import pytest

from ingest_sync.logic import derive_raw_key, validate_lookback_hours


@pytest.mark.parametrize(
    "value,expected",
    [
        ("1", 1),
        ("168", 168),
        ("8", 8),
    ],
)
def test_validate_lookback_hours_valid(value, expected):
    assert validate_lookback_hours(value) == expected


@pytest.mark.parametrize("value", [None, "", "0", "169", "-1", "abc", "3.14"])
def test_validate_lookback_hours_invalid(value):
    with pytest.raises(ValueError):
        validate_lookback_hours(value)


def test_derive_raw_key():
    assert derive_raw_key(2024, 5, "auck0050.24o") == "raw/rinexhourly/2024/005/auck0050.24o"
