# Data Contract

This document defines the schemas and key patterns used throughout the platform for inter-component communication, storage, and API responses.

## SQS Message Schema

The processor Lambda container consumes messages from two SQS queues with separate concurrency limits. Message body shapes are the same; routing differs by queue.

### Reprocess_Queue (Reprocess API jobs)

Reprocess_Queue accepts **Shape 1** only — direct payloads from the Reprocess API.

### Process_Queue (S3 ingest notifications)

Process_Queue accepts **Shape 2** and **Shape 3** — S3 event notifications from new raw objects.

### Shape 1 — Reprocess API (direct payload)

Sent by the Reprocess_API Lambda when a job is submitted:

```json
{
  "key": "raw/rinexhourly/2024/150/auck1500.24o",
  "job_id": "uuid-v4",
  "trace_id": "uuid-v4",
  "parameters": {
    "NAV_DAY_OFFSET": 2
  }
}
```

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `key` | String | Yes | Full S3 object key of the raw RINEX file |
| `job_id` | String | Yes | UUID v4 identifying the reprocessing job |
| `trace_id` | String | Yes | UUID v4 for end-to-end correlation |
| `parameters` | Object | No | Override processing parameters (see allowlist below) |

### Shape 2 — S3 Event Notification (ingest-triggered)

Standard AWS S3 event notification forwarded from the S3 bucket to SQS. The processor Lambda container reads `Records[0].s3` from the message body to extract bucket and key.

### Shape 3 — SNS-Wrapped S3 Event

SNS notification wrapping a Shape 2 S3 event in a `Message` field. The processor unwraps and processes as Shape 2.

> S3 `TestEvent` bodies are acknowledged and silently skipped.

### Allowed `parameters` Keys

Only the following parameter names are accepted. Any other key is rejected by the Reprocess API before the message is enqueued.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| `NAV_DAY_OFFSET` | Integer | 1 | Days before observation DOY to fetch nav files |
| `SAVE_PARQUET` | Boolean | true | Write Parquet output |
| `SAVE_CSV` | Boolean | true | Write CSV output |
| `SAVE_JSON` | Boolean | true | Write JSON output |
| `SAVE_STATIC_PLOTS` | Boolean | false | Generate static plot images (.png) |
| `SAVE_INTERACTIVE_PLOTS` | Boolean | false | Generate interactive HTML plots |

## DynamoDB Jobs_Table Schema

The Jobs_Table uses `job_id` as the partition key (no sort key).

| Attribute | Type | Description |
| --- | --- | --- |
| `job_id` (PK) | String | UUID v4 — unique job identifier |
| `station` | String | 4-character alphanumeric GNSS station identifier |
| `year` | Number | 4-digit year (2000–2099) |
| `doy` | Number | Day of year (1–366) |
| `parameters` | Map | Processing parameter overrides submitted with the job |
| `status` | String | One of: `queued`, `processing`, `completed`, `failed` |
| `output_key` | String | S3 key of primary output file (set on completion; extension reflects enabled format) |
| `error_type` | String | Exception class name (set on failure) |
| `error_message` | String | Error details (set on failure) |
| `trace_id` | String | UUID v4 correlation ID |
| `created_at` | String | ISO 8601 UTC timestamp |
| `updated_at` | String | ISO 8601 UTC timestamp |

### Status Lifecycle

```text
queued → processing → completed
                    → failed
```

- **queued** — Job record created, SQS message enqueued
- **processing** — Processor Lambda has started the message
- **completed** — Calibration succeeded, `output_key` populated
- **failed** — Processing failed after retries or DLQ routing

### Catalog Lookup Contract

Catalog endpoints list **processed output only** — stations and dates appear after the processor has written under `processed/tec/`. Raw ingest keys under `raw/rinexhourly/` are not included.

- `GET /catalog`
  - List `processed/tec/station=*/` prefixes
  - Return unique station codes uppercased
- `GET /catalog?station=AUCK`
  - List keys under `processed/tec/station=auck/`
  - Parse `(year, doy)` from processed keys and return unique pairs sorted descending

The Reprocess API resolves raw input keys by listing objects under `raw/rinexhourly/` for the requested station, year, and DOY.

## Output File Formats

The processor writes one or more output formats per input file. All enabled formats share the same partition path and differ only by file extension.

| Format | Extension | Enabled by default |
| --- | --- | --- |
| Parquet (Snappy) | `.parquet` | Yes (`SAVE_PARQUET=true`) |
| CSV | `.csv` | Yes (`SAVE_CSV=true`) |
| JSON (array of rows) | `.json` | Yes (`SAVE_JSON=true`) |
| Static plot | `.png` | No |
| Interactive plot | `.html` | No |

The Query API reads `.parquet` files when `pyarrow` is available in the Lambda runtime. It falls back to `.json` when `pyarrow` is absent. Both formats contain the same 11-column schema.

## Output Data Schema

All data formats (Parquet, CSV, JSON) contain 11 fields:

| Column | Type | Description |
| --- | --- | --- |
| `epoch` | Timestamp | Observation epoch in UTC |
| `sv` | String | Satellite vehicle identifier (e.g., `G01`, `R05`) |
| `id_arc` | Int32 | Arc identifier for continuous signal tracking |
| `lat_ipp` | Float64 / null | IPP latitude in degrees. May be `null` in API responses if the processor produced a non-finite value |
| `lon_ipp` | Float64 / null | IPP longitude in degrees. May be `null` in API responses if the processor produced a non-finite value |
| `azi` | Float64 | Azimuth in degrees |
| `ele` | Float64 | Elevation angle in degrees |
| `bias` | Float64 | Receiver bias estimate |
| `stec` | Float64 | Slant TEC in TECU |
| `vtec` | Float64 | Vertical TEC in TECU |
| `veq` | Float64 | Equivalent vertical TEC |

> **NaN handling:** The processor may emit `NaN` for fields such as `lat_ipp` and `lon_ipp` in edge cases. The Query API sanitizes these to JSON `null` before returning them, ensuring spec-compliant responses.

## S3 Key Patterns

### Raw Ingest Keys

**Pattern:** `raw/rinexhourly/{year}/{doy}/{filename}`

| Component | Format | Example |
| --- | --- | --- |
| `year` | 4-digit integer | `2024` |
| `doy` | 3-digit zero-padded integer | `150` |
| `filename` | Original RINEX filename | `auck1500.24o` |

**Full example:** `raw/rinexhourly/2024/150/auck1500.24o`

### Processed Output Keys

**Pattern:** `processed/tec/station={station}/year={year}/doy={doy}/{source_stem}.{ext}`

| Component | Format | Example |
| --- | --- | --- |
| `station` | 4-character lowercase alphanumeric identifier | `auck` |
| `year` | 4-digit integer | `2024` |
| `doy` | 3-digit zero-padded integer | `150` |
| `source_stem` | Input filename without extension | `auck1500` |
| `ext` | Format extension | `parquet`, `json`, `csv`, `png`, `html` |

**Full examples:**

- `processed/tec/station=auck/year=2024/doy=150/auck1500.parquet`
- `processed/tec/station=auck/year=2024/doy=150/auck1500.json`

### Key Derivation

The output key is deterministically derived from the input key:

1. Parse `raw/rinexhourly/{year}/{doy}/{filename}` to extract year, doy, and filename
2. Extract station (first 4 characters of filename, lowercased)
3. Construct `processed/tec/station={station}/year={year}/doy={doy}/{source_stem}.{ext}` where `source_stem` is the input filename without its extension

This ensures idempotent reprocessing — the same input always produces the same output key per format, allowing safe overwrites.

## Query API Response Schema

### Query Parameters

| Parameter | Required | Description |
| --- | --- | --- |
| `station` | Yes | 4 alphanumeric characters (case-insensitive) |
| `start_time` | Yes | ISO 8601 UTC timestamp |
| `end_time` | Yes | ISO 8601 UTC timestamp (inclusive range, max 7 days) |
| `sv` | No | Satellite filter (e.g. `G01`); recommended for full-day queries on busy stations |

### Query Lambda Environment

| Variable | Default | Description |
| --- | --- | --- |
| `QUERY_MAX_ROWS` | `2000` | Row cap before response serialization |
| `QUERY_READ_WORKERS` | `8` | Parallel S3 read workers per request |

### Success Response (HTTP 200)

```json
{
  "data": [
    {
      "epoch": "2024-05-29T01:00:00Z",
      "sv": "G01",
      "id_arc": 1,
      "lat_ipp": -36.85,
      "lon_ipp": 174.76,
      "azi": 45.2,
      "ele": 30.1,
      "bias": 0.5,
      "stec": 12.3,
      "vtec": 8.7,
      "veq": 9.1
    }
  ],
  "meta": {
    "row_count": 1,
    "truncated": false
  }
}
```

### Meta Object

| Field | Type | Description |
| --- | --- | --- |
| `row_count` | Integer | Number of rows in the `data` array |
| `truncated` | Boolean | `true` if rows were capped by `QUERY_MAX_ROWS` (default 2000) or trimmed to stay under the Lambda synchronous response limit (~5.5 MB JSON body) |

### Catalog Response — Stations (HTTP 200)

`GET /catalog`

```json
{
  "stations": ["AUCK", "AVLN", "WGTN"]
}
```

### Catalog Response — Dates (HTTP 200)

`GET /catalog?station=AUCK`

```json
{
  "dates": [
    { "year": 2024, "doy": 150 },
    { "year": 2024, "doy": 149 }
  ]
}
```

### Error Response (HTTP 400)

```json
{
  "error": "Missing required parameter: station"
}
```

### Error Response (HTTP 404)

```json
{
  "error": "Job not found: {job_id}"
}
```

### Error Response (HTTP 500)

```json
{
  "error": "Internal server error"
}
```

Catalog endpoints return HTTP 500 when `DATA_LAKE_BUCKET` is missing or when S3 listing fails.

## Reprocess API Request Schema

### POST /reprocess

```json
{
  "station": "AUCK",
  "year": 2024,
  "doy": 150,
  "parameters": {
    "NAV_DAY_OFFSET": 2
  }
}
```

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `station` | String | Yes | 4 alphanumeric characters |
| `year` | Integer | Yes | 2000–2099 |
| `doy` | Integer | Yes | 1–366 |
| `parameters` | Object | No | Override parameters (see allowlist in SQS section). Unsupported keys are rejected with HTTP 400. |

### POST /reprocess — Response (HTTP 202)

```json
{
  "job_id": "uuid-v4",
  "status": "queued",
  "trace_id": "uuid-v4"
}
```

### GET /reprocess/{job_id} — Response (HTTP 200)

```json
{
  "job_id": "uuid-v4",
  "station": "AUCK",
  "year": 2024,
  "doy": 150,
  "status": "completed",
  "output_key": "processed/tec/station=auck/year=2024/doy=150/auck1500.parquet",
  "trace_id": "uuid-v4",
  "created_at": "2024-05-29T00:00:00Z",
  "updated_at": "2024-05-29T00:05:00Z"
}
```
