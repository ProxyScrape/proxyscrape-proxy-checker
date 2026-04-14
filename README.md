<p align="center">
  <img width="255px" src="https://cdn.proxyscrape.com/img/logo/dark_text_logo.png">
</p>

![](https://cdn.proxyscrape.com/img/proxy-checker/proxy-results.png)

A cross-platform proxy checker built on React + Go. The Go binary runs as a desktop sidecar (spawned by Electron) or as a standalone headless web server. Both modes expose the same HTTP API.

**Links:** [Proxy Checker](https://proxyscrape.com/proxy-checker) · [Premium](https://proxyscrape.com/premium) · [Free Proxy List](https://proxyscrape.com/free-proxy-list)

---

## Development

**Prerequisites:** [Go](https://go.dev/dl/) and [Node.js](https://nodejs.org/) must be on your PATH.

```bash
npm install
cp .env.example .env   # fill in Intercom/PostHog keys
```

### Desktop mode (Electron)

```bash
npm run dev
# or
bash scripts/dev.sh    # also checks that Go is on PATH
```

Electron starts and automatically runs the Go backend via `go run` — no pre-build step. `window.__ELECTRON__` is set in the renderer, so the login screen is skipped and the ephemeral auth token is injected automatically.

**React change** → Vite HMR applies it instantly, no restart needed.
**Go change** → `Ctrl+C` and `npm run dev` again. `go run` recompiles on the next launch.

### Web mode (browser, with Go hot-reload)

Install [Air](https://github.com/air-verse/air) once:

```bash
go install github.com/air-verse/air@latest
```

First time only — create a user for the server:

```bash
cd backend && go run ./cmd/checker user create
```

Then start everything in one command:

```bash
npm run dev:web:all
```

This runs Air (Go hot-reload) and Vite concurrently with colored output. Open [http://localhost:5173](http://localhost:5173) — the login screen appears because `window.__ELECTRON__` is not set. `/api` requests are proxied to the Go backend on port 8080.

Or run them separately if you prefer:

```bash
# Terminal 1 — Go with hot-reload
cd backend && air

# Terminal 2 — Vite dev server
npm run dev:web
```

**Go change** → Air detects it, rebuilds, and restarts the backend automatically.
**React change** → Vite HMR applies it instantly.

## Building for desktop

```bash
# Build Go backends for all platforms first
npm run build:backend

# Package the Electron app
npm run dist
```

The Go binary is bundled into the Electron app as an extra resource. On macOS it must be listed in `mac.binaries` in the electron-builder config for code signing and notarization.

## Web server mode

Build a self-contained binary with the React SPA embedded:

```bash
npm run build:webserver
```

Run it:

```bash
# Create the first user before starting
./bin/checker-webserver-linux-x64 user create

# Start the server (default bind: 127.0.0.1)
./bin/checker-webserver-linux-x64 serve --mode=server --port=8080 --bind=0.0.0.0
```

Or with Docker:

```bash
docker build -t proxyscrape/checker .

# Create the first user
docker run --rm -v checker-data:/data proxyscrape/checker user create

# Start the server
docker run -p 8080:8080 -v checker-data:/data proxyscrape/checker serve --mode=server --port=8080 --bind=0.0.0.0
```

The server refuses to start in server mode if no users exist.

## User management

These commands are for server mode only. Run them on the host (or inside the container) before or after starting the server.

```bash
checker user create   # create a new user
checker user list     # list all users
checker user delete   # remove a user
checker user passwd   # change a user's password
```

Passwords must be at least 12 characters with at least one uppercase letter, lowercase letter, digit, and special character.

## Environment variables

Create a `.env` file from `.env.example` for dev mode. These values are injected at build time via Vite and are not used at runtime.

| Variable | Description |
|---|---|
| `INTERCOM_APP_ID` | Intercom app ID |
| `POSTHOG_KEY` | PostHog project API key |
| `POSTHOG_API_HOST` | PostHog ingest host (e.g. `https://eu.i.posthog.com`) |
| `POSTHOG_UI_HOST` | PostHog UI host (e.g. `https://eu.posthog.com`) |

`npm run build` (Electron) fails if any of these are missing. `npm run dev` and `npm run dev:web` allow them to be empty — analytics and Intercom are simply inactive.

## Releases and changelog

There is no `CHANGELOG.md`. Release notes are **AI-generated automatically by CI** from
git commit messages between tags, and stored in `releases.json` on R2:

```
GET https://updates.proxyscrape.com/releases.json
```

The in-app changelog (Info slideout) and the auto-updater both read from this file.
The GitHub Release body is also populated from it — do **not** write notes in the GitHub
Release editor.

### Cutting a release

```bash
# 1. Bump the version in package.json
npm version X.Y.Z-canary --no-git-tag-version

# 2. Commit, tag, push
git add package.json
git commit -m "chore: bump version to X.Y.Z-canary"
git tag vX.Y.Z-canary
git push origin canary --tags
```

CI picks up the tag, builds all platforms, uploads binaries to R2, calls the AI to
generate notes from commits since the last same-channel tag, and uploads the updated
`releases.json`. No manual changelog editing required.

### Overriding AI-generated notes

If you want to write notes yourself for a specific version, download `releases.json`
from R2, prepend your entry manually, and re-upload it **before** pushing the tag.
CI detects the existing entry and skips the AI call, preserving your notes.

### Required CI secrets

| Secret | Purpose |
|---|---|
| `OPENROUTER_API_KEY` | AI note generation (OpenRouter) |
| `R2_BUCKET` | Cloudflare R2 bucket name |
| `R2_ENDPOINT` | R2 S3-compatible endpoint URL |
| `R2_ACCESS_KEY_ID` | R2 API credentials |
| `R2_SECRET_ACCESS_KEY` | R2 API credentials |
| `R2_PUBLIC_URL` | Public base URL for installer downloads |

## Architecture

For system design, authentication model, API reference, and Go package responsibilities, see [ARCHITECTURE.md](./ARCHITECTURE.md).
