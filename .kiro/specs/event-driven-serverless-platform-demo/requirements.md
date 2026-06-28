# Requirements Document

## Introduction

This document defines the requirements for a consolidated AWS event-driven serverless platform that demonstrates GNSS RINEX data ingestion, PyTECGg TEC calibration processing, and interactive visualization. The platform spans three functional layers — scheduled ingest from GeoNet open data, SQS-driven processing via PyTECGg, and an Amplify-hosted portal for querying and reprocessing — all managed within a single monorepo using Terraform modules.

## Glossary

- **Ingest_Sync_Lambda**: The AWS Lambda function responsible for synchronizing RINEX observation files from the GeoNet public bucket to the private data lake bucket on a scheduled basis.
- **Processor_Batch_Job**: The AWS Batch container job that runs PyTECGg calibration on RINEX data and writes parquet output. Submitted by the batch-dispatcher Lambda.
- **Batch_Dispatcher_Lambda**: The AWS Lambda function that consumes SQS messages from ingest and reprocess queues and submits one processor Batch job per message.
- **Query_API**: The AWS API Gateway endpoint backed by a Lambda function that reads processed parquet files and returns filtered TEC data.
- **Reprocess_API**: The AWS API Gateway endpoint backed by a Lambda function that enqueues reprocessing jobs to SQS with user-specified parameters.
- **Portal**: The Vite-based single-page application hosted on AWS Amplify that provides station browsing, time-series visualization, IPP mapping, and parameter controls.
- **Process_Queue**: The SQS standard queue that buffers raw object notifications for the batch-dispatcher (ingest path).
- **Reprocess_Queue**: The SQS standard queue that buffers reprocessing job messages from the Reprocess_API.
- **Dead_Letter_Queue**: The SQS queue that receives ingest messages that have exceeded the maximum receive count on the Process_Queue.
- **Reprocess_Dead_Letter_Queue**: The SQS queue that receives reprocess messages that have exceeded the maximum receive count on the Reprocess_Queue.
- **Jobs_Table**: The DynamoDB table tracking reprocessing job metadata including status, parameters, and output references.
- **Annotations_Indexer_Lambda**: The AWS Lambda function that writes Amazon S3 Annotations on processed output objects under `processed/tec/`.
- **S3_Annotations**: Native S3 object metadata attached via `PutObjectAnnotation`/`GetObjectAnnotation`; used for processed catalog discovery (namespace `processed-metadata`).
- **Catalog_API**: The GET /catalog endpoint backed by the Query_API Lambda; returns station lists and per-station date lists from S3 Annotations.
- **Data_Lake_Bucket**: The private S3 bucket containing both raw ingested RINEX files and processed parquet outputs under defined key prefixes.
- **DOY**: Day of Year, a three-digit zero-padded integer (001–366) used in RINEX file paths.
- **RINEX**: Receiver Independent Exchange Format, the standard format for GNSS observation data.
- **PyTECGg**: The Python library that performs Total Electron Content (TEC) calibration on GNSS observations.
- **TEC**: Total Electron Content, the integrated electron density along the signal path between satellite and receiver.
- **IPP**: Ionospheric Pierce Point, the geographic location where the satellite-receiver signal intersects the ionospheric shell.
- **Parquet**: A columnar storage file format used for the processed calibration output.
- **NAV_DAY_OFFSET**: An integer environment variable specifying how many days prior to the observation DOY to fetch navigation files from BKG.
- **LOOKBACK_HOURS**: An integer environment variable defining the UTC rolling window for ingest synchronization (default 2).
- **EventBridge_Schedule**: The AWS EventBridge Scheduler one-time or recurring schedule that triggers the Ingest_Sync_Lambda on a UTC cadence.
- **Station**: A four-character alphanumeric GNSS receiver site identifier (e.g., AUCK, 2406).
- **Trace_ID**: A UUID v4 correlation identifier propagated in logs and message payloads for end-to-end observability.

## Requirements

### Requirement 1: Scheduled Ingest Trigger

**User Story:** As a platform operator, I want RINEX ingestion to run automatically on a UTC schedule, so that fresh observation data flows into the data lake without manual intervention.

#### Acceptance Criteria

1. THE EventBridge_Schedule SHALL trigger the Ingest_Sync_Lambda on a recurring schedule defined as a rate or cron expression in Terraform configuration (default: every 1 hour), with LOOKBACK_HOURS set wider than the schedule interval (default: 2 hours) to tolerate one missed run and ensure continuous coverage.
2. WHEN the EventBridge_Schedule fires, THE Ingest_Sync_Lambda SHALL compute the current UTC time and derive the rolling window as the half-open interval [current_UTC minus LOOKBACK_HOURS hours, current_UTC), where LOOKBACK_HOURS is an integer environment variable defaulting to 2.
3. WHEN the rolling window is computed, THE Ingest_Sync_Lambda SHALL identify the set of DOY prefixes (year and three-digit zero-padded day-of-year) for every UTC calendar day that overlaps with any portion of the window, including both years and their respective DOY values when the window spans a year boundary (e.g., DOY 365 of one year and DOY 001 of the next).
4. IF the LOOKBACK_HOURS environment variable is missing or is not a positive integer in the range 1 to 168, THEN THE Ingest_Sync_Lambda SHALL log an error indicating the invalid configuration and terminate the invocation without processing.

### Requirement 2: RINEX File Synchronization

**User Story:** As a platform operator, I want only recent RINEX files synced from GeoNet, so that the data lake stays current without redundant full-bucket copies.

#### Acceptance Criteria

1. WHEN overlapping DOY prefixes are identified, THE Ingest_Sync_Lambda SHALL list objects under s3://geonet-open-data/gnss/rinexhourly/ using the prefix pattern {year}/{doy}/ for each prefix.
2. IF a source object key does not already exist in the Data_Lake_Bucket at the corresponding raw key (matched by key name), THEN THE Ingest_Sync_Lambda SHALL copy the object to raw/rinexhourly/{year}/{doy}/{filename}.
3. IF a source object key already exists in the Data_Lake_Bucket at the corresponding raw key, THEN THE Ingest_Sync_Lambda SHALL skip the copy operation for that object.
4. IF an S3 API call fails during listing or copying, THEN THE Ingest_Sync_Lambda SHALL log the error details and continue processing remaining prefixes and objects without aborting the entire invocation.
5. THE Ingest_Sync_Lambda SHALL emit a structured JSON log entry for each invocation containing the count of objects synced, the count of objects skipped, the count of errors encountered, and the DOY prefixes scanned.

### Requirement 3: Ingest Infrastructure Provisioning

**User Story:** As a DevOps engineer, I want infrastructure provisioned via Terraform only, so that the platform is reproducible and auditable through a single IaC workflow.

#### Acceptance Criteria

1. WHEN `terraform apply` is executed from the root Terraform configuration, THE deployment SHALL provision the Data_Lake_Bucket, required IAM role for the Ingest_Sync_Lambda, EventBridge_Schedule (with scheduler execution role), and Ingest_Sync_Lambda, and SHALL be idempotent such that repeated applies converge without duplicate resources.
2. THE Terraform configuration SHALL define the Data_Lake_Bucket, IAM role, EventBridge_Schedule, and Ingest_Sync_Lambda as declarative resources, and SHALL include the schedule expression as a parameterizable variable.
3. WHEN Terraform provisions the Ingest_Sync_Lambda, THE deployment SHALL configure LOOKBACK_HOURS with a default of 2 and constrain the variable to an integer between 1 and 168, and SHALL configure the EventBridge_Schedule with a default of `rate(1 hour)`.
4. WHEN `terraform apply` completes successfully, THEN the command SHALL exit with code 0; IF any resource creation fails, THEN the command SHALL exit non-zero and surface the failed resource in the Terraform output.
5. IF a Terraform apply fails part-way through, THEN rerunning `terraform apply` after correcting configuration or permissions SHALL reconcile infrastructure to the desired state without manual drift-prone intervention.

### Requirement 4: S3 Event Notification to SQS

**User Story:** As a platform operator, I want new raw RINEX objects to automatically trigger processing, so that calibration runs without manual queue management.

#### Acceptance Criteria

1. WHEN an object is created under the raw/rinexhourly/ prefix in the Data_Lake_Bucket (for all S3 ObjectCreated event subtypes), THE Data_Lake_Bucket SHALL send an S3 event notification to the Process_Queue.
2. THE Process_Queue SHALL have an SQS resource policy that permits the Data_Lake_Bucket to send messages to it.
3. THE event notification message SHALL contain the bucket name, object key, and event timestamp as provided by the S3 event notification payload; attempt tracking SHALL use the SQS ApproximateReceiveCount message attribute.
4. WHEN consuming the S3 notification from the Process_Queue, THE Batch_Dispatcher_Lambda SHALL preserve message context into Batch submit logs and pass the raw message body to the Processor_Batch_Job as `--event-json`, and the Processor_Batch_Job SHALL include a Trace_ID (UUID v4) in structured processing logs for the message lifecycle.

### Requirement 5: SQS Queue and Dead Letter Configuration

**User Story:** As a platform operator, I want failed messages to retry a bounded number of times before routing to a dead letter queue, so that transient errors are handled and persistent failures are isolated.

#### Acceptance Criteria

1. THE Process_Queue SHALL be configured as an SQS standard queue with a visibility timeout of 900 seconds, a message retention period of 7 days, and a redrive policy directing failed messages to the Dead_Letter_Queue after a maxReceiveCount of 5.
2. THE Dead_Letter_Queue SHALL be configured as an SQS standard queue and SHALL retain messages for 14 days.
3. WHEN the ApproximateNumberOfMessagesVisible metric for the Dead_Letter_Queue is greater than or equal to 1 for one consecutive evaluation period of 5 minutes, THE platform SHALL transition a CloudWatch alarm to the ALARM state.
4. WHEN the CloudWatch alarm transitions to the ALARM state, THE platform SHALL publish a notification to the configured SNS topic.

### Requirement 6: PyTECGg Calibration Processing

**User Story:** As a data scientist, I want each raw RINEX file automatically calibrated by PyTECGg, so that processed TEC data is available for analysis.

#### Acceptance Criteria

1. WHEN the Processor_Batch_Job starts with `--event-json` payload from Process_Queue or Reprocess_Queue, THE Processor_Batch_Job SHALL parse the year, DOY, and station from the object key using the pattern raw/rinexhourly/{year}/{doy}/{filename} where year is a four-digit integer, DOY is a three-digit zero-padded integer (001–366), and station is a four-character identifier extracted from the filename.
2. IF the object key does not match the expected pattern or contains invalid year, DOY, or station values, THEN THE Processor_Batch_Job SHALL treat the invocation as a failed calibration and log a structured error entry indicating the parse failure reason.
3. WHEN year, DOY, and station are parsed, THE Processor_Batch_Job SHALL calculate the navigation DOY as (observation DOY minus NAV_DAY_OFFSET), rolling back to the previous year if the result is less than 1, and download navigation files from BKG for the calculated year and DOY.
4. IF the navigation file download from BKG fails or the required navigation file does not exist, THEN THE Processor_Batch_Job SHALL treat the invocation as a failed calibration.
5. WHEN navigation files are available, THE Processor_Batch_Job SHALL execute the PyTECGg calibration pipeline using the raw RINEX observation file and navigation file as inputs.
6. WHEN calibration completes successfully, THE Processor_Batch_Job SHALL write output file(s) under `processed/tec/station={station}/year={year}/doy={doy}/{source_stem}.{ext}` for each enabled format (Parquet, CSV, JSON, plots). Parquet output SHALL contain at minimum the columns: epoch, sv, id_arc, lat_ipp, lon_ipp, azi, ele, bias, stec, vtec, veq. The Parquet object body SHALL be Apache Parquet (binary columnar), not JSON or other placeholder encodings.
7. THE Processor_Batch_Job SHALL NOT write synthetic, hardcoded, or demo calibration data. IF PyTECGg calibration cannot run (missing dependency, missing input file, nav download failure, or calibration exception), THE Processor_Batch_Job SHALL fail the invocation and SHALL NOT write any object under the `processed/` prefix for that message.
8. WHEN `SubmitJob` succeeds for a Process_Queue message, THE Batch_Dispatcher_Lambda SHALL return success so Lambda event source mapping deletes the SQS message from Process_Queue.
9. IF `SubmitJob` fails, THEN THE Batch_Dispatcher_Lambda SHALL return `batchItemFailures` for that message so SQS retry and DLQ routing remain in effect.

### Requirement 7: Processing Idempotency

**User Story:** As a platform operator, I want reprocessing the same input to produce a deterministic output without duplicates, so that retries and reprocessing do not corrupt the data lake.

#### Acceptance Criteria

1. THE Processor_Batch_Job SHALL derive the output key deterministically from the input object key by extracting station, year, DOY, and source_stem (the input filename without its extension) and applying the pattern `processed/tec/station={station}/year={year}/doy={doy}/{source_stem}.{ext}` where `{ext}` reflects the enabled output format.
2. WHEN the Processor_Batch_Job writes output, THE Processor_Batch_Job SHALL overwrite any existing object at the deterministic output key.
3. WHEN the same raw object is processed multiple times with identical parameters, THE Processor_Batch_Job SHALL produce parquet output containing the same row count, column schema, and cell values, disregarding file-level metadata such as write timestamps or writer version.
4. IF the input object key does not conform to the expected raw/rinexhourly/{year}/{doy}/{filename} structure, THEN THE Processor_Batch_Job SHALL log an error containing the malformed key and SHALL NOT write any output to the processed prefix.

### Requirement 8: Processing Observability

**User Story:** As a platform operator, I want structured logs and alarms for the processing pipeline, so that I can monitor health and diagnose failures.

#### Acceptance Criteria

1. THE Processor_Batch_Job SHALL emit structured JSON log entries containing trace_id, station, year, DOY, processing duration in milliseconds, and outcome (success or error message) for each invocation, emitted immediately after processing completes or fails.
2. WHEN a processing invocation fails, THE Processor_Batch_Job SHALL include the error type (exception class name) and error message in the structured log entry.
3. WHEN the Dead_Letter_Queue CloudWatch alarm transitions to the ALARM state, THE platform SHALL publish a notification to the configured SNS topic containing the alarm name, current metric value, and timestamp.

### Requirement 9: Query API for Processed Data

**User Story:** As a data consumer, I want to query processed TEC data by station, time range, and satellite, so that I can retrieve specific subsets for analysis or visualization.

#### Acceptance Criteria

1. WHEN a GET request is received with station (four-character identifier), start_time and end_time (ISO 8601 UTC timestamps), and optional satellite (sv) filter parameters, THE Query_API SHALL read the matching parquet files from the processed prefix, filter rows where the epoch column falls within the inclusive start_time to end_time range, and return HTTP status 200 with a JSON object containing:
   - data: an array of rows with the columns epoch, sv, id_arc, lat_ipp, lon_ipp, azi, ele, bias, stec, vtec, veq
   - meta: an object containing at minimum `row_count` and `truncated` (boolean)
2. IF no matching data exists for the provided filters, THEN THE Query_API SHALL return HTTP status 200 with `data` as an empty array and `meta.row_count` as 0.
3. IF a required parameter (station, start_time, end_time) is missing, THEN THE Query_API SHALL return HTTP status 400 with an error message indicating which required parameter is missing.
4. IF a parameter value is malformed (station is not a four-character identifier, or start_time/end_time is not a valid ISO 8601 UTC timestamp, or start_time is after end_time), THEN THE Query_API SHALL return HTTP status 400 with an error message indicating the validation failure.
5. WHEN the filtered result set exceeds 10,000 rows, THE Query_API SHALL return only the first 10,000 rows, set `meta.truncated` to true, and set `meta.row_count` to the number of rows returned.

### Requirement 10: Reprocess API and Job Tracking

**User Story:** As a data scientist, I want to submit reprocessing requests with custom parameters and track their status, so that I can experiment with calibration settings.

#### Acceptance Criteria

1. WHEN a POST request is received with station, year, DOY, and optional processing parameters from the allowlist (`NAV_DAY_OFFSET`, `SAVE_PARQUET`, `SAVE_CSV`, `SAVE_JSON`, `SAVE_STATIC_PLOTS`, `SAVE_INTERACTIVE_PLOTS`), THE Reprocess_API SHALL validate that station is a 4-character alphanumeric string, year is a 4-digit integer between 2000 and 2099, and DOY is a zero-padded integer between 001 and 366, resolve the raw object key by listing `raw/rinexhourly/{year}/{doy}/`, then create a record in the Jobs_Table with a unique job_id, the submitted parameters, status set to "queued", and a created_at timestamp, and return HTTP status 202 with the job_id and status in the response body.
2. IF a POST request is received with an invalid or missing required parameter (station, year, or DOY), THEN THE Reprocess_API SHALL return HTTP status 400 with an error message indicating which parameter failed validation.
3. WHEN the Jobs_Table record is created, THE Reprocess_API SHALL enqueue a message to the Reprocess_Queue containing the raw object key, processing parameters, job_id, and Trace_ID.
4. WHEN a GET request is received with a job_id, THE Reprocess_API SHALL return the job record from the Jobs_Table including status, parameters, output_key, and any error details with HTTP status 200.
5. IF a GET request is received with a job_id that does not exist in the Jobs_Table, THEN THE Reprocess_API SHALL return HTTP status 404 with an error message indicating the job was not found.
6. WHEN the Processor_Batch_Job begins processing a job-linked message, THE Processor_Batch_Job SHALL update the Jobs_Table record to status "processing".
7. WHEN the Processor_Batch_Job completes a job-linked message successfully, THE Processor_Batch_Job SHALL update the Jobs_Table record to status "completed" with the output_key.
8. IF a job-linked message is routed to the Dead_Letter_Queue after maxReceiveCount is exceeded, THEN THE platform SHALL update the corresponding Jobs_Table record to status "failed" with the terminal error type and terminal error message.

### Requirement 11: Portal Station Browsing

**User Story:** As a researcher, I want to browse available GNSS stations, so that I can select stations of interest for visualization.

#### Acceptance Criteria

1. WHEN the Portal loads, THE Portal SHALL request the list of available stations from GET /catalog and display each station as its four-character identifier.
2. WHEN a user selects a station, THE Portal SHALL request available dates from GET /catalog?station={station} and display them as a list of year and DOY combinations sorted in descending chronological order.
3. IF the station list request fails due to a network or server error, THEN THE Portal SHALL display an error message indicating the station list could not be loaded and provide a retry option.
4. IF no processed data exists in the Data_Lake_Bucket, THEN THE Portal SHALL display a message indicating that no stations are currently available.

### Requirement 12: Portal Time-Series Visualization

**User Story:** As a researcher, I want to view TEC time-series plots for selected stations, so that I can analyze ionospheric behavior over time.

#### Acceptance Criteria

1. WHEN a station and time range are selected, THE Portal SHALL request data from the Query_API and render time-series charts with epoch on the x-axis and metric value on the y-axis, displaying one or more of the vtec, stec, and veq metrics based on the user's metric type selection.
2. WHEN a satellite (sv) filter is applied, THE Portal SHALL update the time-series chart to show only arcs for the selected satellite.
3. THE Portal SHALL allow the user to configure view parameters including time range, satellite selection, and metric type, and SHALL re-query existing processed data from the Query_API without triggering reprocessing.
4. IF the Query_API request fails or returns a network error, THEN THE Portal SHALL display an error message indicating the data could not be loaded and SHALL retain the user's current view parameter selections.
5. IF the Query_API returns an empty result set for the selected station, time range, and filters, THEN THE Portal SHALL display a message indicating no data is available for the selected parameters.

### Requirement 13: Portal IPP Map Visualization

**User Story:** As a researcher, I want to view ionospheric pierce points on a geographic map, so that I can understand spatial TEC distribution.

#### Acceptance Criteria

1. WHEN processed data is loaded for a station and time range, THE Portal SHALL render a map displaying lat_ipp and lon_ipp coordinates from the parquet data, color-coded by vtec magnitude with a visible scale legend.
2. WHEN the user hovers over or selects a map point, THE Portal SHALL display a tooltip or popup containing the associated vtec, stec values and satellite identifier (sv).
3. IF no valid lat_ipp or lon_ipp coordinates exist in the loaded data, THEN THE Portal SHALL display a message indicating no IPP data is available for the selected parameters.
4. WHEN the station or time range selection changes, THE Portal SHALL update the map to reflect the newly loaded data.

### Requirement 14: Portal Processing Parameter Panel

**User Story:** As a data scientist, I want to adjust processing parameters and submit reprocessing jobs from the portal, so that I can iterate on calibration settings visually.

#### Acceptance Criteria

1. THE Portal SHALL display a parameter panel divided into view parameters (time range, sv, metric) and processing parameters (NAV_DAY_OFFSET and SAVE_* toggles exposed by the Reprocess API allowlist), with each processing parameter rendered as an appropriate input control.
2. WHEN view parameters are changed, THE Portal SHALL update the visualization by re-querying existing processed data from the Query_API without triggering a reprocessing job.
3. WHEN processing parameters are changed and the user submits, THE Portal SHALL send a reprocessing request to the Reprocess_API including the currently selected station, year, DOY, and the modified processing parameters, and display the returned job_id and initial status.
4. WHILE a reprocessing job has status "queued" or "processing", THE Portal SHALL poll the Reprocess_API for status updates every 5 seconds and display the current job status to the user.
5. WHEN a reprocessing job transitions to status "completed", THE Portal SHALL stop polling and reload the visualization with the new output data.
6. IF a reprocessing job transitions to status "failed", THEN THE Portal SHALL stop polling and display an error indication containing the error details returned by the Reprocess_API.
7. IF the reprocessing request to the Reprocess_API returns an error response, THEN THE Portal SHALL display an error indication to the user and shall not begin polling.
8. IF polling has continued for more than 5 minutes without the job reaching a terminal status ("completed" or "failed"), THEN THE Portal SHALL stop polling and display a timeout indication to the user.

### Requirement 15: Amplify Hosting and Deployment

**User Story:** As a DevOps engineer, I want the portal deployed via Amplify managed by Terraform, so that the frontend is continuously deployed alongside infrastructure changes.

#### Acceptance Criteria

1. THE Terraform presentation module SHALL configure an AWS Amplify app with a manual deployment method, specifying the web/ directory as the source for Portal assets.
2. THE Terraform presentation module SHALL define a build specification that runs the Vite production build and outputs the resulting dist/ artifacts as the publish directory. The build SHALL include static assets from `web/public/` (including `favicon.svg`) copied into `dist/` by Vite.
3. WHEN a Terraform apply deploys updated web/ directory contents to the Amplify app, THE Amplify hosting SHALL serve the updated Portal assets from the configured branch within 120 seconds of deployment completion.
4. THE API Gateway SHALL enable CORS on the Query_API and Reprocess_API endpoints with the Amplify app default domain as the allowed origin, allowing GET, POST, and OPTIONS methods, and permitting the Content-Type header.
5. IF the Amplify deployment fails, THEN THE Terraform apply SHALL report the failure and the Amplify app SHALL continue serving the previously deployed Portal assets.

### Requirement 16: Terraform Module Organization

**User Story:** As a DevOps engineer, I want infrastructure organized into discrete Terraform modules, so that each component can be developed and tested independently.

#### Acceptance Criteria

1. THE Terraform configuration SHALL define four modules — `ingest`, `processing`, `presentation`, and `observability` — under `terraform/modules/`, where each module resides in its own directory containing at minimum a variables.tf and outputs.tf file and one or more resource definition files.
2. THE `ingest` module SHALL own the Data_Lake_Bucket, EventBridge Scheduler schedule (with execution role), and Ingest_Sync_Lambda. THE `processing` module SHALL own the SQS pipeline (Process_Queue, Reprocess_Queue, DLQs), S3 event notification to SQS (raw), S3 event notification to annotations-indexer (processed/tec), DynamoDB Jobs_Table, Processor_Batch_Job infrastructure, Batch_Dispatcher_Lambda, and Annotations_Indexer_Lambda. THE `presentation` module SHALL own the Query_API Lambda, Reprocess_API Lambda, API Gateway, and Amplify hosting. THE `observability` module SHALL own CloudWatch alarms, SNS topic, and dashboard.
3. THE Terraform configuration SHALL declare a root module that instantiates modules in dependency order and passes outputs from upstream modules as input variables to downstream modules in the order: ingest → processing → presentation, with observability wiring to deployed layer outputs.
4. THE Terraform configuration SHALL define the AWS region as a variable defaulting to ap-southeast-2 that can be overridden at plan/apply time.
5. THE Terraform configuration SHALL require Terraform version 1.6 or higher via a required_version constraint in the terraform block.
6. WHEN a child module requires a resource managed by another module, THE root module SHALL pass the dependency as an input variable rather than relying on hard-coded resource identifiers.
7. ALL Lambda functions provisioned by Terraform SHALL use the AWS managed runtime `python3.14`, consistent with `requires-python = ">=3.14,<3.15"` in each service `pyproject.toml` and Python 3.14 in CI. The processor runtime SHALL run as an AWS Batch container image (Python 3.13).

### Requirement 17: Processing Environment Defaults

**User Story:** As a platform operator, I want sensible default processing parameters, so that calibration runs correctly without explicit configuration for standard use cases.

#### Acceptance Criteria

1. IF no override parameters are present in the incoming SQS message body, THEN THE Processor_Batch_Job SHALL use the following environment variable defaults: NAV_DAY_OFFSET=1, SAVE_PARQUET=true, SAVE_CSV=false, SAVE_STATIC_PLOTS=false, SAVE_INTERACTIVE_PLOTS=false.
2. WHEN a reprocessing message includes override parameters, THE Processor_Batch_Job SHALL use the message-level override values in place of the environment variable defaults for that invocation only, applying overrides solely to the parameters listed in criterion 1.
3. IF a reprocessing message contains an override parameter with an invalid value (non-integer for NAV_DAY_OFFSET, or non-boolean for SAVE_PARQUET, SAVE_CSV, SAVE_STATIC_PLOTS, SAVE_INTERACTIVE_PLOTS), THEN THE Processor_Batch_Job SHALL reject the message, log a structured error entry containing the invalid parameter name and value, and allow SQS retry via the redrive policy.
4. WHEN a reprocessing message includes override parameters for only a subset of the overridable parameters, THE Processor_Batch_Job SHALL apply the provided overrides and retain the environment variable defaults for any parameters not specified in the message.

### Requirement 18: S3 Annotations for Processed Metadata

**User Story:** As a platform operator, I want processed output metadata stored as S3 Annotations on each object, so that catalog discovery does not require a separate metadata database.

#### Acceptance Criteria

1. WHEN a `.parquet` or `.json` object is created under `processed/tec/`, THE Annotations_Indexer_Lambda SHALL write a `processed-metadata` S3 Annotation on that object containing at minimum: `dataset=processed`, `station`, `year`, `doy`, `key`, and `created_at`.
2. WHEN GET /catalog is called without a station parameter, THE Query_API SHALL list processed data keys, read S3 Annotations in parallel, and return the distinct set of station codes uppercased.
3. WHEN GET /catalog is called with a valid station parameter, THE Query_API SHALL list processed keys for that station, read S3 Annotations, and return distinct `(year, doy)` pairs sorted descending.
4. THE platform SHALL provide `scripts/backfill-processed-annotations.py` to annotate existing processed objects after first deploy.
5. Raw ingest objects under `raw/rinexhourly/` SHALL NOT receive S3 Annotations; reprocess raw key resolution SHALL continue to use S3 prefix listing.
