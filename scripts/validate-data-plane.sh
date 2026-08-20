#!/usr/bin/env bash
set -euo pipefail

repo_root=${1:?usage: validate-data-plane.sh REPO_ROOT}
env_file="$repo_root/.env"

[[ -f "$env_file" ]] || {
  echo "Missing $env_file; run make prepare-runtime first" >&2
  exit 1
}

set -a
# shellcheck disable=SC1090
source "$env_file"
set +a

compose=(
  docker compose
  --env-file "$env_file"
  -f "$repo_root/compose.yaml"
)

"${compose[@]}" config --quiet
"${compose[@]}" exec -T postgres \
  psql --set ON_ERROR_STOP=1 \
  --username "$AI_SDLC_POSTGRES_USER" \
  --dbname "$AI_SDLC_POSTGRES_DB" \
  --tuples-only --no-align \
  --command "SELECT count(*) FROM ai_sdlc.schema_migrations;" \
  | grep -qx '2'

qdrant_health=$(curl --fail --silent --show-error \
  --header "api-key: $AI_SDLC_QDRANT_API_KEY" \
  "$AI_SDLC_QDRANT_URL/healthz")
[[ -n "$qdrant_health" ]]

"$repo_root/scripts/provision-qdrant.sh" "$repo_root" --check

echo "PostgreSQL migrations, Qdrant health, and knowledge collection are valid."
