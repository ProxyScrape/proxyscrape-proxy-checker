#!/usr/bin/env bash
# Builds the native messaging host binary for the current platform/arch only.
# Fast (~1 s) because CGO_ENABLED=0 — no C toolchain needed.
# Invoked automatically via the predev npm lifecycle before `npm run dev`.
set -e

cd "$(dirname "$0")/.."

case "$(uname -s)" in
    MINGW*|CYGWIN*|MSYS*) PLATFORM=win32 ;;
    Darwin) PLATFORM=darwin ;;
    Linux)  PLATFORM=linux ;;
    *) echo "Unsupported OS: $(uname -s)" >&2; exit 1 ;;
esac

case "$(uname -m)" in
    x86_64)          ARCH=x64 ;;
    aarch64|arm64)   ARCH=arm64 ;;
    *) echo "Unsupported arch: $(uname -m)" >&2; exit 1 ;;
esac

# npm sets this automatically from package.json when running lifecycle scripts
VERSION="${npm_package_version}"

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
