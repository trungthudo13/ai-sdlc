#!/usr/bin/env bash
set -euo pipefail

repo_root=${1:?usage: migrate-postgres.sh REPO_ROOT}

docker compose \
  --env-file "$repo_root/.env" \
  -f "$repo_root/compose.yaml" \
  exec -T postgres sh -ceu '
    for migration in /migrations/*.sql; do
      echo "Applying ${migration}"
      psql --set ON_ERROR_STOP=1 \
        --username "$POSTGRES_USER" \
        --dbname "$POSTGRES_DB" \
        --file "$migration"
    done
  '
