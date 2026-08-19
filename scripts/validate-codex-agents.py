#!/usr/bin/env python3
from __future__ import annotations

import sys
import tomllib
from pathlib import Path


REQUIRED_FIELDS = ("name", "description", "developer_instructions")
SANDBOX_MODES = {"read-only", "workspace-write", "danger-full-access"}


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: validate-codex-agents.py <agents-directory>", file=sys.stderr)
        return 2

    agents_dir = Path(sys.argv[1])
    files = sorted(agents_dir.glob("*.toml"))
    if not files:
        print(f"no Codex agent files found in {agents_dir}", file=sys.stderr)
        return 1

    names: set[str] = set()
    errors: list[str] = []

    for path in files:
        try:
            data = tomllib.loads(path.read_text(encoding="utf-8"))
        except (OSError, tomllib.TOMLDecodeError) as exc:
            errors.append(f"{path}: {exc}")
            continue

        for field in REQUIRED_FIELDS:
            value = data.get(field)
            if not isinstance(value, str) or not value.strip():
                errors.append(f"{path}: missing non-empty {field}")

        name = data.get("name")
        if isinstance(name, str):
            if name in names:
                errors.append(f"{path}: duplicate agent name {name!r}")
            names.add(name)

        sandbox_mode = data.get("sandbox_mode")
        if sandbox_mode not in SANDBOX_MODES:
            errors.append(f"{path}: unsupported sandbox_mode {sandbox_mode!r}")

    if errors:
        print("Codex agent validation failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    print(f"Validated {len(files)} Codex agent profiles: {', '.join(sorted(names))}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
