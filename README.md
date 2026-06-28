# Event-Driven Serverless Platform Demo

AWS event-driven platform for GNSS RINEX ingestion, PyTECGg TEC calibration, and interactive visualization.

GeoNet hourly RINEX flows through SQS into a processor Lambda container image, lands as Parquet in S3, and is exposed via API Gateway with an Amplify-hosted portal. All infrastructure is **Terraform**.

## Architecture

```text
GeoNet (S3) → ingest-sync (schedule) → Data Lake (raw/rinexhourly/)
                                          ↓ S3 → process-queue
                                          ↓ API → reprocess-queue
                                   processor Lambda (container)
                                          ↓
                                   Data Lake (processed/tec/)
                                          ↓
                          query-api / reprocess-api (API Gateway)
                                          ↓
                                   Portal (Amplify)
```

| Layer | Components |
| --- | --- |
| Ingest | EventBridge Scheduler, `ingest-sync` Lambda (Python 3.14) |
| Processing | SQS + DLQs, processor Lambda container (Python 3.13 image) |
| APIs | `query-api`, `reprocess-api`, DynamoDB jobs table (Python 3.14) |
| Portal | React/Vite SPA — time series and IPP map |

Processor image: [`ghcr.io/platformfuzz/tec-processor-image`](https://github.com/platformfuzz/tec-processor-image), mirrored to ECR via `scripts/sync-processor-image.sh`. Ingest and reprocess queues trigger the same function with separate concurrency caps.

Station IDs are 4-character alphanumeric (`[A-Za-z0-9]{4}`), case-insensitive at the API and lowercase in S3 keys.

Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · [docs/DATA_CONTRACT.md](docs/DATA_CONTRACT.md)

## Repository layout

```text
services/ingest-sync, query-api, reprocess-api
terraform/          Root + ingest · ingest-scheduler · processing · presentation · observability
scripts/            sync-processor-image.sh, deploy-amplify.sh, build-lambda-packages.sh
web/                Amplify portal (Vite + React)
docs/               Architecture, data contract, walkthrough
```

## Prerequisites

- AWS CLI (S3, Lambda, IAM, SQS, DynamoDB, API Gateway, Amplify, EventBridge Scheduler, CloudWatch, SNS, ECR)
- Terraform >= 1.6
- Docker with `buildx` (processor image sync)
- Python >= 3.14 and Node.js >= 20 (local tests; Node required for portal deploy on apply)
- `jq` recommended for API examples below

## Deploy

Run Terraform from the repo root with `-chdir=terraform`.

### 1. Init

```bash
terraform -chdir=terraform init
```

### 2. ECR + processor image

```bash
terraform -chdir=terraform apply -target=module.processing[0].aws_ecr_repository.processor_image
./scripts/sync-processor-image.sh
```

Image tag defaults to `latest` (must match `processor_image_tag` in Terraform).

### 3. Full stack

Staged apply (scheduler last):

```bash
terraform -chdir=terraform apply -target=module.processing
terraform -chdir=terraform apply -target=module.ingest_scheduler
terraform -chdir=terraform apply
```

Or, after step 2, a single `terraform -chdir=terraform apply` is enough if you do not need staging.

Presentation layer enabled by default builds and uploads the portal to Amplify on apply. Skip that in CI:

```bash
terraform -chdir=terraform apply -var='deploy_amplify_on_apply=false'
```

Deploy the portal later with `AMPLIFY_APP_ID`, `VITE_API_URL`, and `WEB_SOURCE_DIR` set — see `scripts/deploy-amplify.sh`.

### Outputs

```bash
terraform -chdir=terraform output api_url      # REST API (curl)
terraform -chdir=terraform output app_url      # hosted portal
terraform -chdir=terraform output bucket_name
terraform -chdir=terraform output processor_image_uri
```

### Post-deploy: lock API CORS to Amplify

Required for the **hosted portal** only (not for `curl`):

```bash
terraform -chdir=terraform apply \
  -var="amplify_domain=$(terraform -chdir=terraform output -raw cors_domain)"
```

### Common Terraform variables

| Variable | Default | Notes |
| --- | --- | --- |
| `region` | `ap-southeast-2` | |
| `schedule_expression` | `rate(1 hour)` | Ingest cadence (UTC) |
| `lookback_hours` | `1` | Rolling ingest window; keep ≥ schedule interval |
| `processor_maximum_concurrency` | `15` | Ingest queue → processor |
| `reprocess_maximum_concurrency` | `2` | Reprocess queue → processor |
| `processor_image_tag` | `latest` | Must exist in ECR after sync |

Step-by-step verification: [docs/WALKTHROUGH.md](docs/WALKTHROUGH.md).

## Usage

### REST API

```bash
export API_URL="$(terraform -chdir=terraform output -raw api_url)"
```

Requires `enable_presentation = true` (default).

**Catalog** — list stations, then dates for a station:

```bash
curl -s "${API_URL}/catalog" | jq .
curl -s "${API_URL}/catalog?station=auck" | jq .
# {"dates": [{"year": 2026, "doy": 179}, {"year": 2026, "doy": 172}]}
```

`doy` is day-of-year (UTC). DOY `179` in `2026` is `2026-06-28`.

**Query** — use `/catalog` dates; add `&sv=G01` on busy full-day queries to avoid the Lambda 6 MB cap:

```bash
curl -s "${API_URL}/query?station=auck&start_time=2026-06-28T00:00:00Z&end_time=2026-06-28T23:59:59Z&sv=G01" | jq .meta
# {"row_count": 519, "truncated": false}
```

Max range 7 days. `QUERY_MAX_ROWS` defaults to `2000`; check `meta.truncated`.

**Reprocess**:

```bash
curl -s -X POST "${API_URL}/reprocess" \
  -H "Content-Type: application/json" \
  -d '{"station": "auck", "year": 2026, "doy": 179, "parameters": {"NAV_DAY_OFFSET": 2}}' | jq .
# {"job_id": "...", "status": "queued", ...}

JOB_ID=<job_id from response>
curl -s "${API_URL}/reprocess/${JOB_ID}" | jq .
```

Schemas: [docs/DATA_CONTRACT.md](docs/DATA_CONTRACT.md).

### Portal

```bash
terraform -chdir=terraform output -raw app_url
```

Browse stations/dates, plot `vtec` / `stec` / `veq`, view IPP map, submit reprocess jobs. Local `npm run dev` cannot call the live API (CORS is Amplify-only). After UI changes: `cd web && npm test`, then `./scripts/deploy-amplify.sh`.

### Manual ingest

```bash
aws lambda invoke --function-name ingest-sync --payload '{}' /dev/stdout
```

New `raw/rinexhourly/` objects notify `process-queue`; the processor Lambda consumes them directly.

## Development

```bash
cd services/ingest-sync   # or query-api, reprocess-api
pip install -e ".[dev]"
pytest -q

cd web && npm test
terraform -chdir=terraform validate
```

## Teardown

```bash
aws s3 rm "s3://$(terraform -chdir=terraform output -raw bucket_name)" --recursive
terraform -chdir=terraform destroy
```

## License

See [LICENSE](LICENSE).
