#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."

# Verify Go is available — the Electron main process uses `go run` in dev mode.
if ! command -v go &>/dev/null; then
    echo "Error: Go is not installed or not on PATH." >&2
    echo "Install Go from https://go.dev/dl/ then re-run this script." >&2
    exit 1
fi

npm run dev
