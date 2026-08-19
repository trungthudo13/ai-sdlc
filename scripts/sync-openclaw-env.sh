#!/usr/bin/env bash
set -euo pipefail

source_file=${1:?usage: sync-openclaw-env.sh SOURCE_ENV TARGET_ENV}
target_file=${2:?usage: sync-openclaw-env.sh SOURCE_ENV TARGET_ENV}

[[ -f "$source_file" ]] || {
  echo "Missing runtime environment file: $source_file" >&2
  exit 1
}

managed_keys=(
  AI_SDLC_POSTGRES_URL
  AI_SDLC_QDRANT_API_KEY
  AI_SDLC_QDRANT_COLLECTION
  AI_SDLC_QDRANT_URL
)

declare -A managed_values=()
while IFS='=' read -r key value; do
  [[ -z "$key" || "$key" == \#* ]] && continue
  for managed_key in "${managed_keys[@]}"; do
    if [[ "$key" == "$managed_key" ]]; then
      [[ -n "$value" ]] || {
        echo "Runtime key $key must not be empty" >&2
        exit 1
      }
      managed_values["$key"]=$value
    fi
  done
done <"$source_file"

for managed_key in "${managed_keys[@]}"; do
  [[ -n "${managed_values[$managed_key]:-}" ]] || {
    echo "Missing runtime key $managed_key in $source_file" >&2
    exit 1
  }
done

target_dir=$(dirname "$target_file")
mkdir -p "$target_dir"
chmod 700 "$target_dir"

tmp_file=$(mktemp "$target_dir/.ai-sdlc-env.XXXXXX")
trap 'rm -f "$tmp_file"' EXIT
chmod 600 "$tmp_file"

if [[ -f "$target_file" ]]; then
  awk '
    BEGIN { managed = "^(AI_SDLC_POSTGRES_URL|AI_SDLC_QDRANT_API_KEY|AI_SDLC_QDRANT_COLLECTION|AI_SDLC_QDRANT_URL)=" }
    $0 == "# BEGIN AI-SDLC MANAGED ENV" { in_managed = 1; next }
    $0 == "# END AI-SDLC MANAGED ENV" { in_managed = 0; next }
    !in_managed && $0 !~ managed { print }
  ' "$target_file" >"$tmp_file"
fi

{
  [[ ! -s "$tmp_file" ]] || echo
  echo "# BEGIN AI-SDLC MANAGED ENV"
  for managed_key in "${managed_keys[@]}"; do
    printf '%s=%s\n' "$managed_key" "${managed_values[$managed_key]}"
  done
  echo "# END AI-SDLC MANAGED ENV"
} >>"$tmp_file"

if [[ -f "$target_file" ]] && cmp -s "$tmp_file" "$target_file"; then
  echo "OpenClaw AI-SDLC environment is already current."
  exit 0
fi

if [[ -f "$target_file" ]]; then
  backup_file="$target_file.bak.$(date -u +%Y%m%dT%H%M%SZ)"
  cp -p "$target_file" "$backup_file"
  chmod 600 "$backup_file"
  echo "Backed up existing OpenClaw environment to $backup_file."
fi

mv "$tmp_file" "$target_file"
chmod 600 "$target_file"
trap - EXIT
echo "Synchronized AI-SDLC runtime variables into $target_file."
