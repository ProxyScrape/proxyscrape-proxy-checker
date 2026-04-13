#!/usr/bin/env bash
# Verifies that the package.json version matches the git tag being pushed.
# The Go appVersion is now injected at build time via -ldflags (not hardcoded),
# so there is no longer a server.go version to compare against.
#
# Usage:
#   scripts/check-versions.sh              # print version only (branch push)
#   scripts/check-versions.sh v2.0.0-canary  # also verify tag matches package.json
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

PKG_VERSION=$(python3 -c "import json; print(json.load(open('$ROOT/package.json'))['version'])")

FAIL=0

echo "Checking version consistency..."
echo "  package.json : $PKG_VERSION"

if [ -n "${1:-}" ]; then
    TAG_VERSION="${1#v}"
    echo "  Git tag      : $TAG_VERSION (from ${1})"
    if [ "$PKG_VERSION" != "$TAG_VERSION" ]; then
        echo ""
        echo "ERROR: package.json ($PKG_VERSION) does not match git tag ($TAG_VERSION)"
        echo ""
        echo "Update package.json version to match the tag before pushing:"
        echo "  \"version\": \"${TAG_VERSION}\""
        FAIL=1
    fi
fi

if [ "$FAIL" -eq 1 ]; then
    exit 1
fi

echo "  ✓ Version consistent: $PKG_VERSION"
