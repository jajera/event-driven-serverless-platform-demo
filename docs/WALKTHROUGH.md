# Deployment Walkthrough

Step-by-step guide to deploy the event-driven serverless platform from scratch.

## Prerequisites

- **AWS CLI** — Configured with credentials that have permissions for S3, Lambda, IAM, SQS, DynamoDB, API Gateway, Amplify, EventBridge Scheduler, CloudWatch, ECR, and SNS.
- **Terraform** >= 1.6
- **Node.js** >= 20, **npm**, **curl**, and **zip** (portal build and Amplify manual deploy on apply)
- **Python** >= 3.14 (for Lambda service development and testing)
- **Docker** with `buildx` support (required by `scripts/sync-processor-image.sh` to pull and inspect multi-platform images)

Verify your tools:

```bash
aws --version
terraform --version
node --version
python3 --version
docker buildx version
```

## Deploy Infrastructure (Terraform Only)

Terraform deploys the full infrastructure stack: ingest, SQS pipeline, processor Lambda container image, API Lambdas, DynamoDB (jobs only), API Gateway, and Amplify hosting.

Run from the repository root with `-chdir=terraform`.

### Initialize

```bash
terraform -chdir=terraform init
```

### Processor image

The processor Lambda uses a container image from `ghcr.io/platformfuzz/tec-processor-image`. The image must be mirrored to ECR before applying the full stack.

**Step 1 — Create the ECR repository:**

```bash
terraform -chdir=terraform apply -target=module.processing[0].aws_ecr_repository.processor_image
```

**Step 2 — Mirror the image from GHCR to ECR:**

```bash
./scripts/sync-processor-image.sh
```

By default the script uses `latest` (must match `processor_image_tag` in Terraform). To use a specific tag:

```bash
./scripts/sync-processor-image.sh <tag>
```

The tag must resolve to a single-platform Docker v2 or OCI manifest (not a multi-arch index). The script validates the manifest type before pushing.

### Plan

Review what will be created:

```bash
terraform -chdir=terraform plan -var="region=ap-southeast-2"
```

Key variables (see `terraform/variables.tf` for full list):

| Variable | Default | Description |
| --- | --- | --- |
| `region` | `ap-southeast-2` | AWS region |
| `source_bucket` | `geonet-open-data` | GeoNet source bucket |
| `lookback_hours` | `1` | Ingest lookback window (UTC hours); 1-hour rolling sync window |
| `schedule_expression` | `rate(1 hour)` | EventBridge Scheduler cadence for ingest-sync |
| `amplify_domain` | `*` | Amplify hostname for CORS (update after first deploy) |
| `web_source_dir` | `../web` | Path to the Portal source directory |
| `deploy_amplify_on_apply` | `true` | Build and zip-deploy portal to Amplify (no Git repo) |
| `processor_image_tag` | `latest` | Tag mirrored to ECR (must match `./scripts/sync-processor-image.sh`) |
| `processor_maximum_concurrency` | `15` | Max concurrent SQS invocations for processor on ingest queue |
| `reprocess_maximum_concurrency` | `2` | Max concurrent SQS invocations for processor on reprocess queue |
| `processor_timeout_seconds` | `900` | Max duration per processor Lambda invocation |
| `processor_memory_mb` | `2048` | Memory allocated to processor Lambda container (max 2048) |
| `process_queue_visible_threshold` | `100` | Early warning threshold for process-queue depth |
| `queue_stale_age_seconds_threshold` | `1800` | Stale-message age threshold for process/reprocess queues |
| `dlq_visible_threshold` | `1` | DLQ visible-message threshold |

### Apply

```bash
terraform -chdir=terraform apply -var="region=ap-southeast-2"
```

Staged option (recommended when you want processing ready before scheduler start):

```bash
# Create ingest + processing resources first (scheduler not enabled yet)
terraform -chdir=terraform apply -var="region=ap-southeast-2" -target=module.processing

# Enable ingest scheduler when ready
terraform -chdir=terraform apply -var="region=ap-southeast-2" -target=module.ingest_scheduler

# Reconcile everything
terraform -chdir=terraform apply -var="region=ap-southeast-2"
```

Type `yes` to confirm. Terraform creates resources in dependency order:

1. Ingest layer (S3, scheduler, ingest-sync Lambda)
2. Processing layer (SQS, DynamoDB Jobs table, ECR, processor Lambda container)
3. Presentation layer (API Lambdas, API Gateway, Amplify app)
4. **Portal build + manual Amplify deploy** (when `deploy_amplify_on_apply=true`)

Skip step 4 if Node.js is unavailable:

```bash
terraform -chdir=terraform apply -var='deploy_amplify_on_apply=false'
```

Then deploy the frontend manually:

```bash
export AMPLIFY_APP_ID="$(terraform -chdir=terraform output -raw amplify_app_id)"
export VITE_API_URL="$(terraform -chdir=terraform output -raw api_url)"
export WEB_SOURCE_DIR="$(pwd)/web"
./scripts/deploy-amplify.sh
```

### Post-Deploy: Lock Down CORS

After the first apply, update API Gateway browser CORS to the Amplify branch hostname so the **hosted portal** can call the API. CLI clients using `api_url` are unaffected.

```bash
terraform -chdir=terraform apply \
  -var="region=ap-southeast-2" \
  -var="amplify_domain=$(terraform -chdir=terraform output -raw cors_domain)"
```

## Portal and API URLs

| Use case | URL | How to get it |
| --- | --- | --- |
| **curl / scripts / Postman** | API Gateway stage | `terraform -chdir=terraform output -raw api_url` |
| **Browser UI (portal)** | Amplify app | `terraform -chdir=terraform output -raw app_url` |

The hosted portal is deployed by Terraform via **manual zip upload** — no Git connection required. At build time, `VITE_API_URL` is set to the same API Gateway URL as in the table above.

### Frontend development

Run unit tests locally:

```bash
cd web && npm install && npm test
```

To ship UI changes, rebuild and deploy to Amplify (do not rely on `npm run dev` against the live API — browser CORS blocks localhost):

```bash
export WEB_SOURCE_DIR="$(pwd)/web"
export AMPLIFY_APP_ID="$(terraform -chdir=terraform output -raw amplify_app_id)"
export VITE_API_URL="$(terraform -chdir=terraform output -raw api_url)"
./scripts/deploy-amplify.sh
```

Or build only for inspection:

```bash
cd web
npm run build
```

The build output lands in `web/dist/`.

## Verification

After full deployment, verify end-to-end:

### 1. Check EventBridge Scheduler

```bash
aws scheduler list-schedules --query "Schedules[?contains(Name, 'ingest-sync')]"
```

### 2. Trigger a Manual Ingest (optional)

```bash
aws lambda invoke \
  --function-name ingest-sync \
  --payload '{}' \
  /dev/stdout
```

### 3. Verify Ingest SQS Queue Receives Messages

After new objects land in `raw/rinexhourly/`:

```bash
aws sqs get-queue-attributes \
  --queue-url "$(terraform -chdir=terraform output -raw queue_url)" \
  --attribute-names ApproximateNumberOfMessages
```

### 4. Monitor Processor Lambda and Queues

The processor Lambda (`processor`) is triggered directly by SQS event source mappings (`batch_size=1`). Effective throughput is capped by **account-level Lambda concurrent execution quota** as well as `processor_maximum_concurrency` / `reprocess_maximum_concurrency`.

```bash
aws lambda get-function-configuration --function-name processor \
  --query '{State:State,LastUpdateStatus:LastUpdateStatus}'

aws sqs get-queue-attributes \
  --queue-url "$(terraform -chdir=terraform output -raw queue_url)" \
  --attribute-names ApproximateNumberOfMessages ApproximateNumberOfMessagesNotVisible

aws sqs get-queue-attributes \
  --queue-url "$(terraform -chdir=terraform output -raw reprocess_queue_url)" \
  --attribute-names ApproximateNumberOfMessages
```

If ingest messages accumulate while the processor shows throttles, request a Lambda concurrency quota increase for the account/region.

### 5. Verify Processed Output in S3

After processor Lambda completes, check for output under the `processed/tec/` prefix:

```bash
aws s3 ls "s3://$(terraform -chdir=terraform output -raw bucket_name)/processed/tec/" --recursive
```

Expect keys matching: `processed/tec/station={station}/year={year}/doy={doy}/{filename}.parquet` and `…/{filename}.json`

### 6. Test the REST API

Use the API Gateway URL (works from curl and scripts; CORS does not apply):

```bash
export API_URL="$(terraform -chdir=terraform output -raw api_url)"
echo "$API_URL"

# List available stations (from processed key prefixes)
curl "${API_URL}/catalog"

# List dates for a station
curl -s "${API_URL}/catalog?station=auck" | jq .

# Query TEC data — use sv on full-day requests for busy stations
curl -s "${API_URL}/query?station=auck&start_time=2026-06-28T00:00:00Z&end_time=2026-06-28T23:59:59Z&sv=G01" | jq .meta
# {"row_count": 519, "truncated": false}
```

### 7. Test the Reprocess API

```bash
# API_URL already set above, or:
export API_URL="$(terraform -chdir=terraform output -raw api_url)"

# Submit a reprocessing job (NAV_DAY_OFFSET is the only supported parameter override)
JOB=$(curl -s -X POST "${API_URL}/reprocess" \
  -H "Content-Type: application/json" \
  -d '{"station": "auck", "year": 2026, "doy": 179, "parameters": {"NAV_DAY_OFFSET": 2}}')
echo "$JOB"
# {"job_id": "...", "status": "queued", "trace_id": "..."}

JOB_ID=$(echo "$JOB" | python3 -c "import sys,json; print(json.load(sys.stdin)['job_id'])")

# Poll job status
curl "${API_URL}/reprocess/${JOB_ID}"

# Verify the job message landed on Reprocess_Queue (not Process_Queue)
aws sqs get-queue-attributes \
  --queue-url "$(terraform -chdir=terraform output -raw reprocess_queue_url)" \
  --attribute-names ApproximateNumberOfMessages
```

Supported `parameters` keys: `NAV_DAY_OFFSET`, `SAVE_PARQUET`, `SAVE_CSV`, `SAVE_JSON`, `SAVE_STATIC_PLOTS`, `SAVE_INTERACTIVE_PLOTS`. Any other key returns HTTP 400.

### 8. Verify Portal Access

Open the Amplify app domain in a browser:

```bash
terraform -chdir=terraform output -raw app_url
```

You should see the station browser interface. Select a station — the most recent available date loads automatically. For days with many satellites (>12), the chart hides the legend and shows a hint to use the Satellite filter for per-SV inspection.

### 9. Wire Alarm Notifications (optional but recommended)

CloudWatch alarms publish to the observability SNS topic. Subscribe an email endpoint:

```bash
TOPIC_ARN="$(terraform -chdir=terraform output -raw alarm_topic_arn)"

aws sns subscribe \
  --topic-arn "$TOPIC_ARN" \
  --protocol email \
  --notification-endpoint "you@example.com"
```

Confirm the subscription from your email inbox, then verify alarms and dashboard:

```bash
aws cloudwatch describe-alarms --alarm-names \
  dlq-messages-visible reprocess-dlq-messages-visible \
  processor-lambda-errors processor-lambda-throttles \
  process-queue-stale-messages reprocess-queue-stale-messages \
  process-queue-messages-visible ingest-sync-errors

terraform -chdir=terraform output -raw cloudwatch_dashboard_name
```

## Use a Different Processor Image Tag

To deploy a different version of the processor image:

```bash
./scripts/sync-processor-image.sh <tag>
terraform -chdir=terraform apply -var="processor_image_tag=<tag>"
```

Confirm the tag resolves to a single-platform manifest before mirroring:

```bash
docker manifest inspect ghcr.io/platformfuzz/tec-processor-image:<tag>
```

## Teardown

### Remove Terraform Resources

```bash
aws s3 rm "s3://$(terraform -chdir=terraform output -raw bucket_name)" --recursive
terraform -chdir=terraform destroy -var="region=ap-southeast-2"
```

Type `yes` to confirm.

Note: The S3 Data_Lake_Bucket must be emptied before deletion if it contains objects:

```bash
aws s3 rm s3://<bucket-name> --recursive
```

Then re-run `terraform destroy`.
