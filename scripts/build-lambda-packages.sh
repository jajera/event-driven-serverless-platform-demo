#!/usr/bin/env bash
# Build Lambda deployment zips with application code + pinned boto3.
# When invoked by Terraform external data source, reads JSON query on stdin and
# prints JSON with base64 SHA256 hashes of each requested package.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_ROOT="${ROOT}/terraform/.build"
REQ="${ROOT}/services/lambda-requirements.txt"
PIP="${PIP:-pip3}"
CACHE_HASH_FILE="${BUILD_ROOT}/.lambda-source-hash"

if command -v python3.14 >/dev/null 2>&1; then
  PYTHON=python3.14
elif command -v python3 >/dev/null 2>&1; then
  PYTHON=python3
else
  echo "python3 is required to build Lambda packages" >&2
  exit 1
fi

if [[ -t 0 ]]; then
  QUERY_JSON="{}"
else
  QUERY_JSON="$(cat)"
fi

SOURCE_HASH="$("${PYTHON}" -c 'import json, sys; data=json.loads(sys.argv[1]); print(data.get("source_hash") or "")' "${QUERY_JSON}")"
PACKAGES="$("${PYTHON}" -c 'import json, sys; data=json.loads(sys.argv[1]); print(data.get("packages") or "")' "${QUERY_JSON}")"

zip_b64_sha256() {
  "${PYTHON}" -c "import base64,hashlib,sys; print(base64.b64encode(hashlib.sha256(open(sys.argv[1],'rb').read()).digest()).decode())" "$1"
}

build_query_api() {
  local pkg_dir="${BUILD_ROOT}/query_api_pkg"
  local zip_path="${BUILD_ROOT}/query_api.zip"
  local src_dir="${ROOT}/services/query-api/src"

  rm -rf "${pkg_dir}"
  mkdir -p "${pkg_dir}"
  cp -r "${src_dir}/." "${pkg_dir}/"

  "${PIP}" install -r "${REQ}" -t "${pkg_dir}" --upgrade --quiet \
    --platform manylinux2014_x86_64 \
    --implementation cp \
    --python-version 3.14 \
    --only-binary=:all:

  rm -f "${zip_path}"
  (cd "${pkg_dir}" && zip -qr "${zip_path}" .)
}

should_build=true
if [[ -n "${SOURCE_HASH}" && -f "${CACHE_HASH_FILE}" && "$(cat "${CACHE_HASH_FILE}")" == "${SOURCE_HASH}" ]]; then
  should_build=false
fi

if [[ "${should_build}" == true ]]; then
  mkdir -p "${BUILD_ROOT}"
  IFS=',' read -r -a package_list <<< "${PACKAGES}"
  for package in "${package_list[@]}"; do
    package="${package// /}"
    case "${package}" in
      query-api) build_query_api ;;
      "") ;;
      *) echo "Unknown package: ${package}" >&2; exit 1 ;;
    esac
  done
  if [[ -n "${SOURCE_HASH}" ]]; then
    echo "${SOURCE_HASH}" > "${CACHE_HASH_FILE}"
  fi
fi

export BUILD_ROOT PACKAGES
"${PYTHON}" - <<'PY'
import base64
import hashlib
import json
import os
import sys

packages = [item.strip() for item in os.environ.get("PACKAGES", "").split(",") if item.strip()]
build_root = os.environ["BUILD_ROOT"]
result = {}
for package in packages:
    slug = package.replace("-", "_")
    path = os.path.join(build_root, f"{slug}.zip")
    try:
        with open(path, "rb") as fh:
            result[f"{slug}_hash"] = base64.b64encode(hashlib.sha256(fh.read()).digest()).decode()
    except FileNotFoundError:
        print(json.dumps({"error": f"missing package zip: {path}"}), file=sys.stderr)
        sys.exit(1)
print(json.dumps(result))
PY
