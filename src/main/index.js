import path from 'path';
import fs from 'fs';
import http from 'http';
import https from 'https';
import { pipeline, Transform } from 'stream';
import { promisify } from 'util';
import readline from 'readline';
import { spawn, execSync } from 'child_process';
import { BrowserWindow, app, ipcMain, dialog, session, clipboard } from 'electron';
import { autoUpdater } from 'electron-updater';
import { isDev, isPortable, IS_CANARY } from '../shared/AppConstants';

// Separate userData for canary vs stable so they never share settings, DB, or
// the migration trigger file. Must be called before app.whenReady().
// productName controls the installer name but NOT app.getPath('userData') at
// runtime — that comes from app.getName() which reads package.json `name`.
// Appending " Canary" here mirrors what productName does for the install entry.
if (IS_CANARY) {
    app.setPath('userData', app.getPath('userData') + ' Canary');
}

const iconPath = path.join(__dirname, '../../public/icons/icon.png');

let window;
let goProcess = null;
let checkerPort = null;
let checkerToken = null;
let isQuitting = false;

// Buffered deep-link URL that arrived before the renderer window was ready.
let pendingDeepLink = null;

// True while a geo-enrich SSE connection is open. Prevents duplicate streams
// from being created if listenGeoEnrichSSE() is called multiple times (e.g.
// once at startup and again after an MMDB download completes).
let geoEnrichListening = false;

const isMac = process.platform === 'darwin';

// Pass --enable-updater on the command line to force electron-updater active
// even on canary builds. Used to test the auto-update flow end-to-end.
// Example: "ProxyScrape Proxy Checker Canary.exe" --enable-updater
const enableUpdater = app.commandLine.hasSwitch('enable-updater');

/**
 * Returns the directory used for all persistent app data (settings.json, checker.db).
 * In portable mode this is beside the executable so the install stays self-contained.
 * In normal installs it is the standard Electron userData path.
 */
function getDataDir() {
    if (isPortable && process.env.PORTABLE_EXECUTABLE_DIR) {
        return process.env.PORTABLE_EXECUTABLE_DIR;
    }
    return app.getPath('userData');
}

/**
 * Kills the Go backend process and its entire process group so that neither
 * `go run` nor the compiled checker binary it spawns survive as orphans.
 * On Windows falls back to a plain kill since process groups work differently.
 */
function killGoProcess(proc) {
    if (!proc || proc.killed) return;
    try {
        if (process.platform !== 'win32') {
            // Negative PID sends the signal to the whole process group.
            process.kill(-proc.pid, 'SIGTERM');
        } else {
            proc.kill();
        }
    } catch {
        try { proc.kill(); } catch { /* already dead */ }
    }
}

/**
 * Route an incoming proxychecker:// deep-link URL to the renderer.
 * If the window is not yet ready the URL is buffered and flushed after load.
 */
function handleDeepLink(url) {
    if (!url || !url.startsWith('proxychecker://')) return;
    if (window && !window.isDestroyed()) {
        window.webContents.send('deep-link-proxy', url);
    } else {
        pendingDeepLink = url;
    }
}

function getCheckerBinaryName() {
    const platform = process.platform;
    const arch = process.arch;
    if (platform === 'win32') {
        return arch === 'arm64' ? 'checker-win-arm64.exe' : 'checker-win-x64.exe';
    }
    return `checker-${platform === 'darwin' ? 'darwin' : 'linux'}-${arch === 'arm64' ? 'arm64' : 'x64'}`;
}

function getCheckerBinaryPath() {
    const binaryName = getCheckerBinaryName();
    if (app.isPackaged) {
        return path.join(process.resourcesPath, 'bin', binaryName);
    }
    return path.join(__dirname, '../../bin', binaryName);
}

/**
 * One-time migration from the v1.x settings file to the v2 Go backend format.
 *
 * v1 wrote settings directly from JS to:  <userData>/settings.proxyscrape.checker.json
 * v2 uses the Go backend which reads/writes: <userData>/settings.json
 *
 * If the new file already exists (fresh install or already migrated) this is a no-op.
 * Runs synchronously before the Go backend starts so the backend picks up the migrated
 * settings on its very first load. Failure is non-fatal — the backend falls back to defaults.
 */
function migrateSettingsIfNeeded() {
    const dataDir = getDataDir();
    const newPath = path.join(dataDir, 'settings.json');

    // v1 portable builds stored settings beside the exe; non-portable stored in userData.
    const oldDir = (isPortable && process.env.PORTABLE_EXECUTABLE_DIR)
        ? process.env.PORTABLE_EXECUTABLE_DIR
        : app.getPath('userData');
    const oldPath = path.join(oldDir, 'settings.proxyscrape.checker.json');

    if (fs.existsSync(newPath)) return; // already migrated or new install
    if (!fs.existsSync(oldPath)) return; // no v1 settings to migrate

    try {
        const old = JSON.parse(fs.readFileSync(oldPath, 'utf8'));

        const migrated = {
            core:      old.core      || {},
            judges:    old.judges    || {},
            blacklist: old.blacklist || {},
            ip: {
                current:   '',
                lookupUrl: (old.ip && old.ip.lookupUrl) || 'https://api.proxyscrape.com/ip.php',
            },
            exporting: old.exporting || {},
            version:   '2.0.0',
        };

        fs.writeFileSync(newPath, JSON.stringify(migrated, null, 2), 'utf8');
        console.log('[migration] v1 settings migrated to v2 format.');
    } catch (err) {
        console.error('[migration] Failed to migrate settings, backend will use defaults:', err.message);
    }
}

function startGoBackend() {
    return new Promise((resolve, reject) => {
        const dataDir = getDataDir();

        let cmd, args, opts;
        if (!app.isPackaged) {
            // In dev (unpackaged), compile and run from source — no pre-build step required.
            const backendDir = path.join(__dirname, '../../backend');

            // Resolve the `go` binary via the user's login shell PATH (one-time,
            // synchronous). We do NOT pass shell:true to the main spawn because that
            // causes the shell wrapper to absorb SIGTERM on quit, leaving the actual
            // go run process and the compiled checker binary as orphans.
            let goBin = 'go';
            try {
                const whichCmd = process.platform === 'win32' ? 'where go' : 'which go';
                goBin = execSync(whichCmd, { encoding: 'utf8', shell: true }).trim().split('\n')[0].trim();
            } catch {
                // falls back to bare 'go'; will produce ENOENT if not on PATH
            }

            cmd = goBin;
            args = ['run', './cmd/checker', 'serve', '--mode=desktop', '--data-dir', dataDir];
            // detached:true gives the child its own process group (PGID = goProcess.pid).
            // On quit we send SIGTERM to -pid which kills the entire group (go run +
            // the compiled binary it spawns), preventing orphaned processes.
            opts = {
                cwd: backendDir,
                // Pass the real app version via env so the backend knows what version
                // it is running as (used for the /api/version update check).
                env: { ...process.env, APP_VERSION: app.getVersion() },
                stdio: ['ignore', 'pipe', 'pipe'],
                detached: process.platform !== 'win32',
            };
        } else {
            const binaryPath = getCheckerBinaryPath();
            if (!fs.existsSync(binaryPath)) {
                dialog.showErrorBox(
                    'Proxy Checker',
                    `Backend binary not found at:\n${binaryPath}\n\nRun: npm run build:backend`
                );
                reject(new Error('checker binary missing'));
                return;
            }
            cmd = binaryPath;
            args = ['serve', '--mode=desktop', '--data-dir', dataDir];
            opts = {
                // Pass APP_VERSION so the backend's init() picks it up even if
                // the -X linker flag injection somehow failed (belt-and-suspenders).
                env: { ...process.env, APP_VERSION: app.getVersion() },
                stdio: ['ignore', 'pipe', 'pipe'],
                detached: process.platform !== 'win32',
            };
        }

        goProcess = spawn(cmd, args, opts);

        const rl = readline.createInterface({ input: goProcess.stdout });
        let port = null;
        let token = null;
        let settled = false;
        let killedAfterTimeout = false;

        // go run compiles before starting, so allow extra time in dev (unpackaged)
        const startupTimeoutMs = app.isPackaged ? 30000 : 90000;
        const timeout = setTimeout(() => {
            if (!settled) {
                dialog.showErrorBox(
                    'Proxy Checker',
                    'Timed out waiting for the backend to start (no CHECKER_PORT/CHECKER_TOKEN on stdout).'
                );
                killedAfterTimeout = true;
                killGoProcess(goProcess);
                reject(new Error('checker startup timeout'));
            }
        }, startupTimeoutMs);

        rl.on('line', (line) => {
            const portMatch = line.match(/^CHECKER_PORT=(\d+)/);
            if (portMatch) {
                port = parseInt(portMatch[1], 10);
            }
            const tokenMatch = line.match(/^CHECKER_TOKEN=(.+)$/);
            if (tokenMatch) {
                token = tokenMatch[1].trim();
            }
            if (port != null && token && !settled) {
                settled = true;
                clearTimeout(timeout);
                checkerPort = port;
                checkerToken = token;
                resolve();
            }
        });

        goProcess.stderr.on('data', (chunk) => {
            console.error('[checker]', chunk.toString());
        });

        goProcess.on('error', (err) => {
            clearTimeout(timeout);
            const hint = isDev
                ? 'Make sure Go is installed and on your PATH (`go version`).'
                : 'Run: npm run build:backend';
            dialog.showErrorBox('Proxy Checker', `Failed to start backend:\n${err.message}\n\n${hint}`);
            reject(err);
        });

        goProcess.on('exit', (code, signal) => {
            clearTimeout(timeout);
            if (isQuitting || killedAfterTimeout) {
                return;
            }
            if (!settled) {
                dialog.showErrorBox(
                    'Proxy Checker',
                    'The checker backend exited before it became ready. Check logs for details.'
                );
                reject(new Error('checker exited during startup'));
                return;
            }
            const detail =
                code != null && code !== 0
                    ? `Process exited with code ${code}.`
                    : signal
                      ? `Process terminated (${signal}).`
                      : 'Process ended unexpectedly.';
            dialog.showErrorBox('Proxy Checker', `The checker backend stopped.\n${detail}`);
            app.quit();
        });
    });
}

// Preload reads sync before first paint — must be registered early
ipcMain.on('get-api-config', (event) => {
    event.returnValue = {
        apiBase: checkerPort != null ? `http://127.0.0.1:${checkerPort}` : '',
        token: checkerToken || '',
        enableUpdater,
    };
});

// Triggered by the renderer's "Restart now" button after update-ready fires.
ipcMain.on('install-update', () => {
    autoUpdater.quitAndInstall(false, true);
});

ipcMain.handle('choose-path', async (event, action = 'save') => {
    try {
        const txtFilter = [{ name: 'Text Files', extensions: ['txt'] }];
        if (action === 'save') {
            const { filePath, canceled } = await dialog.showSaveDialog({ filters: txtFilter });
            if (!canceled && filePath) return filePath;
        } else {
            const { filePaths, canceled } = await dialog.showOpenDialog({
                filters: txtFilter,
                properties: ['openFile'],
            });
            if (!canceled && filePaths && filePaths.length) return filePaths[0];
        }
    } catch (error) {
        console.error(error);
    }
});

ipcMain.handle('choose-multi', async () => {
    try {
        const { filePaths, canceled } = await dialog.showOpenDialog({
            filters: [{ name: 'Text Files', extensions: ['txt'] }],
            properties: ['openFile', 'multiSelections'],
        });
        if (canceled || !filePaths || !filePaths.length) return null;
        // Read contents in the main process so the renderer never needs `fs`.
        const results = await Promise.all(
            filePaths.map(async (p) => ({
                name: path.basename(p),
                text: await fs.promises.readFile(p, 'utf8'),
            }))
        );
        return results;
    } catch (error) {
        console.error(error);
        return null;
    }
});

ipcMain.handle('read-file', async (_event, filePath) => {
    try {
        return await fs.promises.readFile(filePath, 'utf8');
    } catch (error) {
        console.error('read-file failed:', error);
        return null;
    }
});

ipcMain.handle('write-file', async (_event, filePath, content) => {
    try {
        await fs.promises.writeFile(filePath, content, 'utf8');
        return true;
    } catch (error) {
        console.error('write-file failed:', error);
        return false;
    }
});

ipcMain.handle('getDownloadsPath', () => app.getPath('downloads'));

// Clipboard — accessed from the main process to avoid the renderer-side
// deprecation warning ("Accessing clipboard.readText from the renderer process
// is deprecated"). The renderer calls window.__ELECTRON__.readClipboard() which
// invokes this handler via IPC.
ipcMain.handle('clipboard:read', () => clipboard.readText());


const preloadPath = path.join(__dirname, '../preload/index.js');

const windowOptions = {
    width: 1220,
    height: 905,
    minWidth: 700,
    minHeight: 500,
    show: false,
    icon: iconPath,
    ...(isMac
        ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 12, y: 10 } }
        : { frame: false }),
    webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
    }
};

const devWindow = () => {
    window = new BrowserWindow(windowOptions);

    window.webContents.once('dom-ready', () => {
        window.webContents.openDevTools();
    });
};

const prodWindow = () => {
    window = new BrowserWindow({ ...windowOptions, resizable: true });
    window.removeMenu();
};

const createWindow = () => {
    isDev ? devWindow() : prodWindow();

    if (isDev && process.env['ELECTRON_RENDERER_URL']) {
        window.loadURL(process.env['ELECTRON_RENDERER_URL']);
    } else {
        window.loadFile(path.join(__dirname, '../renderer/index.html'));
    }

    window.on('ready-to-show', () => {
        window.show();
    });

    window.on('closed', () => {
        window = null;
    });

    window.on('maximize', () => {
        window.webContents.send('on-window-maximize');
    });

    window.on('unmaximize', () => {
        window.webContents.send('on-window-unmaximize');
    });
};

// Register as the default OS handler for proxychecker:// deep links (browser extension).
// On Windows in dev mode Electron is not the executable itself, so the main
// script path must be passed as an extra argument — see Electron deep-link docs.
if (process.defaultApp && process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('proxychecker', process.execPath, [
        path.resolve(process.argv[1]),
    ]);
} else {
    app.setAsDefaultProtocolClient('proxychecker');
}

// macOS fires open-url when a proxychecker:// link is clicked in the browser.
// Register early so links that arrive before whenReady() are not lost.
app.on('open-url', (event, url) => {
    event.preventDefault();
    handleDeepLink(url);
});

// Enforce a single running instance. A second launch focuses the existing window
// instead of opening a duplicate. This also prevents the Chromium service-worker
// storage error caused by two processes sharing the same user-data directory.
if (!app.requestSingleInstanceLock()) {
    app.quit();
}

// Windows / Linux: a second instance is spawned when a proxychecker:// link is
// clicked. The URL arrives in commandLine; we focus the existing window and route it.
app.on('second-instance', (event, commandLine) => {
    if (window) {
        if (window.isMinimized()) window.restore();
        window.focus();
    }
    const url = commandLine.find(arg => arg.startsWith('proxychecker://'));
    if (url) handleDeepLink(url);
});

app.whenReady().then(async () => {
    // Some external endpoints (judge servers, IP-lookup services) don't send CORS
    // headers, so Chromium would block those responses. We inject the header only
    // when the server hasn't already sent one — adding it to a response that already
    // has it produces a duplicate-value rejection and breaks Intercom, PostHog, etc.
    //
    // In production we also set a Content-Security-Policy. Dev mode intentionally
    // omits it because Vite HMR requires 'unsafe-eval', which would re-trigger the
    // same Electron security warning we're trying to silence.
    const productionCSP = [
        "default-src 'self'",
        // n.proxyscrape.com  — PostHog reverse-proxy (avoids ad-blockers)
        // widget.intercom.io — Intercom widget bootstrap script
        // js.intercomcdn.com — Intercom CDN where the actual runtime scripts live
        "script-src 'self' https://n.proxyscrape.com https://widget.intercom.io https://js.intercomcdn.com",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https:",
        // Local Go backend (any port) + analytics/chat services
        "connect-src 'self' http://127.0.0.1:* https://n.proxyscrape.com https://app.posthog.com https://eu.posthog.com https://widget.intercom.io https://js.intercomcdn.com https://api-iam.intercom.io https://api.intercom.io wss://nexus-websocket-a.intercom.io wss://nexus-websocket-b.intercom.io https://github.com https://api.proxyscrape.com",
        "font-src 'self' data: https://fonts.intercomcdn.com",
        "object-src 'none'",
        "base-uri 'self'",
    ].join('; ');

    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        const headers = { ...details.responseHeaders };
        const hasCors = Object.keys(headers).some(
            k => k.toLowerCase() === 'access-control-allow-origin'
        );
        if (!hasCors) {
            headers['Access-Control-Allow-Origin'] = ['*'];
        }
        if (!isDev) {
            headers['Content-Security-Policy'] = [productionCSP];
        }
        callback({ responseHeaders: headers });
    });

    migrateSettingsIfNeeded();

    try {
        await startGoBackend();
    } catch {
        app.quit();
        return;
    }

    createWindow();

    // Windows / Linux cold launch: if the app was started directly by the OS
    // protocol handler (first instance), the URL lands in process.argv.
    if (process.platform !== 'darwin') {
        const coldUrl = process.argv.find(arg => arg.startsWith('proxychecker://'));
        if (coldUrl) pendingDeepLink = coldUrl;
    }

    // Flush any deep-link that arrived before the renderer was ready.
    if (pendingDeepLink) {
        const urlToSend = pendingDeepLink;
        pendingDeepLink = null;
        window.webContents.once('did-finish-load', () => {
            window.webContents.send('deep-link-proxy', urlToSend);
        });
    }

    if ((!IS_CANARY || enableUpdater) && app.isPackaged && !isPortable) {
        autoUpdater.checkForUpdates();
    }

    // On startup, trigger geo enrichment for any proxies checked without MMDB.
    // The Go backend returns immediately if there's nothing to enrich.
    signalGoGeoEnrich();

    // Connect to the geo enrichment SSE stream and forward progress to the renderer.
    listenGeoEnrichSSE();
});

app.on('activate', () => {
    if (window === null) {
        createWindow();
    }
});

app.on('before-quit', () => {
    isQuitting = true;
    if (goProcess) {
        killGoProcess(goProcess);
        goProcess = null;
    }
    if (window && !window.isDestroyed()) {
        window.webContents.send('app-before-quit');
    }
});

app.on('window-all-closed', async () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// On stable builds electron-updater handles updates automatically.
// On canary builds the CanaryBanner + Go backend handles updates instead,
// unless --enable-updater is passed for testing the auto-update flow.
if (!IS_CANARY || enableUpdater) {
    // Explicitly set so the behaviour is documented — when an update is downloaded
    // but the user dismisses the toast, it installs silently on the next app quit.
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on('update-available', () => {
        if (window && !window.isDestroyed()) {
            window.webContents.send('update-available');
        }
    });

    autoUpdater.on('download-progress', (progressObj) => {
        if (window && !window.isDestroyed()) {
            window.webContents.send('download-progress', Math.floor(progressObj.percent));
        }
    });

    // Notify the renderer so it can prompt the user. quitAndInstall is
    // triggered by the renderer via the 'install-update' IPC channel after
    // the user confirms (or immediately for stable if the user hasn't dismissed).
    autoUpdater.on('update-downloaded', () => {
        if (window && !window.isDestroyed()) {
            window.webContents.send('update-ready');
        }
    });

    autoUpdater.on('error', (err) => {
        console.error('[updater] error:', err?.message || err);
    });
}

ipcMain.on('window-minimize', () => {
    if (window && !window.isDestroyed()) {
        window.minimize();
    }
});

ipcMain.on('window-maximize', () => {
    if (window && !window.isDestroyed()) {
        window.maximize();
    }
});

ipcMain.on('window-unmaximize', () => {
    if (window && !window.isDestroyed()) {
        window.unmaximize();
    }
});

ipcMain.on('window-close', () => {
    if (window && !window.isDestroyed()) {
        window.close();
    }
});

// =============================================================================
// Geo enrichment SSE — forward progress events to the renderer window
// =============================================================================

/**
 * Connect to the Go geo enrichment SSE stream and forward progress events to
 * the renderer via 'geo-enrich-progress'. Stops once the backend reports
 * running=false or the stream closes naturally.
 */
function listenGeoEnrichSSE() {
    if (!checkerPort || !checkerToken) return;
    // Singleton guard — only one SSE connection at a time. If a connection is
    // already open (e.g. from startup), skip rather than opening a duplicate
    // that would send every progress event twice to the renderer.
    if (geoEnrichListening) return;

    geoEnrichListening = true;

    const req = http.request({
        hostname: '127.0.0.1',
        port: checkerPort,
        path: '/api/geo/enrich/events',
        method: 'GET',
        headers: { Authorization: `Bearer ${checkerToken}` },
    }, (res) => {
        let buf = '';
        res.on('data', chunk => {
            buf += chunk.toString();
            const lines = buf.split('\n');
            buf = lines.pop(); // keep incomplete line for next chunk

            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                try {
                    const payload = JSON.parse(line.slice(6));
                    if (window && !window.isDestroyed()) {
                        window.webContents.send('geo-enrich-progress', payload);
                    }
                    // Stop listening when enrichment is done.
                    if (!payload.running) {
                        res.destroy();
                        geoEnrichListening = false;
                        return;
                    }
                } catch { /* ignore malformed frames */ }
            }
        });
        res.on('end', () => {
            geoEnrichListening = false;
        });
        res.on('error', () => {
            geoEnrichListening = false;
        });
    });
    req.on('error', () => {
        geoEnrichListening = false;
    });
    req.end();
}

// =============================================================================
// MMDB — GeoIP database download
// =============================================================================

const MMDB_BASE_URL = 'https://software.cdn.proxyscrape.com/mmdb';
const pipelineAsync = promisify(pipeline);

/** Active AbortController while a download is in progress; null otherwise. */
let activeMMDBAbort = null;

/**
 * Fetch text from a URL, following one redirect level.
 * Times out after 10 s and destroys the socket on timeout.
 */
function fetchText(url) {
    return new Promise((resolve, reject) => {
        const mod = url.startsWith('https') ? https : http;
        const req = mod.get(url, { timeout: 10000 }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                fetchText(res.headers.location).then(resolve).catch(reject);
                res.resume();
                return;
            }
            if (res.statusCode !== 200) {
                res.resume();
                reject(new Error(`HTTP ${res.statusCode} fetching ${url}`));
                return;
            }
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => resolve(data.trim()));
            res.on('error', reject);
        });
        req.on('error', reject);
        // timeout only emits an event — must explicitly destroy to abort.
        req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
    });
}

/**
 * Download a file from url to destPath with progress callbacks.
 * Uses stream.pipeline for correct backpressure handling on large files and
 * automatic stream cleanup on error. Writes atomically via a .download temp
 * file so a partial download never replaces a valid existing file.
 *
 * onProgress receives { pct: 0-100, totalBytes: number }.
 * Supports AbortSignal for user-initiated cancellation.
 */
async function downloadFile(url, destPath, onProgress, signal) {
    // Resolve any redirect before starting the download so we can get the
    // content-length from the final URL without double-streaming.
    const res = await new Promise((resolve, reject) => {
        const mod = url.startsWith('https') ? https : http;
        const req = mod.get(url, { timeout: 120000 }, (r) => {
            if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
                r.resume();
                // Re-enter for the redirect target (one hop only).
                downloadFile(r.headers.location, destPath, onProgress, signal)
                    .then(() => resolve(null))
                    .catch(reject);
                return;
            }
            if (r.statusCode !== 200) {
                r.resume();
                reject(new Error(`HTTP ${r.statusCode} downloading MMDB`));
                return;
            }
            resolve(r);
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('MMDB download timed out')); });

        if (signal) {
            signal.addEventListener('abort', () => req.destroy(), { once: true });
        }
    });

    // redirect was handled recursively — nothing left to do.
    if (res === null) return;

    if (signal?.aborted) throw Object.assign(new Error('MMDB download cancelled'), { code: 'MMDB_CANCELLED' });

    const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
    let downloaded = 0;
    const tmp = `${destPath}.download`;

    // Transform stream to track progress bytes without breaking the pipeline.
    const tracker = new Transform({
        transform(chunk, _, cb) {
            downloaded += chunk.length;
            if (onProgress) {
                onProgress({
                    pct: totalBytes > 0 ? Math.min(99, Math.floor((downloaded / totalBytes) * 100)) : 0,
                    totalBytes,
                });
            }
            cb(null, chunk);
        },
    });

    const out = fs.createWriteStream(tmp);

    try {
        await pipelineAsync(res, tracker, out);
    } catch (err) {
        // Clean up the partial temp file on any error (including abort).
        await fs.promises.unlink(tmp).catch(() => {});
        if (signal?.aborted) {
            throw Object.assign(new Error('MMDB download cancelled'), { code: 'MMDB_CANCELLED' });
        }
        throw err;
    }

    // Atomic rename: the old file stays fully available until the new one is in place.
    await fs.promises.rename(tmp, destPath);
}

/**
 * Signal the Go backend to decompress a downloaded .zst file and hot-reload.
 * Returns a Promise that resolves when decompression is complete.
 */
function signalGoMMDBDecompress(srcPath) {
    return new Promise((resolve, reject) => {
        if (!checkerPort || !checkerToken) {
            reject(new Error('Go backend not ready'));
            return;
        }
        const body = JSON.stringify({ src: srcPath });
        const req = http.request({
            hostname: '127.0.0.1',
            port: checkerPort,
            path: '/api/mmdb/decompress',
            method: 'POST',
            headers: {
                Authorization: `Bearer ${checkerToken}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
            },
        }, (res) => {
            let raw = '';
            res.on('data', chunk => { raw += chunk; });
            res.on('end', () => {
                if (res.statusCode === 200) {
                    resolve();
                } else {
                    reject(new Error(`MMDB decompress failed: HTTP ${res.statusCode} — ${raw}`));
                }
            });
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

/**
 * Signal the Go backend to start background geo enrichment.
 * Fire-and-forget — non-fatal if unavailable or already running.
 */
function signalGoGeoEnrich() {
    if (!checkerPort || !checkerToken) return;
    const req = http.request({
        hostname: '127.0.0.1',
        port: checkerPort,
        path: '/api/geo/enrich',
        method: 'POST',
        headers: { Authorization: `Bearer ${checkerToken}` },
    }, (res) => { res.resume(); });
    req.on('error', () => { /* non-fatal */ });
    req.end();
}

/**
 * Fetch the remote metadata.json. Returns parsed JSON or throws.
 * Uses cache-busting query param to bypass CDN caches.
 */
async function fetchMetadata() {
    const text = await fetchText(`${MMDB_BASE_URL}/metadata.json?t=${Date.now()}`);
    return JSON.parse(text);
}

/**
 * mmdb:ensure — verify the local GeoIP database is current; download if not.
 *
 * Two-phase progress events are pushed via 'mmdb-progress':
 *   { phase: 'download', pct: 0-100, totalBytes: number }
 *   { phase: 'decompress', pct: -1 }   (indeterminate while Go decompresses)
 *   { phase: 'decompress', pct: 100 }  (complete)
 *
 * Returns { status: 'ready' | 'cancelled' }.
 */
ipcMain.handle('mmdb:ensure', async () => {
    const dataDir = getDataDir();
    const mmdbDir = path.join(dataDir, 'mmdb');
    const mmdbPath = path.join(mmdbDir, 'geoip.mmdb');
    const checksumPath = path.join(mmdbDir, 'checksum.txt');

    // Fetch remote metadata (checksum + sizes). If unreachable and a local copy
    // exists, silently proceed with what we have.
    let metadata;
    try {
        metadata = await fetchMetadata();
    } catch {
        if (fs.existsSync(mmdbPath)) return { status: 'ready' };
        throw Object.assign(new Error('GeoIP database unavailable and no local copy found.'), { code: 'MMDB_UNAVAILABLE' });
    }

    const remoteChecksum = metadata.checksum;

    // Compare with the locally stored checksum.
    let localChecksum = null;
    if (fs.existsSync(checksumPath)) {
        try { localChecksum = fs.readFileSync(checksumPath, 'utf8').trim(); } catch { /* ignore */ }
    }

    if (localChecksum === remoteChecksum && fs.existsSync(mmdbPath)) {
        return { status: 'ready' }; // already up to date
    }

    await fs.promises.mkdir(mmdbDir, { recursive: true });

    const ac = new AbortController();
    activeMMDBAbort = ac;

    const sendProgress = (data) => {
        if (window && !window.isDestroyed()) {
            window.webContents.send('mmdb-progress', data);
        }
    };

    // — Phase 1: Download the compressed file —
    // downloadFile writes atomically via <destPath>.download then renames to <destPath>.
    const zstPath = path.join(mmdbDir, 'geoip.mmdb.zst');
    sendProgress({ phase: 'download', pct: 0, totalBytes: metadata.compressed_size || 0 });

    try {
        await downloadFile(
            `${MMDB_BASE_URL}/geoip.mmdb.zst`,
            zstPath,
            ({ pct, totalBytes }) => sendProgress({ phase: 'download', pct, totalBytes }),
            ac.signal,
        );
    } catch (err) {
        await fs.promises.unlink(zstPath).catch(() => {});
        if (err.code === 'MMDB_CANCELLED') return { status: 'cancelled' };
        throw err;
    } finally {
        activeMMDBAbort = null;
    }

    // — Phase 2: Decompress via Go backend —
    sendProgress({ phase: 'decompress', pct: -1 }); // indeterminate

    try {
        await signalGoMMDBDecompress(zstPath);
    } finally {
        await fs.promises.unlink(zstPath).catch(() => {});
    }

    sendProgress({ phase: 'decompress', pct: 100 });

    // Persist the checksum of the newly installed file.
    try { fs.writeFileSync(checksumPath, remoteChecksum, 'utf8'); } catch { /* ignore */ }

    // Kick off background geo enrichment for proxies checked without MMDB,
    // and open the SSE stream so the renderer receives progress events.
    signalGoGeoEnrich();
    listenGeoEnrichSSE();

    return { status: 'ready' };
});

/** mmdb:cancel — abort an in-progress MMDB download. */
ipcMain.handle('mmdb:cancel', async () => {
    if (activeMMDBAbort) {
        activeMMDBAbort.abort();
        activeMMDBAbort = null;
    }
});

/**
 * mmdb:available — check whether the local GeoIP database file exists.
 * Returns { available: boolean }. Does NOT trigger a download.
 */
ipcMain.handle('mmdb:available', () => {
    const dataDir = getDataDir();
    const mmdbPath = path.join(dataDir, 'mmdb', 'geoip.mmdb');
    return { available: fs.existsSync(mmdbPath) };
});

/**
 * geo:enrich:start — trigger background geo enrichment for pending rows and
 * open the SSE stream so the renderer receives progress events.
 * Idempotent: safe to call even if enrichment is already running.
 */
ipcMain.handle('geo:enrich:start', () => {
    signalGoGeoEnrich();
    listenGeoEnrichSSE();
});

/**
 * geo:enrich:cancel — cancel any running geo enrichment job.
 */
ipcMain.handle('geo:enrich:cancel', () => {
    if (!checkerPort || !checkerToken) return;
    const req = http.request({
        hostname: '127.0.0.1',
        port: checkerPort,
        path: '/api/geo/enrich',
        method: 'DELETE',
        headers: { Authorization: `Bearer ${checkerToken}` },
    }, (res) => { res.resume(); });
    req.on('error', () => { /* non-fatal */ });
    req.end();
});
