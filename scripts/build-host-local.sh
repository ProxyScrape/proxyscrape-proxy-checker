#!/usr/bin/env bash
# Builds the native messaging host binary for the current platform/arch only.
# Fast (~1 s) because CGO_ENABLED=0 — no C toolchain needed.
# Invoked automatically via the predev npm lifecycle before `npm run dev`.
set -e

cd "$(dirname "$0")/.."

PLATFORM=$(node -p "process.platform")
ARCH=$(node -p "process.arch")
VERSION=$(node -p "require('./package.json').version")

case "$PLATFORM/$ARCH" in
    darwin/arm64)  GOOS=darwin  GOARCH=arm64  OUT=proxychecker-host-darwin-arm64 ;;
    darwin/x64)    GOOS=darwin  GOARCH=amd64  OUT=proxychecker-host-darwin-x64 ;;
    linux/arm64)   GOOS=linux   GOARCH=arm64  OUT=proxychecker-host-linux-arm64 ;;
    linux/x64)     GOOS=linux   GOARCH=amd64  OUT=proxychecker-host-linux-x64 ;;
    win32/arm64)   GOOS=windows GOARCH=arm64  OUT=proxychecker-host-win-arm64.exe ;;
    win32/x64)     GOOS=windows GOARCH=amd64  OUT=proxychecker-host-win-x64.exe ;;
    *) echo "Unsupported platform: $PLATFORM/$ARCH" >&2; exit 1 ;;
esac

printf "Building native messaging host (%s/%s)... " "$GOOS" "$GOARCH"

GOOS=$GOOS GOARCH=$GOARCH CGO_ENABLED=0 \
    go build -C backend \
    -ldflags="-X 'main.appVersion=${VERSION}'" \
    -o "$(pwd)/bin/${OUT}" \
    ./cmd/host

echo "done (bin/${OUT})"
