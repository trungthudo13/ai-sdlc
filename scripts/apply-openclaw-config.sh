#!/usr/bin/env bash
set -euo pipefail

patch_file=${1:?usage: apply-openclaw-config.sh PATCH_FILE}

[[ -f "$patch_file" ]] || {
  echo "Missing OpenClaw config patch: $patch_file" >&2
  exit 1
}

merge_array_value() {
  local config_path=$1
  local required_value=$2
  local current_json
  local normalized_current
  local merged_json

  if ! current_json=$(openclaw config get "$config_path" --json 2>/dev/null); then
    current_json='[]'
  fi

  normalized_current=$(node -e '
    const value = JSON.parse(process.argv[1]);
    if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
      throw new Error("expected a JSON string array");
    }
    process.stdout.write(JSON.stringify(value));
  ' "$current_json")

  merged_json=$(node -e '
    const values = JSON.parse(process.argv[1]);
    const required = process.argv[2];
    process.stdout.write(JSON.stringify(values.includes(required) ? values : [...values, required]));
  ' "$normalized_current" "$required_value")

  if [[ "$normalized_current" == "$merged_json" ]]; then
    echo "$config_path already contains $required_value; leaving other entries unchanged."
    return
  fi

  openclaw config set "$config_path" "$merged_json" --strict-json --replace
}

openclaw config patch --file "$patch_file"
merge_array_value plugins.allow codex
merge_array_value plugins.allow ai-sdlc
merge_array_value tools.alsoAllow ai-sdlc
openclaw config validate
