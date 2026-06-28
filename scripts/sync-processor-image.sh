#!/usr/bin/env bash
set -euo pipefail

# Lambda only accepts images from ECR in your account/region, and only single-arch
# Docker v2 manifests (not OCI image indexes / provenance attestations from GHCR).

TAG="${1:-latest}"
PLATFORM="${PROCESSOR_IMAGE_PLATFORM:-linux/amd64}"
REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-$(aws configure get region 2>/dev/null || true)}}"
REGION="${REGION:-ap-southeast-2}"
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"

GHCR_IMAGE="ghcr.io/platformfuzz/tec-processor-image:${TAG}"
GHCR_REPO="ghcr.io/platformfuzz/tec-processor-image"
REPO_NAME="tec-processor-image"
ECR_URI="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${REPO_NAME}"
ECR_IMAGE="${ECR_URI}:${TAG}"

if ! aws ecr describe-repositories --repository-names "${REPO_NAME}" --region "${REGION}" >/dev/null 2>&1; then
  echo "ECR repository ${REPO_NAME} not found in ${REGION}." >&2
  echo "Create it first: cd terraform && terraform apply -target=module.processing[0].aws_ecr_repository.processor_image" >&2
  exit 1
fi

aws ecr get-login-password --region "${REGION}" \
  | docker login --username AWS --password-stdin "${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"

# Replace any prior tag (often an unsupported multi-manifest index from a plain docker pull/push).
aws ecr batch-delete-image \
  --repository-name "${REPO_NAME}" \
  --image-ids "imageTag=${TAG}" \
  --region "${REGION}" \
  >/dev/null 2>&1 || true

if ! docker buildx version >/dev/null 2>&1; then
  echo "docker buildx is required to resolve a single-platform digest from GHCR." >&2
  exit 1
fi

platform_os="${PLATFORM%%/*}"
platform_arch="${PLATFORM##*/}"

platform_digest="$(docker buildx imagetools inspect --raw "${GHCR_IMAGE}" \
  | python3 -c 'import json,sys; d=json.load(sys.stdin); os_=sys.argv[1]; arch=sys.argv[2];
for m in d.get("manifests", []):
    p = m.get("platform", {})
    if p.get("os")==os_ and p.get("architecture")==arch:
        print(m["digest"]); sys.exit(0)
sys.exit(1)' "${platform_os}" "${platform_arch}")"

if [[ -z "${platform_digest}" ]]; then
  echo "Could not resolve digest for platform ${PLATFORM} from ${GHCR_IMAGE}." >&2
  exit 1
fi

source_ref="${GHCR_REPO}@${platform_digest}"
echo "Copying platform digest ${source_ref} -> ${ECR_IMAGE}"
docker pull "${source_ref}"
docker tag "${source_ref}" "${ECR_IMAGE}"
docker push "${ECR_IMAGE}"

artifact_type="$(aws ecr describe-images \
  --repository-name "${REPO_NAME}" \
  --image-ids "imageTag=${TAG}" \
  --region "${REGION}" \
  --query 'imageDetails[0].artifactMediaType' \
  --output text 2>/dev/null || true)"
if [[ "${artifact_type}" == *"index"* ]]; then
  echo "ECR still has an image index (Lambda incompatible). Re-run sync and verify Docker/buildx versions." >&2
  exit 1
fi

manifest_type="$(aws ecr describe-images \
  --repository-name "${REPO_NAME}" \
  --image-ids "imageTag=${TAG}" \
  --region "${REGION}" \
  --query 'imageDetails[0].imageManifestMediaType' \
  --output text 2>/dev/null || true)"
if [[ "${manifest_type}" != "application/vnd.docker.distribution.manifest.v2+json" ]] \
  && [[ "${manifest_type}" != "application/vnd.oci.image.manifest.v1+json" ]]; then
  echo "Unexpected manifest type for Lambda: ${manifest_type}" >&2
  exit 1
fi

echo "Mirrored ${GHCR_IMAGE} (${PLATFORM}) -> ${ECR_IMAGE}"
