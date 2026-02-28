#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo "Usage: scripts/safe-search.sh <pattern> <path...>"
  exit 1
fi

pattern="$1"
shift

if command -v rg >/dev/null 2>&1; then
  rg "$pattern" "$@"
else
  grep -RIn -- "$pattern" "$@"
fi
