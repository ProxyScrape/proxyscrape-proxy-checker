#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."
# 1. Build React renderer (and main/preload for a consistent electron-vite build)
npm run build:renderer
# 2. Copy into Go embed target directory
# electron-vite roots each bundle at its own source directory, so the renderer
# output lands at src/renderer/dist/renderer/ rather than the project-root dist/.
mkdir -p backend/internal/api/web
cp -r src/renderer/dist/renderer/* backend/internal/api/web/
# 3. Build Go binary with webserver tag
# CGO_ENABLED=1 is required for go-sqlite3. This script must be run on the
# target Linux host (or with a CGO-capable cross-compiler toolchain).
CGO_ENABLED=1 go build -C backend -tags webserver -o ../bin/checker-webserver-linux-x64 ./cmd/checker
echo "Web server binary built: bin/checker-webserver-linux-x64"

# 4. Install to system path if running as root (production server deploy).
#    The service must be stopped first because Linux cannot overwrite a running binary.
INSTALL_PATH="/usr/local/bin/checker-webserver"
if [ -f "$INSTALL_PATH" ] && [ "$(id -u)" -eq 0 ]; then
    echo "Installing binary to $INSTALL_PATH..."
    systemctl stop checker 2>/dev/null || true
    cp bin/checker-webserver-linux-x64 "$INSTALL_PATH"
    systemctl start checker 2>/dev/null || true
    echo "Installed and service restarted ✓"
fi
