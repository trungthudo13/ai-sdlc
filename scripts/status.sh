#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
repo_root=$(cd "$script_dir/.." && pwd)

show_tool() {
  local tool_name=$1
  if command -v "$tool_name" >/dev/null 2>&1; then
    printf '%-10s %s\n' "$tool_name" "$($tool_name --version 2>/dev/null | head -n 1)"
  else
    printf '%-10s %s\n' "$tool_name" "missing"
  fi
}

show_tool openclaw
show_tool codex
show_tool node
show_tool make

if command -v codex >/dev/null 2>&1; then
  codex login status || true
fi

if command -v openclaw >/dev/null 2>&1; then
  openclaw config validate || true
  openclaw plugins inspect codex || true
  openclaw plugins inspect ai-sdlc || true
  openclaw daemon status || true
fi

if command -v docker >/dev/null 2>&1 && [[ -f "$repo_root/.env" ]]; then
  docker compose \
    --env-file "$repo_root/.env" \
    -f "$repo_root/compose.yaml" \
    ps || true
fi
