import pytest

from query_api.logic import resolve_parquet_keys, validate_query_params


def test_validate_query_params_valid():
    params = validate_query_params(
        {
            "station": "AUCK",
            "start_time": "2024-05-01T00:00:00Z",
            "end_time": "2024-05-02T00:00:00Z",
            "sv": "G01",
        }
    )
    assert params["station"] == "auck"
    assert params["sv"] == "G01"


@pytest.mark.parametrize("station", ["AUCK", "2406", "A1C2"])
def test_validate_query_params_accepts_alphanumeric_station(station):
    params = validate_query_params(
        {
            "station": station,
            "start_time": "2024-05-01T00:00:00Z",
            "end_time": "2024-05-01T01:00:00Z",
        }
    )
    assert params["station"] == station.lower()


@pytest.mark.parametrize(
    "params",
    [
        {"station": "AUC", "start_time": "2024-05-01T00:00:00Z", "end_time": "2024-05-01T01:00:00Z"},
        {"station": "AB@1", "start_time": "2024-05-01T00:00:00Z", "end_time": "2024-05-01T01:00:00Z"},
        {"station": "AUCK", "start_time": "bad", "end_time": "2024-05-01T01:00:00Z"},
        {"station": "AUCK", "start_time": "2024-05-01T01:00:00Z", "end_time": "2024-05-01T00:00:00Z"},
        {"station": "AUCK", "start_time": "2024-05-01T00:00:00Z", "end_time": "2024-05-09T00:00:01Z"},
    ],
)
def test_validate_query_params_invalid(params):
    with pytest.raises(ValueError):
        validate_query_params(params)


def test_resolve_parquet_keys_cross_day():
    params = validate_query_params(
        {
            "station": "AUCK",
            "start_time": "2024-05-01T23:00:00Z",
            "end_time": "2024-05-02T01:00:00Z",
        }
    )
    keys = resolve_parquet_keys(params["station"], params["start_time"], params["end_time"])
    assert len(keys) == 2
    assert keys[0].startswith("processed/tec/station=auck/year=2024/doy=")
