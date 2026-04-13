#!/usr/bin/env bash
# Build checker binaries for all supported platforms.
#
# Requirements:
#   macOS (native):  Xcode CLT (provides libpcap headers + lib)
#   Linux (Docker):  runs a golang:bookworm container with libpcap-dev
#                    linux/arm64 uses --platform linux/arm64 (QEMU on Intel hosts,
#                    native on Apple Silicon). Requires Docker Buildx / Docker Desktop.
#   Windows x64/ARM64: NO Npcap SDK needed at compile time.
#                    gopacket/pcap on Windows is pure Go (syscall-based runtime DLL
#                    loading). Only go-sqlite3 needs CGO, which zig cc handles alone.
#                    zig (brew install zig) is required for Windows cross-compilation.
#
# NOTE: CI handles all of this automatically via .github/workflows/release.yml.
#       Run this script locally only if you need to test binary builds without
#       pushing a tag.
set -e

cd "$(dirname "$0")/.."
mkdir -p bin

BACKEND="$(pwd)/backend"
APP_VERSION=$(node -p "require('./package.json').version")
VERSION_LDFLAG="-X 'github.com/proxyscrape/checker-backend/internal/api.appVersion=${APP_VERSION}'"

echo "Building version: ${APP_VERSION}"

echo "==> darwin-arm64"
GOOS=darwin GOARCH=arm64 CGO_ENABLED=1 \
    go build -C "${BACKEND}" -ldflags="-s -w ${VERSION_LDFLAG}" -o "$(pwd)/bin/checker-darwin-arm64" ./cmd/checker
echo "    OK"

echo "==> darwin-x64"
GOOS=darwin GOARCH=amd64 CGO_ENABLED=1 \
    go build -C "${BACKEND}" -ldflags="-s -w ${VERSION_LDFLAG}" -o "$(pwd)/bin/checker-darwin-x64" ./cmd/checker
echo "    OK"

echo "==> linux-x64 (Docker)"
if ! command -v docker &> /dev/null; then
    echo "    SKIP: docker not found"
else
    docker run --rm \
        --platform linux/amd64 \
        -v "$(pwd):/workspace" \
        -w /workspace/backend \
        -e GOCACHE=/tmp/gocache \
        -e APP_VERSION="${APP_VERSION}" \
        golang:1.26.2-bookworm \
        bash -c "
            apt-get update -qq && apt-get install -y -qq libpcap-dev > /dev/null 2>&1
            CGO_ENABLED=1 GOOS=linux GOARCH=amd64 go build \
              -ldflags=\"-s -w -X 'github.com/proxyscrape/checker-backend/internal/api.appVersion=\${APP_VERSION}'\" \
              -o /workspace/bin/checker-linux-x64 ./cmd/checker
        "
    echo "    OK"
fi

echo "==> linux-arm64 (Docker, --platform linux/arm64)"
if ! command -v docker &> /dev/null; then
    echo "    SKIP: docker not found"
else
    docker run --rm \
        --platform linux/arm64 \
        -v "$(pwd):/workspace" \
        -w /workspace/backend \
        -e GOCACHE=/tmp/gocache \
        -e APP_VERSION="${APP_VERSION}" \
        golang:1.26.2-bookworm \
        bash -c "
            apt-get update -qq && apt-get install -y -qq libpcap-dev > /dev/null 2>&1
            CGO_ENABLED=1 GOOS=linux GOARCH=arm64 go build \
              -ldflags=\"-s -w -X 'github.com/proxyscrape/checker-backend/internal/api.appVersion=\${APP_VERSION}'\" \
              -o /workspace/bin/checker-linux-arm64 ./cmd/checker
        "
    echo "    OK"
fi

echo "==> win-x64 (zig cross-compile)"
if ! command -v zig &> /dev/null; then
    echo "    SKIP: zig not found (brew install zig)"
else
    GOOS=windows GOARCH=amd64 CGO_ENABLED=1 \
        CC="zig cc -target x86_64-windows-gnu" \
        go build -C "${BACKEND}" -ldflags="-s -w ${VERSION_LDFLAG}" \
        -o "$(pwd)/bin/checker-win-x64.exe" ./cmd/checker
    echo "    OK"
fi

echo "==> win-arm64 (zig cross-compile)"
if ! command -v zig &> /dev/null; then
    echo "    SKIP: zig not found (brew install zig)"
else
    GOOS=windows GOARCH=arm64 CGO_ENABLED=1 \
        CC="zig cc -target aarch64-windows-gnu" \
        go build -C "${BACKEND}" -ldflags="-s -w ${VERSION_LDFLAG}" \
        -o "$(pwd)/bin/checker-win-arm64.exe" ./cmd/checker
    echo "    OK"
fi

echo ""
echo "Binaries in bin/:"
ls -lh bin/
