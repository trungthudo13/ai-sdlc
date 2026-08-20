#!/usr/bin/env bash
set -euo pipefail

repo_root=${1:?usage: provision-qdrant.sh REPO_ROOT [--check]}
mode=${2:---apply}
env_file="$repo_root/.env"

[[ "$mode" == "--apply" || "$mode" == "--check" ]] || {
  echo "usage: provision-qdrant.sh REPO_ROOT [--check]" >&2
  exit 1
}

[[ -f "$env_file" ]] || {
  echo "Missing $env_file; run make prepare-runtime first" >&2
  exit 1
}

set -a
# shellcheck disable=SC1090
source "$env_file"
set +a

required_keys=(
  AI_SDLC_QDRANT_API_KEY
  AI_SDLC_QDRANT_COLLECTION
  AI_SDLC_QDRANT_EMBEDDING_DIMENSION
  AI_SDLC_QDRANT_EMBEDDING_MODEL
  AI_SDLC_QDRANT_DISTANCE
  AI_SDLC_QDRANT_URL
)
for required_key in "${required_keys[@]}"; do
  [[ -n "${!required_key:-}" ]] || {
    echo "Missing runtime key $required_key in $env_file" >&2
    exit 1
  }
done

[[ "$AI_SDLC_QDRANT_COLLECTION" =~ ^[A-Za-z0-9._-]+$ ]] || {
  echo "AI_SDLC_QDRANT_COLLECTION contains unsupported characters" >&2
  exit 1
}
[[ "$AI_SDLC_QDRANT_EMBEDDING_DIMENSION" =~ ^[1-9][0-9]*$ ]] || {
  echo "AI_SDLC_QDRANT_EMBEDDING_DIMENSION must be a positive integer" >&2
  exit 1
}
case "$AI_SDLC_QDRANT_DISTANCE" in
  Cosine|Euclid|Dot|Manhattan) ;;
  *)
    echo "AI_SDLC_QDRANT_DISTANCE must be Cosine, Euclid, Dot, or Manhattan" >&2
    exit 1
    ;;
esac

collection_url="${AI_SDLC_QDRANT_URL%/}/collections/$AI_SDLC_QDRANT_COLLECTION"
response_file=$(mktemp)
trap 'rm -f "$response_file"' EXIT

status=$(curl --silent --show-error \
  --output "$response_file" \
  --write-out '%{http_code}' \
  --header "api-key: $AI_SDLC_QDRANT_API_KEY" \
  "$collection_url")

if [[ "$status" == "404" ]]; then
  if [[ "$mode" == "--check" ]]; then
    echo "Qdrant collection $AI_SDLC_QDRANT_COLLECTION does not exist" >&2
    exit 1
  fi
  payload=$(printf \
    '{"vectors":{"size":%s,"distance":"%s"}}' \
    "$AI_SDLC_QDRANT_EMBEDDING_DIMENSION" \
    "$AI_SDLC_QDRANT_DISTANCE")
  curl --fail --silent --show-error \
    --request PUT \
    --header "api-key: $AI_SDLC_QDRANT_API_KEY" \
    --header 'content-type: application/json' \
    --data "$payload" \
    "$collection_url" >/dev/null
  echo "Created Qdrant collection $AI_SDLC_QDRANT_COLLECTION ($AI_SDLC_QDRANT_EMBEDDING_DIMENSION/$AI_SDLC_QDRANT_DISTANCE)."
  exit 0
fi

[[ "$status" == "200" ]] || {
  echo "Qdrant collection lookup failed with HTTP $status" >&2
  exit 1
}

python3 - "$response_file" \
  "$AI_SDLC_QDRANT_COLLECTION" \
  "$AI_SDLC_QDRANT_EMBEDDING_DIMENSION" \
  "$AI_SDLC_QDRANT_DISTANCE" <<'PY'
import json
import sys

response_path, collection, expected_size, expected_distance = sys.argv[1:]
with open(response_path, encoding="utf-8") as response_file:
    payload = json.load(response_file)

vectors = payload["result"]["config"]["params"]["vectors"]
actual_size = str(vectors.get("size"))
actual_distance = vectors.get("distance")
if actual_size != expected_size or actual_distance != expected_distance:
    raise SystemExit(
        f"Qdrant collection {collection} is incompatible: "
        f"expected {expected_size}/{expected_distance}, "
        f"found {actual_size}/{actual_distance}"
    )
PY

echo "Qdrant collection $AI_SDLC_QDRANT_COLLECTION is compatible ($AI_SDLC_QDRANT_EMBEDDING_DIMENSION/$AI_SDLC_QDRANT_DISTANCE)."
