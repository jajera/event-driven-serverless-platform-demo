"""Pure logic for Reprocess API."""

from __future__ import annotations

try:
    from processor_parameters import ALLOWED_PROCESSOR_PARAMETERS
except ImportError:  # pragma: no cover - Lambda zip includes local source only
    ALLOWED_PROCESSOR_PARAMETERS: frozenset[str] = frozenset(
        {
            "NAV_DAY_OFFSET",
            "SAVE_PARQUET",
            "SAVE_CSV",
            "SAVE_JSON",
            "SAVE_STATIC_PLOTS",
            "SAVE_INTERACTIVE_PLOTS",
        }
    )


def validate_reprocess_request(body: dict) -> dict:
    """Validate station/year/doy and optional processing parameters payload."""
    for key in ("station", "year", "doy"):
        if key not in body:
            raise ValueError(f"Missing required parameter: {key}")

    station = str(body["station"]).strip()
    if len(station) != 4 or not station.isalnum():
        raise ValueError("Invalid station: must be 4 alphanumeric characters")

    year = body["year"]
    if not isinstance(year, int) or isinstance(year, bool) or year < 2000 or year > 2099:
        raise ValueError("Invalid year: must be integer in range 2000-2099")

    doy = body["doy"]
    if not isinstance(doy, int) or isinstance(doy, bool) or doy < 1 or doy > 366:
        raise ValueError("Invalid doy: must be integer in range 1-366")

    parameters = body.get("parameters", {})
    if parameters is None:
        parameters = {}
    if not isinstance(parameters, dict):
        raise ValueError("Invalid parameters: must be an object")

    unsupported = sorted(k for k in parameters if k not in ALLOWED_PROCESSOR_PARAMETERS)
    if unsupported:
        raise ValueError(f"Unsupported processing parameters: {', '.join(unsupported)}")

    if "NAV_DAY_OFFSET" in parameters:
        nav_day_offset = parameters["NAV_DAY_OFFSET"]
        if not isinstance(nav_day_offset, int) or isinstance(nav_day_offset, bool):
            raise ValueError("Invalid NAV_DAY_OFFSET: must be an integer")

    for key in ("SAVE_PARQUET", "SAVE_CSV", "SAVE_JSON", "SAVE_STATIC_PLOTS", "SAVE_INTERACTIVE_PLOTS"):
        if key in parameters and not isinstance(parameters[key], bool):
            raise ValueError(f"Invalid {key}: must be a boolean")

    return {
        "station": station.upper(),
        "year": year,
        "doy": doy,
        "parameters": parameters,
    }


def build_raw_prefix(year: int, doy: int) -> str:
    """Build the raw S3 prefix for a specific year/day."""
    return f"raw/rinexhourly/{year}/{doy:03d}/"


def key_matches_station(key: str, station: str) -> bool:
    """Return True when a raw key's filename belongs to the station."""
    filename = key.rsplit("/", 1)[-1]
    return filename[:4].upper() == station.upper()


def build_queue_message(raw_key: str, params: dict, job_id: str, trace_id: str) -> dict:
    """Build SQS body for processor queue consumption."""
    return {
        "key": raw_key,
        "job_id": job_id,
        "trace_id": trace_id,
        "parameters": params or {},
    }
