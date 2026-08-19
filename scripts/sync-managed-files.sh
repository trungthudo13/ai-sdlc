#!/usr/bin/env bash
set -euo pipefail

source_dir=${1:?source directory is required}
destination_dir=${2:?destination directory is required}
bundle_label=${3:-managed files}
force_replace=${AI_SDLC_FORCE:-0}

if [[ ! -d "$source_dir" ]]; then
  echo "Missing source directory: $source_dir" >&2
  exit 1
fi

mkdir -p "$destination_dir"
timestamp=$(date -u +%Y%m%dT%H%M%SZ)

for source_file in "$source_dir"/*; do
  [[ -f "$source_file" ]] || continue
  destination_file="$destination_dir/$(basename "$source_file")"

  if [[ ! -e "$destination_file" ]]; then
    install -m 0644 "$source_file" "$destination_file"
    echo "Installed $destination_file"
    continue
  fi

  if cmp -s "$source_file" "$destination_file"; then
    echo "Unchanged $destination_file"
    continue
  fi

  if [[ "$force_replace" != "1" ]]; then
    echo "Refusing to overwrite conflicting $bundle_label file: $destination_file" >&2
    echo "Review it, then rerun with FORCE=1 to back up and replace." >&2
    exit 1
  fi

  backup_file="${destination_file}.bak.${timestamp}"
  cp -p "$destination_file" "$backup_file"
  install -m 0644 "$source_file" "$destination_file"
  echo "Backed up $destination_file to $backup_file"
  echo "Replaced $destination_file"
done
