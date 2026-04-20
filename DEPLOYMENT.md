# Web Server Deployment

This document covers deploying the proxy checker as a public-facing web server in guest mode.

---

## Overview

| Component | Detail |
|---|---|
| Branch | `web-prod` (branched from `canary`, no desktop versioning) |
| Mode | Guest — anonymous sessions via HttpOnly cookie, no login |
| Stack | Go binary (CGO, SQLite) + embedded React SPA → Nginx (TLS) |

---

## Branch: `web-prod`

`web-prod` is a long-lived branch that exists solely for the hosted web deployment. Key differences from `canary`/`master`:

- `package.json` version has no `-canary` suffix → suppresses the canary banner in the UI
- The `.githooks/pre-commit` desktop version gate is removed (desktop builds are irrelevant here)
- No desktop release CI is triggered — only the Go webserver binary matters

To pull fixes from `canary` into `web-prod`:

```bash
git checkout web-prod
git merge canary --no-edit
git push origin web-prod
```

---

## Server Setup (one-time)

### 1. System packages

```bash
apt update && apt install -y git nginx gcc golang-go nodejs npm
```

> Node.js 20+ and Go 1.22+ are required. Install via their official repos if the distro version is too old.

### 2. System user and directories

```bash
useradd -r -s /usr/sbin/nologin checker
mkdir -p /var/lib/checker /opt/checker
chown checker:checker /var/lib/checker
```

### 3. Clone the repo

```bash
cd /opt/checker
git clone git@github.com:ProxyScrape/proxyscrape-proxy-checker.git .
git checkout web-prod
```

### 4. Environment variables (build-time)

The React renderer requires PostHog/Intercom keys at build time. Create `/opt/checker/.env`:

```bash
POSTHOG_KEY=...
POSTHOG_API_HOST=...
POSTHOG_UI_HOST=...
INTERCOM_APP_ID=...
```

> This file can be removed once the binary is built — the keys are baked into the JS bundle.

### 5. Build

```bash
cd /opt/checker
npm install
bash scripts/build-webserver.sh
```

The script:
1. Runs `npm run build:renderer` — compiles the React SPA via `electron-vite`
2. Copies the renderer output into `backend/internal/api/web/` (embedded via `//go:embed`)
3. Compiles the Go binary with `-tags webserver` and `CGO_ENABLED=1` (required for SQLite)

Output: `bin/checker-webserver-linux-x64`

> **Important:** The build must run on the target Linux host. `CGO_ENABLED=1` links against the system's `libsqlite3`. Cross-compiling from macOS is not supported without a CGO-capable cross-toolchain.

### 6. Install the binary

```bash
cp bin/checker-webserver-linux-x64 /usr/local/bin/checker-webserver
```

### 7. Systemd service

Create `/etc/systemd/system/checker.service`:

```ini
[Unit]
Description=ProxyScrape Proxy Checker (guest/web mode)
After=network.target

[Service]
Type=simple
User=checker
ExecStart=/usr/local/bin/checker-webserver serve \
  --mode=guest \
  --port=8080 \
  --bind=127.0.0.1 \
  --data-dir=/var/lib/checker \
  --guest-max-proxies-in-flight=5000
Restart=on-failure
RestartSec=5
Environment=CHECKER_HTTPS=true

[Install]
WantedBy=multi-user.target
```

`CHECKER_HTTPS=true` ensures the session cookie gets the `Secure` flag when running behind an HTTPS terminator.

```bash
systemctl daemon-reload
systemctl enable checker
systemctl start checker
```

### 8. SSL certificate

Place the chained certificate and private key on the server at paths of your choice, then reference them in the Nginx config below.

### 9. Nginx

Create `/etc/nginx/sites-available/checker`:

```nginx
server {
    listen 443 ssl;
    server_name your.domain.com;

    ssl_certificate     /path/to/your.chained.crt;
    ssl_certificate_key /path/to/your.key;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

    # SSE (Server-Sent Events) — must not buffer the stream
    location ~ ^/api/.*events {
        proxy_pass         http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_buffering    off;
        add_header         X-Accel-Buffering no;
        proxy_read_timeout 3600s;
    }

    # Everything else (API + SPA)
    location / {
        proxy_pass         http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        gzip               on;
        gzip_types         text/plain text/css application/json application/javascript;
    }
}
```

```bash
ln -s /etc/nginx/sites-available/checker /etc/nginx/sites-enabled/checker
nginx -t && systemctl reload nginx
```

---

## Deploying Updates

```bash
cd /opt/checker

# 1. Pull latest web-prod
git pull origin web-prod

# 2. Install any new npm dependencies
npm install

# 3. Rebuild frontend + Go binary
bash scripts/build-webserver.sh

# 4. Swap the binary (stop first — Linux cannot replace a running executable)
systemctl stop checker
cp bin/checker-webserver-linux-x64 /usr/local/bin/checker-webserver
systemctl start checker

# 5. Verify
systemctl is-active checker
curl -s http://127.0.0.1:8080/api/mode
```

---

## Architecture Notes

### Why CGO?

The Go binary uses `go-sqlite3` for session and settings storage, which requires CGO. The `webserver` build tag excludes the pcap/libpcap dependency (TCP packet capture — desktop only), so only a C compiler and standard system libraries are needed:

| Dependency | Desktop | Web server |
|---|---|---|
| SQLite (`go-sqlite3`) | ✅ CGO | ✅ CGO |
| libpcap (`gopacket/pcap`) | ✅ CGO | ❌ excluded via `!webserver` tag |

### Why Nginx?

Some CDN/proxy providers buffer SSE streams (the primary mechanism for streaming live check results), causing results to arrive in large batches rather than in real time. Nginx sits in front of the Go binary and sets `proxy_buffering off` on the `/api/*events` path to prevent this.

### SPA routing

The Go binary embeds the React SPA via `//go:embed all:web` (`web_handler.go`, `webserver` build tag). Unknown URL paths fall back to `index.html` so that React Router handles client-side navigation correctly.

### Session handling

Guest sessions are anonymous HttpOnly cookies with a 30-day sliding window TTL. If a cookie expires, the frontend automatically bootstraps a new session on the next load (`POST /api/guest/session`). No user action is required.

### Guest-mode feature restrictions

The following features are disabled for guest users, both in the UI (lock icon + tooltip) and enforced server-side in `handleCheck`:

| Feature | Reason |
|---|---|
| Keep-Alive connections | Requires persistent connection tracking |
| Local DNS resolution | Causes DNS leaks; desktop-only |
| Traces (TCP packet capture) | Requires libpcap — not compiled into the web binary |
