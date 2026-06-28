# Implementation Plan: Event-Driven Serverless Platform Demo

## Overview

This plan implements a consolidated AWS event-driven serverless platform for GNSS RINEX data ingestion, PyTECGg TEC calibration, and interactive visualization. Tasks are ordered so that pure logic functions come first (enabling property-based testing), followed by infrastructure provisioning, integration wiring, frontend, and finally documentation and CI.

## Tasks

- [x] 1. Implement Ingest_Sync_Lambda pure logic functions
  - [x] 1.1 Create `services/ingest-sync/` project structure with `pyproject.toml`, `src/ingest_sync/` package, and `tests/` directory
    - Initialize Python 3.14 project with pytest and hypothesis as dev dependencies
    - Create `src/ingest_sync/__init__.py`, `src/ingest_sync/handler.py`, `src/ingest_sync/logic.py`
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [x] 1.2 Implement `compute_rolling_window`, `compute_doy_prefixes`, `validate_lookback_hours`, and `derive_raw_key` in `src/ingest_sync/logic.py`
    - `compute_rolling_window(current_utc, lookback_hours)` returns half-open [start, end) interval
    - `compute_doy_prefixes(current_utc, lookback_hours)` returns list of (year, doy) tuples covering the window
    - `validate_lookback_hours(value)` parses and validates LOOKBACK_HOURS (1–168 range)
    - `derive_raw_key(year, doy, filename)` returns canonical S3 key
    - _Requirements: 1.2, 1.3, 1.4, 2.2_

  - [x] 1.3 Write property tests for Ingest_Sync_Lambda pure logic
    - **Property 1: Rolling Window Computation** — validate [start, end) interval correctness for all valid datetime/lookback combinations
    - **Property 2: DOY Prefix Completeness** — validate every UTC calendar day overlapping the window is included and no extras
    - **Validates: Requirements 1.2, 1.3**

  - [x] 1.4 Write unit tests for `validate_lookback_hours` and `derive_raw_key`
    - Test boundary values (1, 168), invalid inputs (0, 169, non-integer, missing)
    - Test raw key derivation with known inputs/outputs
    - _Requirements: 1.4, 2.2_

- [x] 2. Processor_Lambda — container image deployed from `terraform/modules/processing` (source and tests live outside this monorepo)
  - _Requirements: 6.1–6.9, 7.1–7.4, 8.1, 8.2, 10.6, 10.7, 17.1–17.4_

- [x] 3. Implement Query_API pure logic functions
  - [x] 3.1 Create `services/query-api/` project structure with `pyproject.toml`, `src/query_api/` package, and `tests/` directory
    - Initialize Python 3.14 project with pytest and hypothesis as dev dependencies
    - Create `src/query_api/__init__.py`, `src/query_api/handler.py`, `src/query_api/logic.py`
    - _Requirements: 9.1, 9.3, 9.4, 9.5_

  - [x] 3.2 Implement `validate_query_params`, `resolve_parquet_keys`, `filter_rows`, and `truncate_results` in `src/query_api/logic.py`
    - `validate_query_params(params)` validates station (4-char), start_time/end_time (ISO 8601), sv (optional)
    - `resolve_parquet_keys(station, start_time, end_time)` derives S3 keys for the time range
    - `filter_rows(rows, start_time, end_time, sv)` filters by time range and optional satellite
    - `truncate_results(rows, max_rows=10000)` returns (truncated_rows, was_truncated)
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

  - [x] 3.3 Write property tests for Query_API pure logic (Properties 6–9)
    - **Property 6: Query Time-Range Filtering** — only rows within [start, end] returned, sv filter applied correctly
    - **Property 7: Query Missing Parameter Rejection** — missing required params always raise validation error
    - **Property 8: Query Malformed Parameter Rejection** — invalid station/time formats rejected
    - **Property 9: Result Truncation** — output never exceeds max_rows, truncated flag correct
    - **Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5**

- [x] 4. Implement Reprocess_API pure logic functions
  - [x] 4.1 Create `services/reprocess-api/` project structure with `pyproject.toml`, `src/reprocess_api/` package, and `tests/` directory
    - Initialize Python 3.14 project with pytest and hypothesis as dev dependencies
    - Create `src/reprocess_api/__init__.py`, `src/reprocess_api/handler.py`, `src/reprocess_api/logic.py`
    - _Requirements: 10.1, 10.2_

  - [x] 4.2 Implement `validate_reprocess_request`, `build_queue_message` in `src/reprocess_api/logic.py`
    - `validate_reprocess_request(body)` validates station (4 alpha), year (2000–2099), doy (1–366), allowlisted params
    - `build_queue_message(station, year, doy, params, job_id, trace_id)` constructs SQS message body with resolved raw key
    - _Requirements: 10.1, 10.2, 10.3_

  - [x] 4.3 Write property test for Reprocess_API validation (Property 10)
    - **Property 10: Reprocess Request Validation** — accepts iff station is 4 alpha, year in [2000,2099], doy in [1,366]
    - **Validates: Requirements 10.1, 10.2**

- [x] 5. Checkpoint - Pure logic validation
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement Lambda handlers with AWS integrations
  - [x] 6.1 Implement `services/ingest-sync/src/ingest_sync/handler.py` — the full Lambda handler
    - Wire `compute_rolling_window`, `compute_doy_prefixes`, `validate_lookback_hours` into handler
    - Implement S3 list/copy logic with boto3, error continuation per prefix
    - Emit structured JSON logs with trace_id, synced/skipped/errors counts
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 6.2 Deploy Processor_Lambda as container image via `terraform/modules/processing`
    - ECR repository, image sync script, `package_type = Image`, SQS trigger, env vars, IAM
    - _Requirements: 6.1–6.9, 7.1–7.4, 8.1, 8.2, 10.6, 10.7, 17.1–17.4_

  - [x] 6.3 Implement `services/query-api/src/query_api/handler.py` — the full Lambda handler
    - Wire `validate_query_params`, `resolve_parquet_keys`, `filter_rows`, `truncate_results`
    - Implement GET /catalog using S3 Annotations (`list_catalog_*_from_annotations`)
    - Read parquet/json from S3 (pyarrow preferred), sanitize NaN/Inf, return `{data, meta}`
    - Return appropriate HTTP status codes (200, 400, 500) per error handling strategy
    - _Requirements: 9.1–9.5, 11.1–11.2, 18.1–18.3_

  - [x] 6.4 Implement `services/reprocess-api/src/reprocess_api/handler.py` — the full Lambda handler
    - Wire `validate_reprocess_request`, `build_queue_message`
    - Resolve raw keys via S3 list under `raw/rinexhourly/{year}/{doy}/` (not filename guessing)
    - Implement POST /reprocess: validate allowlisted params, create DynamoDB job record, enqueue SQS message including `trace_id`
    - Implement GET /reprocess/{job_id}: lookup DynamoDB record, return status
    - Handle SQS send failure after job creation (update status to failed)
    - _Requirements: 10.1–10.5_

  - [x] 6.5 Implement `services/annotations-indexer/` and S3 Annotations catalog integration
    - Create annotations-indexer Lambda triggered on `processed/tec/*` ObjectCreated
    - Write `processed-metadata` S3 Annotations via `PutObjectAnnotation` (boto3 >= 1.43 bundled)
    - Add `services/shared/s3_annotations.py`, `scripts/build-lambda-packages.sh`, backfill script
    - Wire query-api IAM/env for `GetObjectAnnotation`; update Terraform processing/presentation modules
    - _Requirements: 18.1–18.5_

  - [x] 6.6 Write unit tests for Lambda handlers with mocked AWS services
    - Test ingest handler S3 list/copy continuation on errors
    - Test query-api handler response formats (200, 400, 500), catalog annotation mocks, NaN sanitization
    - Test annotations-indexer PutObjectAnnotation payload and skip rules
    - Test reprocess-api handler job creation, raw key listing, and status lookup
    - _Requirements: 2.4, 6.2, 6.4, 9.3, 9.4, 10.2, 10.5, 18.1–18.3_

- [x] 7. Checkpoint - Lambda handlers validation
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Consolidate ingest infrastructure into Terraform
  - [x] 8.1 Implement ingest bootstrap resources in Terraform modules/root composition
    - Define DataLakeBucket (S3), IngestSync IAM role, EventBridge Scheduler schedule (with execution role), and IngestSync Lambda in Terraform
    - Parameterize schedule expression and LOOKBACK_HOURS (default 2, range 1–168; default schedule `rate(1 hour)`)
    - Configure Lambda environment variables (LOOKBACK_HOURS, DATA_LAKE_BUCKET, SOURCE_BUCKET, SOURCE_PREFIX)
    - _Requirements: 3.1, 3.2, 3.3, 3.5_

  - [x] 8.2 Document Terraform-only deployment entrypoint
    - Deploy with `terraform init`, `terraform plan`, and `terraform apply`
    - Ensure docs and CI reference Terraform only
    - _Requirements: 3.1, 3.4_

- [x] 9. Implement Terraform layer modules
  - [x] 9.1 Create `terraform/modules/ingest/` layer module
    - Define S3 data lake bucket, EventBridge Scheduler schedule + execution role, ingest-sync Lambda with IAM role
    - Parameterize schedule_expression, lookback_hours, source_bucket, source_prefix
    - Output bucket_name, bucket_arn, bucket_id, function_arn
    - _Requirements: 3.1, 3.2, 3.3, 16.1, 16.2_

  - [x] 9.2 Create `terraform/modules/processing/` layer module
    - Define Process_Queue (visibility_timeout=900, retention=7 days), Dead_Letter_Queue (retention=14 days)
    - Configure redrive policy (maxReceiveCount=5), SQS resource policy for S3 notifications
    - Define CloudWatch alarm (ApproximateNumberOfMessagesVisible ≥ 1, period 5 min) and SNS topic
    - Define S3→SQS notification on raw/rinexhourly/ prefix, S3→Lambda notification on processed/tec/, DynamoDB Jobs_Table, processor Lambda, annotations-indexer Lambda + SQS event source
    - Input: bucket_arn, bucket_id, bucket_name from ingest
    - _Requirements: 4.1, 4.2, 5.1, 5.2, 5.3, 5.4, 8.3, 10.1, 16.1, 16.2_

  - [x] 9.3 Create `terraform/modules/presentation/` layer module
    - Define query-api and reprocess-api Lambdas with IAM roles
    - Define REST API with /query (GET), /catalog (GET), and /reprocess (POST, GET), Lambda proxy integrations, CORS
    - Define Amplify app with manual deployment and Vite build spec
    - Input: bucket_name, reprocess_queue_url, reprocess_queue_arn, jobs_table_name, jobs_table_arn from upstream layers
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 16.1, 16.2_

  - [x] 9.4 Create `terraform/main.tf` root module wiring all layer modules together
    - Instantiate ingest, processing, and presentation modules
    - Pass outputs as inputs: ingest → processing → presentation
    - Define AWS region variable (default ap-southeast-2), required_version >= 1.6
    - _Requirements: 16.2, 16.3, 16.4, 16.5, 16.6_

- [x] 10. Checkpoint - Infrastructure validation
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Implement Portal frontend
  - [x] 11.1 Initialize `web/` Vite project with TypeScript and chosen UI framework
    - Create Vite project with TypeScript support
    - Set up project structure: `public/` (static assets), `src/components/`, `src/stores/`, `src/api/`
    - Add `public/favicon.svg` and wire it in `index.html` (`<link rel="icon" href="/favicon.svg" type="image/svg+xml" />`)
    - Install dependencies for charting (e.g., Chart.js or D3) and mapping (e.g., Leaflet)
    - _Requirements: 11.1, 12.1, 13.1, 15.2_

  - [x] 11.2 Implement `web/src/api/client.ts` — API client for Query_API and Reprocess_API
    - GET /catalog for station and date discovery
    - GET /query with station, start_time, end_time, sv params
    - POST /reprocess with station, year, doy, parameters body
    - GET /reprocess/{job_id} for status polling
    - Error handling returning structured error objects
    - _Requirements: 9.1, 10.1, 10.4, 14.7_

  - [x] 11.3 Implement `web/src/components/StationBrowser` component
    - Display list of available stations (4-character identifiers)
    - On station select, show available dates (year/doy) in descending order
    - Handle loading, error, and empty states
    - _Requirements: 11.1, 11.2, 11.3, 11.4_

  - [x] 11.4 Implement `web/src/components/TimeSeries` component
    - Render time-series chart with epoch on x-axis, metric value (vtec/stec/veq) on y-axis
    - Support satellite (sv) filtering and metric type selection
    - Handle empty data and API error states
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

  - [x] 11.5 Implement `web/src/components/IppMap` component
    - Render geographic map with lat_ipp/lon_ipp coordinates color-coded by vtec
    - Display tooltip with vtec, stec, sv on hover/select
    - Handle no-data and data-update scenarios
    - _Requirements: 13.1, 13.2, 13.3, 13.4_

  - [x] 11.6 Implement `web/src/components/ParameterPanel` component
    - Divide into view parameters (time range, sv, metric) and processing parameters
    - View parameter changes re-query Query_API without reprocessing
    - Processing parameter submit triggers Reprocess_API with job polling (5s interval, 5min timeout)
    - Display job status transitions and handle completed/failed/timeout states
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7, 14.8_

  - [x] 11.7 Wire all components together in the main App layout
    - Connect StationBrowser selection to TimeSeries, IppMap, and ParameterPanel
    - Implement state management for selected station, date range, and parameters
    - Configure API base URL from environment variable (Amplify provides at build time)
    - _Requirements: 11.1, 12.3, 13.4, 14.2_

  - [x] 11.8 Write frontend component tests with Vitest and Testing Library
    - Test StationBrowser rendering and selection behavior
    - Test TimeSeries chart rendering with mock data
    - Test IppMap rendering and tooltip interactions
    - Test ParameterPanel form submission and polling logic
    - Test API client error handling with mock responses
    - _Requirements: 11.3, 12.4, 13.3, 14.7, 14.8_

- [x] 12. Checkpoint - Frontend validation
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. CI pipeline and documentation
  - [x] 13.1 Update `.github/workflows/ci.yml` with full test pipeline
    - Add terraform validate step for all modules
    - Add pytest step for each Python service (ingest-sync, query-api, reprocess-api, annotations-indexer) on Python 3.14
    - Add vitest --run step for frontend tests
    - Add coverage reporting
    - _Requirements: 3.2, 16.1_

  - [x] 13.2 Create `docs/ARCHITECTURE.md`, `docs/DATA_CONTRACT.md`, and `docs/WALKTHROUGH.md`
    - ARCHITECTURE.md: high-level system diagram, layer descriptions, data flow
    - DATA_CONTRACT.md: SQS message schema, DynamoDB Jobs schema, S3 Annotations schema, Parquet schema, S3 key patterns, catalog API contract
    - WALKTHROUGH.md: step-by-step deployment guide (terraform init/plan/apply → verify)
    - _Requirements: 3.1, 4.3, 6.6, 7.1_

- [x] 14. Final checkpoint - Full integration validation
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation between major phases
- Property tests validate universal correctness properties defined in the design
- Unit tests validate specific examples and edge cases
- Python services use Python 3.14 with pytest + hypothesis for testing
- Frontend uses TypeScript with Vite, Vitest for testing
- Infrastructure uses Terraform >= 1.6 as the single IaC system

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "3.1", "4.1"] },
    { "id": 1, "tasks": ["1.2", "2.2", "3.2", "4.2"] },
    { "id": 2, "tasks": ["1.3", "1.4", "2.3", "2.4", "3.3", "4.3"] },
    { "id": 3, "tasks": ["6.1", "6.2", "6.3", "6.4", "8.1", "8.2"] },
    { "id": 4, "tasks": ["6.5", "9.1", "9.2", "9.3"] },
    { "id": 5, "tasks": ["9.4", "9.5", "9.6", "9.7"] },
    { "id": 6, "tasks": ["9.8", "9.9"] },
    { "id": 7, "tasks": ["9.10", "11.1"] },
    { "id": 8, "tasks": ["11.2"] },
    { "id": 9, "tasks": ["11.3", "11.4", "11.5", "11.6"] },
    { "id": 10, "tasks": ["11.7"] },
    { "id": 11, "tasks": ["11.8"] },
    { "id": 12, "tasks": ["13.1", "13.2"] }
  ]
}
```
