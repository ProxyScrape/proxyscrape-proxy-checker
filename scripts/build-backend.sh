#!/usr/bin/env bash
# Build checker binaries for all supported platforms.
#
# Requirements:
#   macOS (native):  Xcode CLT (provides libpcap headers + lib)
#   Linux (Docker):  runs a golang:alpine container with libpcap-dev
#   Windows:         requires Npcap SDK extracted to backend/cgo-vendor/npcap-sdk/
#                    (download from https://npcap.com/dist/npcap-sdk-1.13.zip)
#
# zig (brew install zig) is required ONLY for Windows cross-compilation from macOS.
set -e

cd "$(dirname "$0")/.."
mkdir -p bin

BACKEND="$(pwd)/backend"
CGO_VENDOR="${BACKEND}/cgo-vendor"

echo "==> darwin-arm64"
GOOS=darwin GOARCH=arm64 CGO_ENABLED=1 \
    go build -C "${BACKEND}" -ldflags="-s -w" -o "$(pwd)/bin/checker-darwin-arm64" ./cmd/checker
echo "    OK"

echo "==> darwin-x64"
GOOS=darwin GOARCH=amd64 CGO_ENABLED=1 \
    go build -C "${BACKEND}" -ldflags="-s -w" -o "$(pwd)/bin/checker-darwin-x64" ./cmd/checker
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
        golang:1.26.2-bookworm \
        bash -c "
            apt-get update -qq && apt-get install -y -qq libpcap-dev > /dev/null 2>&1
            CGO_ENABLED=1 GOOS=linux GOARCH=amd64 go build -ldflags='-s -w' -o /workspace/bin/checker-linux-x64 ./cmd/checker
        "
    echo "    OK"
fi

echo "==> win-x64 (zig cross-compile, requires Npcap SDK)"
NPCAP_SDK="${CGO_VENDOR}/npcap-sdk"
if [ ! -d "${NPCAP_SDK}/Include" ]; then
    echo "    SKIP: Npcap SDK not found at backend/cgo-vendor/npcap-sdk/"
    echo "    Download from https://npcap.com/dist/npcap-sdk-1.13.zip and extract there"
elif ! command -v zig &> /dev/null; then
    echo "    SKIP: zig not found (brew install zig)"
else
    GOOS=windows GOARCH=amd64 CGO_ENABLED=1 \
        CC="zig cc -target x86_64-windows-gnu" \
        CGO_CFLAGS="-I${NPCAP_SDK}/Include" \
        CGO_LDFLAGS="-L${NPCAP_SDK}/Lib/x64 -lwpcap -lPacket" \
        go build -C "${BACKEND}" -ldflags="-s -w" \
        -o "$(pwd)/bin/checker-win-x64.exe" ./cmd/checker
    echo "    OK"
fi

echo ""
echo "Binaries in bin/:"
ls -lh bin/
