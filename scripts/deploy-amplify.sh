#!/usr/bin/env bash
# Build the Vite portal and deploy to Amplify Hosting via the manual deployment API.
# No Git repository connection required. Invoked by Terraform when deploy_amplify_on_apply=true.

set -euo pipefail

WEB_DIR="${WEB_SOURCE_DIR:?WEB_SOURCE_DIR is required}"
APP_ID="${AMPLIFY_APP_ID:?AMPLIFY_APP_ID is required}"
BRANCH="${AMPLIFY_BRANCH:-main}"
API_URL="${VITE_API_URL:?VITE_API_URL is required}"
REGION="${AWS_REGION:-ap-southeast-2}"

export AWS_REGION="${REGION}"

echo "Building portal (VITE_API_URL=${API_URL})..."
cd "${WEB_DIR}"
if [[ ! -d node_modules ]]; then
  npm ci
fi
VITE_API_URL="${API_URL}" npm run build

echo "Packaging dist/..."
(cd dist && zip -qr /tmp/amplify-dist.zip .)

echo "Creating Amplify deployment for app ${APP_ID} branch ${BRANCH}..."
DEPLOY_JSON="$(aws amplify create-deployment \
  --app-id "${APP_ID}" \
  --branch-name "${BRANCH}" \
  --output json)"

JOB_ID="$(python3 -c "import json,sys; print(json.load(sys.stdin)['jobId'])" <<<"${DEPLOY_JSON}")"
ZIP_URL="$(python3 -c "import json,sys; print(json.load(sys.stdin)['zipUploadUrl'])" <<<"${DEPLOY_JSON}")"

echo "Uploading artifact..."
curl -sS -X PUT -T /tmp/amplify-dist.zip \
  -H "Content-Type: application/zip" \
  "${ZIP_URL}" \
  -o /dev/null -w "upload HTTP %{http_code}\n"

echo "Starting deployment job ${JOB_ID}..."
aws amplify start-deployment \
  --app-id "${APP_ID}" \
  --branch-name "${BRANCH}" \
  --job-id "${JOB_ID}" \
  --output json >/dev/null

echo "Waiting for deployment..."
for _ in $(seq 1 60); do
  STATUS="$(aws amplify get-job \
    --app-id "${APP_ID}" \
    --branch-name "${BRANCH}" \
    --job-id "${JOB_ID}" \
    --query 'job.summary.status' \
    --output text)"
  echo "  status: ${STATUS}"
  if [[ "${STATUS}" == "SUCCEED" ]]; then
    URL="https://${BRANCH}.$(aws amplify get-app --app-id "${APP_ID}" --query 'app.defaultDomain' --output text)"
    echo "Deployment complete: ${URL}"
    exit 0
  fi
  if [[ "${STATUS}" == "FAILED" ]]; then
    echo "Deployment failed. Check Amplify console for job ${JOB_ID}." >&2
    exit 1
  fi
  sleep 5
done

echo "Deployment timed out waiting for job ${JOB_ID}." >&2
exit 1
