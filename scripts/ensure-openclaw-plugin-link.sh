#!/usr/bin/env bash
set -euo pipefail

plugin_id=${1:?usage: ensure-openclaw-plugin-link.sh PLUGIN_ID SOURCE_DIR [FORCE]}
source_dir=${2:?usage: ensure-openclaw-plugin-link.sh PLUGIN_ID SOURCE_DIR [FORCE]}
force=${3:-0}

expected_path=$(realpath "$source_dir")

if plugin_json=$(openclaw plugins inspect "$plugin_id" --json 2>/dev/null); then
  installed_path=$(node -e '
    const value = JSON.parse(process.argv[1]);
    const path = value?.plugin?.install?.installPath ?? value?.plugin?.rootDir ?? "";
    process.stdout.write(path);
  ' "$plugin_json")

  if [[ -n "$installed_path" ]] && [[ "$(realpath "$installed_path")" == "$expected_path" ]]; then
    echo "OpenClaw plugin $plugin_id is already linked to $expected_path."
    exit 0
  fi

  if [[ "$force" != "1" ]]; then
    echo "OpenClaw plugin $plugin_id already exists at ${installed_path:-unknown path}." >&2
    echo "Refusing to replace it with $expected_path. Re-run with FORCE=1 after review." >&2
    exit 1
  fi

  echo "Replacing OpenClaw plugin $plugin_id with reviewed link $expected_path."
  openclaw plugins install --link --force "$expected_path"
else
  openclaw plugins install --link "$expected_path"
fi

openclaw plugins inspect "$plugin_id" --json >/dev/null
