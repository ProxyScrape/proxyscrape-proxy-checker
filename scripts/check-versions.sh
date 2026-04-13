#!/usr/bin/env bash
# Verifies that package.json version and Go appVersion are in sync.
# If a git tag is passed as $1, also checks that it matches.
#
# Usage:
#   scripts/check-versions.sh              # check package.json vs Go only
#   scripts/check-versions.sh v2.0.0-canary  # also verify git tag matches
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

PKG_VERSION=$(python3 -c "import json; print(json.load(open('$ROOT/package.json'))['version'])")
GO_VERSION=$(grep 'const appVersion' "$ROOT/backend/internal/api/server.go" | sed 's/.*"\(.*\)".*/\1/')

FAIL=0

echo "Checking version consistency..."
echo "  package.json : $PKG_VERSION"
echo "  Go backend   : $GO_VERSION"

if [ "$PKG_VERSION" != "$GO_VERSION" ]; then
    echo ""
    echo "ERROR: package.json ($PKG_VERSION) does not match Go appVersion ($GO_VERSION)"
    FAIL=1
fi

if [ -n "${1:-}" ]; then
    TAG_VERSION="${1#v}"
    echo "  Git tag      : $TAG_VERSION (from ${1})"
    if [ "$PKG_VERSION" != "$TAG_VERSION" ]; then
        echo ""
        echo "ERROR: package.json ($PKG_VERSION) does not match git tag ($TAG_VERSION)"
        FAIL=1
    fi
fi

if [ "$FAIL" -eq 1 ]; then
    echo ""
    echo "All three must match before releasing:"
    echo "  1. package.json                       → \"version\": \"X.X.X[-canary]\""
    echo "  2. backend/internal/api/server.go     → const appVersion = \"X.X.X[-canary]\""
    echo "  3. Git tag                            → vX.X.X[-canary]"
    exit 1
fi

echo "  ✓ All versions consistent: $PKG_VERSION"
