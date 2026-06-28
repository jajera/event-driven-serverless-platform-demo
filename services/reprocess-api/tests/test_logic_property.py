from reprocess_api.logic import validate_reprocess_request


def test_property_reprocess_request_validation():
    test_cases = [
        ("AUCK", 2024, 150, True),
        ("2406", 2024, 150, True),
        ("A1CK", 2024, 150, True),
        ("AUC", 2024, 150, False),
        ("AUCK1", 2024, 150, False),
        ("AB@1", 2024, 150, False),
        ("AUCK", 1999, 150, False),
        ("AUCK", 2100, 150, False),
        ("AUCK", 2024, 0, False),
        ("AUCK", 2024, 367, False),
    ]

    for station, year, doy, should_accept in test_cases:
        body = {"station": station, "year": year, "doy": doy, "parameters": {}}
        if should_accept:
            result = validate_reprocess_request(body)
            assert result["station"] == station.upper()
            assert result["year"] == year
            assert result["doy"] == doy
        else:
            try:
                validate_reprocess_request(body)
            except ValueError:
                continue
            raise AssertionError("Expected ValueError for invalid reprocess request")
