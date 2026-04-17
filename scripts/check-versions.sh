#!/usr/bin/env bash
# Verifies release tag discipline before any build job runs.
#
# Checks:
#   1. package.json version matches the git tag
#   2. Version follows the 2.X.Y[-canary] scheme
#   3. Stable tags have Y=0 (no -canary suffix)
#   4. Canary tags have Y>=1 (with -canary suffix)
#   5. Canary tags are only pushed from the canary branch
#   6. Stable tags are only pushed from master
#   7. Stable tag X must match the latest canary cycle X
#      (prevents promoting 2.2.x-canary as 2.3.0 — the mistake we made)
#   8. First canary tag after a stable must have X = last_stable_X + 1
#      (prevents two canary cycles sharing the same X as a stable)
#
# Usage:
#   scripts/check-versions.sh v2.2.1-canary
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ -z "${1:-}" ]; then
    echo "Usage: check-versions.sh <tag>"
    exit 1
fi

TAG="$1"
TAG_VERSION="${TAG#v}"

PKG_VERSION=$(python3 -c "import json; print(json.load(open('$ROOT/package.json'))['version'])")

FAIL=0

echo "Checking version consistency..."
echo "  Git tag      : $TAG_VERSION (from $TAG)"
echo "  package.json : $PKG_VERSION"

# ── 1. package.json must match the tag ───────────────────────────────────────
if [ "$PKG_VERSION" != "$TAG_VERSION" ]; then
    echo ""
    echo "ERROR: package.json ($PKG_VERSION) does not match git tag ($TAG_VERSION)"
    echo "  Fix: npm version $TAG_VERSION --no-git-tag-version"
    FAIL=1
fi

# ── 2. Version format must be 2.X.Y or 2.X.Y-canary ─────────────────────────
if [[ "$TAG_VERSION" =~ ^2\.([0-9]+)\.([0-9]+)(-canary)?$ ]]; then
    X="${BASH_REMATCH[1]}"
    Y="${BASH_REMATCH[2]}"
    SUFFIX="${BASH_REMATCH[3]}"
else
    echo ""
    echo "ERROR: Tag '$TAG_VERSION' does not match required format '2.X.Y' or '2.X.Y-canary'"
    FAIL=1
    # Can't do further checks without a valid parse
    if [ "$FAIL" -eq 1 ]; then exit 1; fi
fi

# ── 3. Stable: Y must be 0, no -canary suffix ────────────────────────────────
if [ -z "$SUFFIX" ]; then
    if [ "$Y" != "0" ]; then
        echo ""
        echo "ERROR: Stable tag '$TAG_VERSION' must have Y=0 (got Y=$Y)"
        echo "  Stable releases always use 2.X.0"
        FAIL=1
    fi
fi

# ── 4. Canary: Y must be >= 1, must have -canary suffix ──────────────────────
if [ "$SUFFIX" = "-canary" ]; then
    if [ "$Y" -lt 1 ]; then
        echo ""
        echo "ERROR: Canary tag '$TAG_VERSION' must have Y>=1 (got Y=$Y)"
        echo "  Use 2.X.1-canary for the first canary of a new cycle"
        FAIL=1
    fi
fi

# ── 5 & 6. Branch alignment ──────────────────────────────────────────────────
# Fetch branch heads so we can check reachability.
# In GitHub Actions the default checkout is shallow+detached at the tag commit.
git fetch --no-tags origin canary master 2>/dev/null || true

if [ "$SUFFIX" = "-canary" ]; then
    # Canary tag must be reachable from origin/canary
    if ! git merge-base --is-ancestor HEAD origin/canary 2>/dev/null; then
        echo ""
        echo "ERROR: Canary tag '$TAG' must be pushed from the canary branch"
        echo "  The tagged commit is not reachable from origin/canary"
        FAIL=1
    fi
else
    # Stable tag must be reachable from origin/master
    if ! git merge-base --is-ancestor HEAD origin/master 2>/dev/null; then
        echo ""
        echo "ERROR: Stable tag '$TAG' must be pushed from master"
        echo "  The tagged commit is not reachable from origin/master"
        FAIL=1
    fi
fi

# ── 7. Stable tag: X must match the latest canary cycle X ────────────────────
# Prevents: promoting 2.2.x-canary as 2.3.0 instead of 2.2.0
if [ -z "$SUFFIX" ]; then
    LATEST_CANARY=$(git tag --list 'v2.*-canary' --sort=-version:refname 2>/dev/null | head -1)
    if [ -n "$LATEST_CANARY" ]; then
        if [[ "$LATEST_CANARY" =~ ^v2\.([0-9]+)\.[0-9]+-canary$ ]]; then
            CANARY_X="${BASH_REMATCH[1]}"
            if [ "$CANARY_X" != "$X" ]; then
                echo ""
                echo "ERROR: Stable tag '$TAG_VERSION' has X=$X but the latest canary cycle is X=$CANARY_X"
                echo "  Stable must use the same X as the canary it promotes."
                echo "  Expected stable version: 2.$CANARY_X.0"
                echo "  Latest canary was: $LATEST_CANARY"
                FAIL=1
            fi
        fi
    fi
fi

# ── 8. First canary after a stable: X must be last_stable_X + 1 ──────────────
# Prevents: starting 2.3.1-canary when last stable was 2.3.0 (same X collision)
if [ "$SUFFIX" = "-canary" ]; then
    LATEST_STABLE=$(git tag --list 'v2.*' --sort=-version:refname 2>/dev/null \
        | grep -v '\-canary' | head -1)
    if [ -n "$LATEST_STABLE" ]; then
        if [[ "$LATEST_STABLE" =~ ^v2\.([0-9]+)\.0$ ]]; then
            STABLE_X="${BASH_REMATCH[1]}"
            if [ "$X" -le "$STABLE_X" ]; then
                echo ""
                echo "ERROR: Canary tag '$TAG_VERSION' has X=$X but the last stable was X=$STABLE_X"
                echo "  A new canary cycle after a stable must use X=$((STABLE_X + 1)) or higher."
                echo "  Expected: 2.$((STABLE_X + 1)).1-canary"
                FAIL=1
            fi
        fi
    fi
fi

# ─────────────────────────────────────────────────────────────────────────────
if [ "$FAIL" -eq 1 ]; then
    exit 1
fi

echo "  ✓ Tag format valid: 2.$X.$Y$SUFFIX"
echo "  ✓ Version consistent"
echo "  ✓ Branch alignment correct"
echo "  ✓ X-cycle consistency correct"
