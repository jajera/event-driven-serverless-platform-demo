from query_api.logic import (
    ingest_catalog_keys,
    list_catalog_dates,
    list_catalog_dates_processed,
    list_catalog_stations,
    list_catalog_stations_processed,
)


class FakeS3Client:
    def __init__(
        self,
        keys: list[str] | None = None,
        common_prefixes: dict[str, list[str]] | None = None,
        station_prefixes: list[str] | None = None,
    ):
        self.keys = keys or []
        self.common_prefixes = common_prefixes or {}
        self.station_prefixes = station_prefixes or []

    def list_objects_v2(self, **kwargs):
        prefix = kwargs.get("Prefix", "")
        delimiter = kwargs.get("Delimiter")
        max_keys = kwargs.get("MaxKeys", 1000)

        if delimiter == "/":
            if prefix == "processed/tec/station=":
                return {
                    "CommonPrefixes": [{"Prefix": item} for item in self.station_prefixes],
                    "IsTruncated": False,
                }
            return {
                "CommonPrefixes": [{"Prefix": item} for item in self.common_prefixes.get(prefix, [])],
                "IsTruncated": False,
            }

        matching = [key for key in self.keys if key.startswith(prefix)]
        if max_keys == 1:
            matching = matching[:1]
        else:
            matching = matching[:max_keys]
        return {
            "Contents": [{"Key": key} for key in matching],
            "IsTruncated": False,
        }


def test_ingest_catalog_keys_from_raw_and_processed():
    keys = [
        "raw/rinexhourly/2026/176/wgtn1760.26o",
        "raw/rinexhourly/2026/176/240600NZL_R_20261760000_01H_30S_MO.rnx.gz",
        "raw/rinexhourly/2026/175/auck1750.26o",
        "processed/tec/station=wgtn/year=2026/doy=174/wgtn1740.parquet",
        "processed/tec/station=2406/year=2026/doy=176/240600NZL_R_20261760000_01H_30S_MO.rnx.parquet",
    ]
    stations, dates = ingest_catalog_keys(keys)
    assert stations == {"wgtn", "auck", "2406"}
    assert dates == {(2026, 176), (2026, 175), (2026, 174)}


def test_ingest_catalog_keys_filters_by_station():
    keys = [
        "raw/rinexhourly/2026/176/wgtn1760.26o",
        "raw/rinexhourly/2026/175/auck1750.26o",
    ]
    _, dates = ingest_catalog_keys(keys, station_filter="wgtn")
    assert dates == {(2026, 176)}


def test_list_catalog_stations_and_dates():
    keys = [
        "raw/rinexhourly/2026/175/WGTN1760.26o",
        "raw/rinexhourly/2026/175/240600NZL_R_20261750000_01H_30S_MO.rnx.gz",
        "raw/rinexhourly/2026/175/AUCK1750.26o",
        "processed/tec/station=wgtn/year=2026/doy=174/wgtn1740.parquet",
        "processed/tec/station=2406/year=2026/doy=175/240600NZL_R_20261750000_01H_30S_MO.rnx.parquet",
    ]
    s3 = FakeS3Client(
        keys=keys,
        common_prefixes={
            "raw/rinexhourly/": ["raw/rinexhourly/2026/"],
            "raw/rinexhourly/2026/": ["raw/rinexhourly/2026/175/"],
        },
        station_prefixes=["processed/tec/station=wgtn/", "processed/tec/station=2406/"],
    )

    assert list_catalog_stations(s3, "lake") == ["2406", "auck", "wgtn"]
    assert list_catalog_dates(s3, "lake", "WGTN") == [(2026, 175), (2026, 174)]
    assert list_catalog_dates(s3, "lake", "2406") == [(2026, 175)]


def test_list_catalog_stations_and_dates_processed_only():
    keys = [
        "processed/tec/station=wgtn/year=2026/doy=174/wgtn1740.parquet",
        "processed/tec/station=2406/year=2026/doy=175/240600NZL_R_20261750000_01H_30S_MO.rnx.parquet",
        "processed/tec/station=2406/year=2026/doy=174/240600NZL_R_20261740000_01H_30S_MO.rnx.parquet",
    ]
    s3 = FakeS3Client(
        keys=keys,
        station_prefixes=["processed/tec/station=wgtn/", "processed/tec/station=2406/"],
    )

    assert list_catalog_stations_processed(s3, "lake") == ["2406", "wgtn"]
    assert list_catalog_dates_processed(s3, "lake", "WGTN") == [(2026, 174)]
    assert list_catalog_dates_processed(s3, "lake", "2406") == [(2026, 175), (2026, 174)]
