import pytest

from reprocess_api.logic import (
    build_queue_message,
    build_raw_prefix,
    key_matches_station,
    validate_reprocess_request,
)


def test_validate_reprocess_request_valid():
    result = validate_reprocess_request(
        {"station": "auck", "year": 2024, "doy": 150, "parameters": {"NAV_DAY_OFFSET": 2}}
    )
    assert result["station"] == "AUCK"
    assert result["year"] == 2024
    assert result["doy"] == 150


@pytest.mark.parametrize("station", ["AUCK", "2406", "A1C2"])
def test_validate_reprocess_request_accepts_alphanumeric_station(station):
    result = validate_reprocess_request(
        {"station": station, "year": 2024, "doy": 150, "parameters": {"NAV_DAY_OFFSET": 2}}
    )
    assert result["station"] == station.upper()


@pytest.mark.parametrize(
    "body",
    [
        {"station": "AUC", "year": 2024, "doy": 1},
        {"station": "AB@1", "year": 2024, "doy": 1},
        {"station": "AUCK", "year": 1999, "doy": 1},
        {"station": "AUCK", "year": 2024, "doy": 0},
        {"station": "AUCK", "year": 2024},
    ],
)
def test_validate_reprocess_request_invalid(body):
    with pytest.raises(ValueError):
        validate_reprocess_request(body)


def test_validate_reprocess_request_rejects_unsupported_parameters():
    with pytest.raises(ValueError, match="Unsupported processing parameters: H_IPP, MIN_ELEVATION"):
        validate_reprocess_request(
            {"station": "AUCK", "year": 2024, "doy": 150, "parameters": {"MIN_ELEVATION": 15, "H_IPP": 350}}
        )


def test_validate_reprocess_request_accepts_allowed_parameters():
    result = validate_reprocess_request(
        {"station": "AUCK", "year": 2024, "doy": 150, "parameters": {"NAV_DAY_OFFSET": 2, "SAVE_JSON": True}}
    )
    assert result["parameters"] == {"NAV_DAY_OFFSET": 2, "SAVE_JSON": True}


@pytest.mark.parametrize(
    "parameters",
    [
        {"NAV_DAY_OFFSET": "2"},
        {"NAV_DAY_OFFSET": True},
        {"SAVE_JSON": "true"},
        {"SAVE_CSV": 1},
    ],
)
def test_validate_reprocess_request_rejects_invalid_parameter_types(parameters):
    with pytest.raises(ValueError):
        validate_reprocess_request(
            {"station": "AUCK", "year": 2024, "doy": 150, "parameters": parameters}
        )


def test_build_raw_prefix():
    assert build_raw_prefix(2024, 150) == "raw/rinexhourly/2024/150/"


def test_key_matches_station():
    assert key_matches_station("raw/rinexhourly/2024/150/AUCK00NZL_R_20241500000_01H_30S_MO.rnx.gz", "AUCK")
    assert not key_matches_station("raw/rinexhourly/2024/150/WGTN00NZL_R_20241500000_01H_30S_MO.rnx.gz", "AUCK")


def test_build_queue_message():
    message = build_queue_message(
        "raw/rinexhourly/2024/150/AUCK00NZL_R_20241500000_01H_30S_MO.rnx.gz",
        {"NAV_DAY_OFFSET": 2},
        "job-1",
        "trace-1",
    )
    assert message["key"].startswith("raw/rinexhourly/2024/150/")
    assert message["job_id"] == "job-1"
    assert message["trace_id"] == "trace-1"
    assert message["parameters"] == {"NAV_DAY_OFFSET": 2}
