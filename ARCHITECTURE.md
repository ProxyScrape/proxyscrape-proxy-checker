# Architecture

ProxyScrape Proxy Checker is a cross-platform application built on two tiers: a **React frontend** and a **Go backend binary**. The same Go binary can run either as a desktop sidecar (spawned by Electron) or as a standalone web server (deployed headless on Linux).

---

## System Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Desktop Mode                         │
│                                                         │
│  Electron main ──spawn──▶ Go binary (127.0.0.1 only)   │
│                            Prints to stdout:            │
│                            CHECKER_PORT=<n>             │
│                            CHECKER_TOKEN=<uuid>         │
│                                                         │
│  React renderer ─── HTTP + SSE ───▶ Go binary API      │
│                      Authorization: Bearer <token>      │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                   Web Server Mode                       │
│                                                         │
│  $ checker user create          # first-run setup       │
│  $ checker serve --mode=server --port=8080              │
│    [--bind 0.0.0.0]             # default: 127.0.0.1    │
│                                                         │
│  Go binary serves:                                      │
│  ├── React SPA (embedded via go:embed) at /             │
│  └── REST + SSE API at /api/*                           │
│                                                         │
│  Browser → http://server:8080/ → login screen           │
└─────────────────────────────────────────────────────────┘
```

---

## Authentication

All API endpoints require a bearer token in every request:
```
Authorization: Bearer <token>
```

The SSE events endpoint (`/api/check/{id}/events`) additionally accepts the token as a query parameter (`?token=<value>`) because the browser's `EventSource` API cannot set custom headers.

**Desktop mode:** The Go binary generates a cryptographically random token on startup (using `crypto/rand`) and prints it to stdout alongside the port. Electron reads both and passes them to the React renderer via `contextBridge`. No user accounts or login screen — the token lives only for the lifetime of the process.

**Server mode:** Uses a proper user system. Users are created via the CLI (`checker user create`) before the server starts; the binary refuses to start if no users exist. The web UI shows a username/password login screen. On successful login, the backend issues a session token stored in SQLite with an expiry. All subsequent requests carry that session token as a bearer token. Passwords are bcrypt-hashed; plain-text passwords are never stored.

User management CLI commands (server mode only):
```
checker user create   # prompts securely for username and password
checker user list     # shows all usernames and created dates
checker user delete   # removes a user by username
checker user passwd   # changes a user's password
```

Password requirements: minimum 12 characters, at least one uppercase, one lowercase, one digit, one special character.

### Security rules (must be maintained when adding features)

1. **Auth middleware is applied at the `/api` subrouter level, not per-handler.** Any new route added under `/api` is automatically authenticated. To bypass this, a developer would have to actively register a route outside the subrouter — which should never happen.

2. **`POST /api/login` is the only unauthenticated endpoint.** It is registered outside the auth-protected subrouter. `POST /api/logout` is authenticated — it belongs inside the subrouter so the middleware validates the token before the handler deletes it, preventing unauthenticated callers from targeting arbitrary session tokens. No other endpoint should ever join the unauthenticated surface.

3. **The `?token=` query param fallback is scoped to the SSE handler only.** `EventSource` cannot set headers, so the SSE endpoint (`GET /api/check/{id}/events`) accepts the token as a query param. This is implemented inside that handler, not as global middleware, so tokens do not appear in logs for other requests.

4. **`POST /api/login` is rate-limited.** It is the only endpoint where brute-forcing credentials is possible. The rate limiter is the last line of defense if the port is accidentally exposed.

5. **Session tokens are stored in SQLite with an expiry** (default 24 hours). Logout deletes the row. Expired sessions are purged on startup.

---

## Go Backend

### Entry point

`backend/cmd/checker/main.go` is the CLI entry point. It:

1. Parses flags (`--mode`, `--port`, `--data-dir`) and subcommands (`serve`, `user create`, `user list`, `user delete`, `user passwd`)
2. Initializes all subsystems (store, settings, geo, judges, blacklist)
3. Builds the HTTP router
4. Binds to the configured address(es). Desktop mode always locks to `127.0.0.1`. Server mode defaults to `127.0.0.1` but accepts one or more `--bind` values (e.g. `--bind 0.0.0.0` or `--bind 192.168.1.5 --bind 10.0.0.1`). Each address gets its own listener on the configured port.
5. Desktop: prints `CHECKER_PORT` and `CHECKER_TOKEN` to stdout. Server: refuses to start if no users exist.
6. Serves until a signal is received, then shuts down gracefully

### Internal packages

| Package | Responsibility |
|---|---|
| `internal/api` | HTTP router, all request handlers, SSE streaming, auth middleware, CORS. The auth middleware accepts a `TokenVerifier func(ctx, token string) bool` injected at startup — desktop mode injects a simple constant-time string compare against the ephemeral token; server mode injects a SQLite session lookup. The middleware itself has no mode-specific branching. |
| `internal/checker` | Concurrent proxy checking engine. Goroutine pool — pool size = `settings.threads`. Results sent via channel. |
| `internal/judges` | Judge server management: ping, classify (SSL/usual), validate responses, round-robin getters |
| `internal/blacklist` | Load blacklists from URLs or files, parse IPs and CIDR ranges, `Check(ip)` method |
| `internal/geo` | GeoIP lookups via `maxminddb-golang`. The `geoip.mmdb` file is downloaded from R2 at runtime and hot-reloaded without restart |
| `internal/store` | SQLite persistence using `modernc.org/sqlite` (pure Go — no CGo, no native rebuild required). Schema: `checks`, `check_results`, `users` (bcrypt hashes), `sessions` (session tokens with expiry) |
| `internal/settings` | Read/write settings JSON file. Version migration. Thread-safe access. |
| `internal/ip` | Fetch caller's public IP address |
| `internal/updater` | Check GitHub releases for a newer version |

### Concurrency model

When a check is started, the checker spawns a goroutine pool of size `settings.threads`. Each goroutine pulls proxies from a shared channel, tests them (potentially across multiple protocols concurrently), and sends results to a results channel. The API handler for `GET /api/check/{id}/events` consumes this results channel and writes SSE events to the HTTP response as they arrive.

The `geoip.mmdb` is downloaded from R2 at first launch, cached in the user data directory, and hot-reloaded via the `/api/mmdb/reload` endpoint without restarting the backend. It is safe for concurrent reads.

SQLite uses WAL mode and a single-writer connection pool to avoid contention.

---

## Electron Shell

The Electron main process (`src/main/index.js`) is intentionally thin.

**What it does:**
- Spawns the Go binary on `app.ready` (via `go run` in dev, pre-built binary in prod)
- Reads `CHECKER_PORT` and `CHECKER_TOKEN` from Go's stdout
- Creates the `BrowserWindow` after the Go backend is ready
- Handles native file dialogs (`dialog.showOpenDialog`, `dialog.showSaveDialog`)
- Manages `better-sqlite3` for check history (temporary — will migrate to Go API in Track A4)
- Handles window control IPC events (minimize, maximize, close)
- Kills the Go process on `app.before-quit`
- Manages `electron-updater` auto-update

**What it does not do:**
- Business logic (all in Go)
- Settings persistence (owned by Go)

The preload script (`src/preload/index.js`) exposes a minimal surface via `contextBridge`:
- `window.__ELECTRON__.apiBase` — `http://127.0.0.1:{port}`
- `window.__ELECTRON__.token` — the bearer token
- `window.__ELECTRON__.choosePath(action)` — single-file dialog wrapper
- `window.__ELECTRON__.chooseMulti()` — multi-file dialog wrapper
- `window.__ELECTRON__.window{Minimize,Maximize,Unmaximize,Close}()` — window controls

`contextIsolation: true` and `nodeIntegration: false` are enabled on the BrowserWindow — the renderer is a pure web context with no Node.js access.

---

## React Frontend

The frontend is unchanged in structure. `src/renderer/api/client.js` has been added and provides the authenticated HTTP/SSE layer. Redux actions will migrate to use it as Go API endpoints are implemented (Tracks A3/A4). Until then, some actions still use direct IPC or the in-renderer JS checker.

### API client

`api/client.js` provides:
- `apiFetch(path, options)` — wraps `fetch` with automatic auth headers. Base URL is `window.__ELECTRON__.apiBase` in desktop mode, or empty (same-origin) in web mode.
- `openCheckStream(checkId, handlers)` — wraps `EventSource` for SSE. Appends `?token=` since `EventSource` cannot set headers. Returns a cleanup function.

### Mode detection

```js
const isDesktop = typeof window.__ELECTRON__ !== 'undefined';
const apiBase   = isDesktop ? window.__ELECTRON__.apiBase : '';
const token     = isDesktop
                ? window.__ELECTRON__.token
                : localStorage.getItem('checker_session'); // key: 'checker_session'
```

No component code needs to know which mode it's in — the API client handles the difference transparently.

### Web mode login

In web server mode, when no valid session token exists in `localStorage` (`checker_session`), the app renders a login screen (`containers/Login.jsx`) with username and password fields. On successful login (`POST /api/login`), the returned session token is stored in `localStorage` and normal app rendering begins. In desktop mode the login screen is never shown — the token arrives from `contextBridge` directly.

---

## Data Storage

| Item | Desktop path | Server path |
|---|---|---|
| SQLite database | `{userData}/proxy-checker.db` | `{data-dir}/proxy-checker.db` |
| Settings JSON | `{userData}/settings.json` | `{data-dir}/settings.json` |

`{userData}` is Electron's `app.getPath('userData')`, passed to the Go binary via `--data-dir` on startup. In server mode, `--data-dir` defaults to the current working directory or a path specified by the operator.

During the migration period, check history is stored by `better-sqlite3` in the Electron main process (`checks`, `check_results` tables). Once Track A4 is complete this moves to the Go binary's SQLite, which extends the schema with `users` and `sessions` tables. Existing `checks`/`check_results` data will be preserved.

---

## Testing the v1 → v2 settings migration (Windows)

The migration runs automatically the first time v2 launches on a machine that has v1.x settings. To reproduce it manually during development:

```cmd
REM 1. Create the canary userData folder if it doesn't exist yet
mkdir "%APPDATA%\proxyscrape-proxy-checker Canary" 2>nul

REM 2. Remove any already-migrated settings.json so the migration isn't skipped
del "%APPDATA%\proxyscrape-proxy-checker Canary\settings.json" 2>nul

REM 3. Copy the v1.x settings file into the canary folder as the migration source
copy /y "%APPDATA%\proxyscrape-proxy-checker\settings.proxyscrape.checker.json" "%APPDATA%\proxyscrape-proxy-checker Canary\"
```

Then launch the canary build normally. On startup `migrateSettingsIfNeeded()` will find `settings.proxyscrape.checker.json`, convert it to `settings.json` in v2 format, and the Go backend will load it (the Go `migrate()` function sanitises any string-typed numeric fields left by the v1.x React form inputs).

The three commands are idempotent — repeat them to reset and re-run the migration.

---

## Build

### Desktop

```bash
bash scripts/build-backend.sh   # cross-compiles Go for all platforms → bin/
npm run build:renderer           # builds React → dist/renderer/
npm run dist                     # runs electron-builder, bundles Go binaries via extraResources
```

The Go binary for each platform is bundled into the Electron app as an extra resource. In production, the binary path is resolved using `process.resourcesPath`.

On macOS, the Go binary must be listed in `mac.binaries` in the electron-builder config for proper code signing and notarization.

### Web server

```bash
bash scripts/build-webserver.sh
# 1. Builds React renderer
# 2. Copies React build into Go embed target
# 3. go build -tags webserver → bin/checker-webserver-linux-x64
```

The `-tags webserver` build tag activates `go:embed` for the React SPA. Without this tag, the binary is smaller and does not serve a frontend (desktop mode only needs the API).

### Docker

```bash
docker build -t proxyscrape/checker .
# Create the first user before or after starting the container:
docker run --rm -v checker-data:/data proxyscrape/checker user create
# Then start the server:
docker run -p 8080:8080 -v checker-data:/data proxyscrape/checker serve --mode=server --port=8080 --bind 0.0.0.0
```

---

## Adding a New API Endpoint

1. **Go handler**: Add a handler function in `backend/internal/api/`. Use the existing handlers as reference for auth, JSON parsing, and error response patterns.
2. **Register route**: Add the route to the chi router in `backend/internal/api/server.go`.
3. **Client stub**: Add a convenience function to `src/renderer/api/client.js`.
4. **Redux action**: Add an action in the appropriate `src/renderer/actions/*.js` file using `apiFetch`.
5. **Update this document**: Add the endpoint to the API reference table.

---

## API Quick Reference

See [plans/proxy-checker-go-migration.md](../plans/proxy-checker-go-migration.md) for the full API reference including request/response schemas and SSE event payloads.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/check` | Start a proxy check |
| `GET` | `/api/check/{id}/events` | SSE stream (also accepts `?token=`) |
| `DELETE` | `/api/check/{id}` | Stop a running check |
| `GET` | `/api/checks` | List past checks |
| `GET` | `/api/checks/{id}/results` | Results for a past check |
| `DELETE` | `/api/checks/{id}` | Delete a past check |
| `GET` | `/api/settings` | Get settings |
| `PUT` | `/api/settings` | Update settings |
| `GET` | `/api/judges/status` | Judge alive/dead status |
| `POST` | `/api/judges/refresh` | Re-ping all judges |
| `GET` | `/api/blacklist/status` | Blacklist load status |
| `POST` | `/api/blacklist/refresh` | Reload blacklists |
| `GET` | `/api/ip` | Caller's public IP |
| `GET` | `/api/version` | Version info |
| `POST` | `/api/login` | Submit username + password; returns session token _(unauthenticated)_ |
| `POST` | `/api/logout` | Invalidate current session token |
