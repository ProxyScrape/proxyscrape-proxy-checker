import path from 'path';
import os from 'os';
import fs from 'fs';
import http from 'http';
import readline from 'readline';
import { spawn, execSync, spawnSync } from 'child_process';
import { BrowserWindow, app, ipcMain, dialog, session, clipboard } from 'electron';
import { autoUpdater } from 'electron-updater';
import { isDev, isPortable, IS_CANARY } from '../shared/AppConstants';

// Separate userData for canary vs stable so they never share settings, DB, or
// the migration trigger file. Must be called before app.whenReady().
// productName controls the installer name but NOT app.getPath('userData') at
// runtime — that comes from app.getName() which reads package.json `name`.
// Appending " Canary" here mirrors what productName does for the install entry.
//
// NOTE — dev mode collision with installed canary:
// IS_CANARY is a compile-time Vite constant derived from package.json version.
// When the repo is on a -canary version, IS_CANARY is true in BOTH the installed
// canary app and a `npm run dev` session, so both resolve to the same userData
// path (e.g. "…/proxyscrape-proxy-checker Canary"). This causes
// app.requestSingleInstanceLock() to fail in the dev process (the installed
// canary holds it), which calls app.quit() immediately — the window flashes
// briefly and vanishes with no error dialog.
//
// Secondary effects if the lock were somehow bypassed:
//   - Both processes would open the same checker.db (SQLite SQLITE_BUSY crash)
//   - os.tmpdir()/proxychecker.pid would be overwritten by the dev process
//   - os.tmpdir()/proxychecker-check.json would be consumed by whichever
//     process wakes first, silently losing the payload for the other
//
// Potential fix (needs audit before applying — other paths may also need updates):
//   if (!app.isPackaged) {
//       app.setPath('userData', app.getPath('userData') + ' Dev');
//   }
// This gives the dev process its own isolated userData, lock, and database,
// allowing dev and any installed build to coexist. The temp file paths
// (proxychecker.pid, proxychecker-check.json) would also need a dev suffix.
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

// Buffered update events that fired before the renderer registered its listeners.
// Replayed when the renderer sends 'update-listener-ready'.
let pendingUpdateAvailable = false;
let pendingUpdateReady = false;
let pendingUpdateError = null; // string | null

// Buffered native-check payload written by the host binary before this process
// existed (cold-start: host launched us, then wrote the file). Flushed to the
// renderer via did-finish-load, the same way pendingDeepLink is handled.
let pendingCheckPayload = null;

// True while a geo-enrich SSE connection is open. Prevents duplicate streams
// if listenGeoEnrichSSE() is ever called more than once.
let geoEnrichListening = false;

const isMac = process.platform === 'darwin';

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

// =============================================================================
// Native Messaging — Chrome extension ↔ desktop app bridge
// =============================================================================

// The native messaging host name must match what the Chrome extension declares
// (background.js: CHECKER_HOST = 'com.proxyscrape.checker').
const NM_HOST_NAME = 'com.proxyscrape.checker';

// Chrome extension IDs allowed to connect to this native messaging host.
//
// Chrome requires at least one entry here — an empty array means Chrome silently
// rejects all connection attempts even if the manifest file is installed.
//
// DEV ID: The extension manifest carries a pinned `key` so it always gets this
// stable ID when loaded as an unpacked extension, regardless of machine or path.
// Add the production Chrome Web Store ID here once the extension is published.
const CHROME_EXTENSION_IDS = [
    'chrome-extension://nkpeakhnbfobegmpilfnbnkpncjblkgm/', // dev (unpacked) — pinned via manifest key
];

// Firefox extension ID (different format — uses addon id, not chrome-extension://).
const FIREFOX_EXTENSION_ID = 'proxyscrape-proxy-manager@proxyscrape.com';

// All known browsers with detection paths, NM host directories, and Windows registry keys.
// Adding a new browser requires only a new entry here — no other code changes needed.
// nmDir values for mac/linux are pre-computed at module load; Windows manifests always go
// in userData/native-messaging/manifests/<id>/ (computed lazily via getNmDir since
// app.getPath('userData') is only available after app.whenReady).
const _h = os.homedir();
const KNOWN_BROWSERS = [
    {
        id: 'chrome', name: 'Google Chrome', type: 'chromium',
        detect: {
            darwin: ['/Applications/Google Chrome.app'],
            linux:  ['google-chrome', 'google-chrome-stable'],
            win32:  ['Google\\Chrome\\Application\\chrome.exe'],
        },
        nmDir: {
            darwin: path.join(_h, 'Library/Application Support/Google/Chrome/NativeMessagingHosts'),
            linux:  path.join(_h, '.config/google-chrome/NativeMessagingHosts'),
        },
        winRegKey: `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${NM_HOST_NAME}`,
    },
    {
        id: 'edge', name: 'Microsoft Edge', type: 'chromium',
        detect: {
            darwin: ['/Applications/Microsoft Edge.app'],
            linux:  ['microsoft-edge', 'microsoft-edge-stable'],
            win32:  ['Microsoft\\Edge\\Application\\msedge.exe'],
        },
        nmDir: {
            darwin: path.join(_h, 'Library/Application Support/Microsoft Edge/NativeMessagingHosts'),
            linux:  path.join(_h, '.config/microsoft-edge/NativeMessagingHosts'),
        },
        winRegKey: `HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\${NM_HOST_NAME}`,
    },
    {
        id: 'brave', name: 'Brave Browser', type: 'chromium',
        detect: {
            darwin: ['/Applications/Brave Browser.app'],
            linux:  ['brave-browser', 'brave'],
            win32:  ['BraveSoftware\\Brave-Browser\\Application\\brave.exe'],
        },
        nmDir: {
            darwin: path.join(_h, 'Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts'),
            linux:  path.join(_h, '.config/BraveSoftware/Brave-Browser/NativeMessagingHosts'),
        },
        winRegKey: `HKCU\\Software\\BraveSoftware\\Brave-Browser\\NativeMessagingHosts\\${NM_HOST_NAME}`,
    },
    {
        id: 'opera', name: 'Opera', type: 'chromium',
        detect: {
            darwin: ['/Applications/Opera.app'],
            linux:  ['opera'],
            win32:  ['Programs\\Opera\\opera.exe', 'Opera Software\\Opera Stable\\opera.exe'],
        },
        nmDir: {
            darwin: path.join(_h, 'Library/Application Support/com.operasoftware.Opera/NativeMessagingHosts'),
            linux:  path.join(_h, '.config/opera/NativeMessagingHosts'),
        },
        winRegKey: `HKCU\\Software\\Opera Software\\NativeMessagingHosts\\${NM_HOST_NAME}`,
    },
    {
        id: 'vivaldi', name: 'Vivaldi', type: 'chromium',
        detect: {
            darwin: ['/Applications/Vivaldi.app'],
            linux:  ['vivaldi'],
            win32:  ['Vivaldi\\Application\\vivaldi.exe'],
        },
        nmDir: {
            darwin: path.join(_h, 'Library/Application Support/Vivaldi/NativeMessagingHosts'),
            linux:  path.join(_h, '.config/vivaldi/NativeMessagingHosts'),
        },
        winRegKey: `HKCU\\Software\\Vivaldi\\NativeMessagingHosts\\${NM_HOST_NAME}`,
    },
    {
        id: 'arc', name: 'Arc', type: 'chromium',
        detect: {
            darwin: ['/Applications/Arc.app'],
            linux:  [],
            win32:  [],
        },
        nmDir: {
            darwin: path.join(_h, 'Library/Application Support/Arc/User Data/NativeMessagingHosts'),
            linux:  null,
        },
        winRegKey: null,
    },
    {
        id: 'chromium', name: 'Chromium', type: 'chromium',
        detect: {
            darwin: ['/Applications/Chromium.app'],
            linux:  ['chromium', 'chromium-browser'],
            win32:  ['Chromium\\Application\\chrome.exe'],
        },
        nmDir: {
            darwin: path.join(_h, 'Library/Application Support/Chromium/NativeMessagingHosts'),
            linux:  path.join(_h, '.config/chromium/NativeMessagingHosts'),
        },
        winRegKey: `HKCU\\Software\\Chromium\\NativeMessagingHosts\\${NM_HOST_NAME}`,
    },
    {
        id: 'firefox', name: 'Mozilla Firefox', type: 'firefox',
        detect: {
            darwin: ['/Applications/Firefox.app'],
            linux:  ['firefox', 'firefox-esr'],
            win32:  ['Mozilla Firefox\\firefox.exe'],
        },
        // Covers all Firefox variants (Dev Edition, Nightly) — they share this directory.
        nmDir: {
            darwin: path.join(_h, 'Library/Application Support/Mozilla/NativeMessagingHosts'),
            linux:  path.join(_h, '.mozilla/native-messaging-hosts'),
        },
        winRegKey: `HKCU\\Software\\Mozilla\\NativeMessagingHosts\\${NM_HOST_NAME}`,
    },
];

// ─── Chromium filesystem scanner ─────────────────────────────────────────────
// Detects unconventional Chromium-based browsers (e.g. Comet, Thorium, Cent)
// that aren't in KNOWN_BROWSERS, by scanning the standard user-data root for
// directories that contain both "Local State" and "Default/Preferences" — the
// two files that identify a Chromium profile directory. Plain Electron apps
// (e.g. Claude, VS Code) have "Local State" but not "Default/Preferences", so
// the two-file check correctly excludes them.

function _isChromiumProfileDir(dir) {
    return fs.existsSync(path.join(dir, 'Local State')) &&
           fs.existsSync(path.join(dir, 'Default', 'Preferences'));
}

function _makeScanEntry(name, nmDir, winRegKeys = []) {
    const id = `scan-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    return { id, name, type: 'chromium', nmDir, winRegKeys };
}

// For reverse-DNS bundle IDs (e.g. "com.openai.atlas") derive a readable name
// ("Atlas") from the last segment.
function _bundleDisplayName(bundleId) {
    const last = bundleId.split('.').pop();
    return last.charAt(0).toUpperCase() + last.slice(1);
}

// Returns the registry keys a scan-detected Chromium browser should register under.
// Most unmodified Chromium forks never patch the hardcoded registry path they
// inherited from upstream, so we write to all canonical paths:
//   1. Chrome's path — covers Comet and the majority of unmodified forks
//   2. Chromium's path — covers plain open-source Chromium builds
//   3. The vendor-namespaced guess — covers forks that did customize their key
// Writing to extra keys the browser doesn't read is harmless.
function _scanWinRegKeys(vendor, browser = null) {
    const guessedKey = browser
        ? `HKCU\\Software\\${vendor}\\${browser}\\NativeMessagingHosts\\${NM_HOST_NAME}`
        : `HKCU\\Software\\${vendor}\\NativeMessagingHosts\\${NM_HOST_NAME}`;
    return [
        `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${NM_HOST_NAME}`,
        `HKCU\\Software\\Chromium\\NativeMessagingHosts\\${NM_HOST_NAME}`,
        guessedKey,
    ];
}

// Normalises singular winRegKey (KNOWN_BROWSERS) and plural winRegKeys (scan entries)
// into a single array so callers never need to branch.
function _getWinRegKeys(browser) {
    if (Array.isArray(browser.winRegKeys)) return browser.winRegKeys;
    if (browser.winRegKey) return [browser.winRegKey];
    return [];
}

// Only used in the startup self-healing check — not called on every UI refresh.
function _isWinRegKeyPresent(key) {
    return spawnSync('reg', ['query', key, '/ve'], { windowsHide: true }).status === 0;
}

function scanChromiumBrowsers() {
    const platform = process.platform;
    const results = [];

    // Build a set of NM dirs already covered by KNOWN_BROWSERS so we don't
    // surface duplicates for browsers the user can already see explicitly.
    const knownNmDirs = new Set(
        KNOWN_BROWSERS.map(b => b.nmDir?.[platform]).filter(Boolean)
    );

    if (platform === 'darwin') {
        const base = path.join(os.homedir(), 'Library', 'Application Support');
        try {
            for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
                if (!entry.isDirectory()) continue;
                const dir = path.join(base, entry.name);

                // Depth-1: direct Chromium profile (e.g. Comet, Arc, Thorium)
                const nmDir = path.join(dir, 'NativeMessagingHosts');
                if (!knownNmDirs.has(nmDir) && _isChromiumProfileDir(dir)) {
                    results.push(_makeScanEntry(entry.name, nmDir));
                    continue;
                }

                // Depth-2: namespaced dirs like "Google/Chrome".
                // Depth-3: reverse-DNS bundle IDs like "com.openai.atlas" whose
                //   browser data lives in a sub-subdirectory
                //   (e.g. com.openai.atlas/browser-data/host/).
                //   In both cases the display name is derived from the bundle ID
                //   (last segment, capitalised) rather than from the leaf dir.
                const isBundleId = entry.name.includes('.');
                const bundleName = isBundleId ? _bundleDisplayName(entry.name) : null;

                try {
                    for (const sub of fs.readdirSync(dir, { withFileTypes: true })) {
                        if (!sub.isDirectory()) continue;
                        const subDir = path.join(dir, sub.name);
                        const subNmDir = path.join(subDir, 'NativeMessagingHosts');

                        if (!knownNmDirs.has(subNmDir) && _isChromiumProfileDir(subDir)) {
                            results.push(_makeScanEntry(bundleName ?? sub.name, subNmDir));
                            continue;
                        }

                        // Depth-3 only for bundle-ID containers
                        if (isBundleId) {
                            try {
                                for (const subsub of fs.readdirSync(subDir, { withFileTypes: true })) {
                                    if (!subsub.isDirectory()) continue;
                                    const subsubDir = path.join(subDir, subsub.name);
                                    const subsubNmDir = path.join(subsubDir, 'NativeMessagingHosts');
                                    if (!knownNmDirs.has(subsubNmDir) && _isChromiumProfileDir(subsubDir))
                                        results.push(_makeScanEntry(bundleName, subsubNmDir));
                                }
                            } catch { /* skip */ }
                        }
                    }
                } catch { /* skip */ }
            }
        } catch { /* base unreadable */ }
    }

    if (platform === 'linux') {
        const base = path.join(os.homedir(), '.config');
        try {
            for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
                if (!entry.isDirectory()) continue;
                const dir = path.join(base, entry.name);
                const nmDir = path.join(dir, 'NativeMessagingHosts');
                if (!knownNmDirs.has(nmDir) && _isChromiumProfileDir(dir))
                    results.push(_makeScanEntry(entry.name, nmDir));
            }
        } catch { /* base unreadable */ }
    }

    if (platform === 'win32') {
        const base = process.env.LOCALAPPDATA || '';
        // Skip dirs already covered by KNOWN_BROWSERS to avoid duplicates.
        const skipDirs = new Set(['Google', 'Microsoft', 'BraveSoftware', 'Vivaldi', 'Chromium', 'Mozilla']);
        if (base) {
            try {
                for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
                    if (!entry.isDirectory() || skipDirs.has(entry.name)) continue;

                    // Depth-1: Chromium profile at "<vendor>/User Data/" (e.g. Thorium, Cent).
                    const userDataDir = path.join(base, entry.name, 'User Data');
                    if (_isChromiumProfileDir(userDataDir)) {
                        results.push(_makeScanEntry(entry.name, null, _scanWinRegKeys(entry.name)));
                        continue;
                    }

                    // Depth-2: vendor-namespaced layout "<vendor>/<browser>/User Data/"
                    // (e.g. Perplexity/Comet). Display the browser name, not the vendor.
                    try {
                        for (const sub of fs.readdirSync(path.join(base, entry.name), { withFileTypes: true })) {
                            if (!sub.isDirectory()) continue;
                            const subUserDataDir = path.join(base, entry.name, sub.name, 'User Data');
                            if (_isChromiumProfileDir(subUserDataDir))
                                results.push(_makeScanEntry(sub.name, null, _scanWinRegKeys(entry.name, sub.name)));
                        }
                    } catch { /* skip */ }
                }
            } catch { /* base unreadable */ }
        }
    }

    return results;
}
// ─────────────────────────────────────────────────────────────────────────────

// Custom browsers are user-defined entries stored in userData as JSON.
// Computed lazily because app.getPath requires app.whenReady.
function customBrowsersFile() {
    return path.join(app.getPath('userData'), 'native-messaging', 'custom-browsers.json');
}
function loadCustomBrowsers() {
    try { return JSON.parse(fs.readFileSync(customBrowsersFile(), 'utf8')); }
    catch { return []; }
}
function saveCustomBrowsers(list) {
    const file = customBrowsersFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(list, null, 2), 'utf8');
}

// Opted-out browser IDs — auto-register skips these. Populated when the user
// manually removes a known browser; cleared when they manually register it again.
function optedOutFile() {
    return path.join(app.getPath('userData'), 'native-messaging', 'opted-out.json');
}
function loadOptedOut() {
    try { return new Set(JSON.parse(fs.readFileSync(optedOutFile(), 'utf8'))); }
    catch { return new Set(); }
}
function saveOptedOut(set) {
    const file = optedOutFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify([...set], null, 2), 'utf8');
}
function setOptedOut(browserId, optOut) {
    const set = loadOptedOut();
    optOut ? set.add(browserId) : set.delete(browserId);
    saveOptedOut(set);
}

// Returns true if the browser appears to be installed on this machine.
// macOS: checks .app bundle paths. Linux: checks PATH via which.
// Windows: checks exe paths relative to %LOCALAPPDATA%, %PROGRAMFILES%, %PROGRAMFILES(X86)%.
function isBrowserInstalled(browser) {
    const platform = process.platform;
    const candidates = browser.detect?.[platform] ?? [];
    if (candidates.length === 0) return false;
    if (platform === 'darwin') {
        return candidates.some(p => fs.existsSync(p));
    }
    if (platform === 'linux') {
        return candidates.some(cmd => spawnSync('which', [cmd], { stdio: 'ignore' }).status === 0);
    }
    if (platform === 'win32') {
        const roots = [
            process.env.LOCALAPPDATA,
            process.env.PROGRAMFILES,
            process.env['PROGRAMFILES(X86)'],
        ].filter(Boolean);
        return candidates.some(rel => roots.some(root => fs.existsSync(path.join(root, rel))));
    }
    return false;
}

function getHostBinaryName() {
    const platform = process.platform;
    const arch = process.arch;
    if (platform === 'win32') {
        return arch === 'arm64' ? 'proxychecker-host-win-arm64.exe' : 'proxychecker-host-win-x64.exe';
    }
    return `proxychecker-host-${platform === 'darwin' ? 'darwin' : 'linux'}-${arch === 'arm64' ? 'arm64' : 'x64'}`;
}

function getHostBinaryPath() {
    const name = getHostBinaryName();
    if (app.isPackaged) {
        return path.join(process.resourcesPath, 'bin', name);
    }
    return path.join(__dirname, '../../bin', name);
}

// Returns the NativeMessagingHosts directory for a browser.
// Windows: always userData/native-messaging/manifests/<id>/ so manifests survive browser updates.
// Custom browsers carry nmDir as a plain string (user-provided path).
// Known browsers carry nmDir as a { darwin, linux } map.
function getNmDir(browser) {
    if (process.platform === 'win32') {
        return path.join(app.getPath('userData'), 'native-messaging', 'manifests', browser.id);
    }
    if (typeof browser.nmDir === 'string') return browser.nmDir || null;
    return browser.nmDir?.[process.platform] ?? null;
}

function buildManifest(type) {
    const base = {
        name: NM_HOST_NAME,
        description: 'ProxyScrape Proxy Checker native host',
        path: getHostBinaryPath(),
        type: 'stdio',
    };
    return type === 'firefox'
        ? { ...base, allowed_extensions: [FIREFOX_EXTENSION_ID] }
        : { ...base, allowed_origins: CHROME_EXTENSION_IDS };
}

function registerBrowser(browser) {
    const nmDir = getNmDir(browser);
    if (!nmDir) throw new Error(`No NativeMessagingHosts directory known for ${browser.name}`);
    const dest = path.join(nmDir, `${NM_HOST_NAME}.json`);
    fs.mkdirSync(nmDir, { recursive: true });
    fs.writeFileSync(dest, JSON.stringify(buildManifest(browser.type), null, 2), 'utf8');
    if (process.platform === 'win32') {
        for (const key of _getWinRegKeys(browser)) {
            spawnSync('reg', ['add', key, '/ve', '/d', dest, '/f'], { windowsHide: true });
        }
    }
}

function isBrowserRegistered(browser) {
    const nmDir = getNmDir(browser);
    if (!nmDir) return false;
    return fs.existsSync(path.join(nmDir, `${NM_HOST_NAME}.json`));
}

function unregisterBrowser(browser) {
    const nmDir = getNmDir(browser);
    if (!nmDir) return;
    try { fs.unlinkSync(path.join(nmDir, `${NM_HOST_NAME}.json`)); } catch { /* already gone */ }
    if (process.platform === 'win32') {
        const keys = _getWinRegKeys(browser);
        if (keys.length === 0) return;
        // Build once — scanChromiumBrowsers() does filesystem I/O.
        const others = [...KNOWN_BROWSERS, ...loadCustomBrowsers(), ...scanChromiumBrowsers()]
            .filter(b => b.id !== browser.id && isBrowserRegistered(b));
        for (const key of keys) {
            const owner = others.find(b => _getWinRegKeys(b).includes(key));
            if (owner) {
                // Another registered browser shares this key — restore it to their manifest
                // rather than deleting it (e.g. unregistering Comet must not break Chrome).
                const ownerDest = path.join(getNmDir(owner), `${NM_HOST_NAME}.json`);
                spawnSync('reg', ['add', key, '/ve', '/d', ownerDest, '/f'], { windowsHide: true });
            } else {
                spawnSync('reg', ['delete', key, '/f'], { windowsHide: true });
            }
        }
    }
}

function findBrowser(browserId) {
    return KNOWN_BROWSERS.find(b => b.id === browserId)
        || loadCustomBrowsers().find(b => b.id === browserId)
        || scanChromiumBrowsers().find(b => b.id === browserId)
        || null;
}

ipcMain.handle('native-messaging-status', () => {
    const custom = loadCustomBrowsers();
    const detected = [];
    const known = [];
    for (const b of KNOWN_BROWSERS) {
        const entry = { id: b.id, name: b.name, type: b.type, registered: isBrowserRegistered(b) };
        if (isBrowserInstalled(b)) detected.push(entry);
        else known.push(entry);
    }
    // Append scanned (unconventional) Chromium browsers to the detected list.
    for (const b of scanChromiumBrowsers()) {
        detected.push({ id: b.id, name: b.name, type: b.type, registered: isBrowserRegistered(b) });
    }
    return {
        detected,
        known,
        custom: custom.map(b => ({ id: b.id, name: b.name, type: b.type, registered: isBrowserRegistered(b) })),
        hostExists: fs.existsSync(getHostBinaryPath()),
    };
});

ipcMain.handle('native-messaging-register', (_event, browserId) => {
    try {
        const browser = findBrowser(browserId);
        if (!browser) throw new Error(`Unknown browser: ${browserId}`);
        registerBrowser(browser);
        // User explicitly opted back in — clear any previous opt-out.
        const isAutoManaged = KNOWN_BROWSERS.some(b => b.id === browserId) || browserId.startsWith('scan-');
        if (isAutoManaged) setOptedOut(browserId, false);
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('native-messaging-unregister', (_event, browserId) => {
    try {
        const browser = findBrowser(browserId);
        if (!browser) throw new Error(`Unknown browser: ${browserId}`);
        unregisterBrowser(browser);
        // User explicitly removed a known or scanned browser — opt it out so
        // auto-register doesn't re-register it on the next launch.
        const isAutoManaged = KNOWN_BROWSERS.some(b => b.id === browserId) || browserId.startsWith('scan-');
        if (isAutoManaged) setOptedOut(browserId, true);
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('native-messaging-unregister-all', () => {
    const errors = [];
    const scanned = scanChromiumBrowsers();
    for (const b of [...KNOWN_BROWSERS, ...loadCustomBrowsers(), ...scanned]) {
        try { unregisterBrowser(b); } catch (err) { errors.push(err.message); }
    }
    // Opt out all known + scanned browsers so auto-register doesn't immediately undo this.
    const set = new Set([...KNOWN_BROWSERS.map(b => b.id), ...scanned.map(b => b.id)]);
    saveOptedOut(set);
    return { success: errors.length === 0, errors };
});

ipcMain.handle('native-messaging-add-custom', (_event, { name, type, nmDir }) => {
    try {
        const list = loadCustomBrowsers();
        const id = `custom-${Date.now()}`;
        list.push({ id, name, type, nmDir });
        saveCustomBrowsers(list);
        return { success: true, id };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('native-messaging-remove-custom', (_event, id) => {
    try {
        const list = loadCustomBrowsers();
        const browser = list.find(b => b.id === id);
        if (browser) unregisterBrowser(browser);
        saveCustomBrowsers(list.filter(b => b.id !== id));
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

// Preload reads sync before first paint — must be registered early
ipcMain.on('get-api-config', (event) => {
    event.returnValue = {
        apiBase: checkerPort != null ? `http://127.0.0.1:${checkerPort}` : '',
        token: checkerToken || '',
    };
});

// Triggered by the renderer's "Restart now" button after update-ready fires.
ipcMain.on('install-update', () => {
    autoUpdater.quitAndInstall(false, true);
});

// Renderer signals that its update listeners are registered; replay any events
// that fired before componentDidMount ran (fast startup / cached updates).
ipcMain.on('update-listener-ready', () => {
    if (!window || window.isDestroyed()) return;
    if (pendingUpdateAvailable) window.webContents.send('update-available');
    if (pendingUpdateReady)     window.webContents.send('update-ready');
    if (pendingUpdateError)     window.webContents.send('update-error', pendingUpdateError);
    pendingUpdateAvailable = false;
    pendingUpdateReady     = false;
    pendingUpdateError     = null;
});

ipcMain.handle('choose-directory', async () => {
    try {
        const { filePaths, canceled } = await dialog.showOpenDialog({
            properties: ['openDirectory', 'createDirectory'],
        });
        if (canceled || !filePaths?.length) return null;
        return filePaths[0];
    } catch (error) {
        console.error(error);
        return null;
    }
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
    height: 955,
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

    // Write our PID so the native messaging host binary can detect whether the
    // app is running (it reads this file and checks process liveness).
    try {
        fs.writeFileSync(path.join(os.tmpdir(), 'proxychecker.pid'), String(process.pid), 'utf8');
    } catch { /* non-fatal */ }

    // Watch for native-messaging "check" payloads written by the Go host binary.
    // Chrome launches the host as a short-lived subprocess; it writes the proxy
    // list to this file and exits. We poll rather than fs.watch because the file
    // may not exist at startup and fs.watchFile works on non-existent paths.
    const checkFile = path.join(os.tmpdir(), 'proxychecker-check.json');
    const consumeCheckFile = () => {
        try {
            const raw = fs.readFileSync(checkFile, 'utf8');
            fs.unlinkSync(checkFile); // consume immediately to avoid re-processing
            const { proxies, source } = JSON.parse(raw);
            if (!Array.isArray(proxies) || proxies.length === 0) return;

            if (window && !window.isDestroyed()) {
                // Window is live — deliver immediately.
                if (window.isMinimized()) window.restore();
                if (process.platform === 'win32') {
                    // Windows blocks focus-stealing from background processes via SetForegroundWindow
                    // policy. Briefly marking the window always-on-top bypasses the restriction.
                    window.setAlwaysOnTop(true);
                    window.show();
                    window.focus();
                    window.setAlwaysOnTop(false);
                } else {
                    window.show();
                    window.focus();
                    app.focus({ steal: true });
                }
                window.webContents.send('native-check-proxies', { proxies, source: source || null });
            } else {
                // Window not yet created (cold-start: host launched us before this
                // process existed). Buffer and flush after did-finish-load.
                pendingCheckPayload = { proxies, source: source || null };
            }
        } catch { /* file gone or malformed — ignore */ }
    };
    fs.watchFile(checkFile, { interval: 300, persistent: false }, consumeCheckFile);
    // Handle the case where the host wrote the file before this process started
    // (i.e. the host launched us — watchFile only fires on changes after registration).
    // Ignore files older than 30 s — they are stale leftovers from a previous
    // session where the app crashed before consuming the payload.
    if (fs.existsSync(checkFile)) {
        const ageMs = Date.now() - fs.statSync(checkFile).mtimeMs;
        if (ageMs < 30_000) {
            consumeCheckFile();
        } else {
            try { fs.unlinkSync(checkFile); } catch { /* already gone */ }
        }
    }

    // Auto-register all detected browsers that haven't been explicitly opted out.
    // Always re-registers unconditionally so the manifest path is always current —
    // this fixes stale manifests after reinstall to a different location or after
    // an app bundle path change (e.g. canary → stable). The write is cheap (one
    // JSON file + registry keys on Windows) and non-fatal on failure.
    // Scanned browsers (unconventional Chromium forks) are included.
    const optedOut = loadOptedOut();
    const browsersToAutoRegister = [
        ...KNOWN_BROWSERS.filter(b => isBrowserInstalled(b)),
        ...scanChromiumBrowsers(),
    ];
    for (const b of browsersToAutoRegister) {
        if (optedOut.has(b.id)) continue;
        try { registerBrowser(b); } catch { /* non-fatal */ }
    }

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

    // Flush any native-check payload buffered during cold-start (host launched us
    // before the window existed — consumeCheckFile stored it in pendingCheckPayload).
    if (pendingCheckPayload) {
        const payloadToSend = pendingCheckPayload;
        pendingCheckPayload = null;
        window.webContents.once('did-finish-load', () => {
            if (window && !window.isDestroyed()) {
                if (window.isMinimized()) window.restore();
                window.show();
                window.focus();
                app.focus({ steal: true });
                window.webContents.send('native-check-proxies', payloadToSend);
            }
        });
    }

    if (app.isPackaged && !isPortable) {
        autoUpdater.checkForUpdates();
    }

    // On startup, trigger geo enrichment for any pending rows.
    signalAndListenGeoEnrich();
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
    // Remove the PID file so the native messaging host knows the app is gone.
    try { fs.unlinkSync(path.join(os.tmpdir(), 'proxychecker.pid')); } catch { /* already gone */ }
});

app.on('window-all-closed', async () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// Auto-updates run on all packaged non-portable builds (stable and canary).
// Canary publishes to the canary/ R2 channel so users only receive canary updates.
// Portables never auto-update — the user controls when to replace the executable.

// Explicitly set so the behaviour is documented — when an update is downloaded
// but the user dismisses the toast, it installs silently on the next app quit.
// Write updater events to a rolling log file so silent failures are
// diagnosable without attaching a debugger. Log path on Windows:
//   %APPDATA%\ProxyScrape Proxy Checker[ Canary]\logs\updater.log
autoUpdater.logger = (() => {
    try {
        const logDir  = path.join(app.getPath('logs'));
        fs.mkdirSync(logDir, { recursive: true });
        const logFile = path.join(logDir, 'updater.log');
        const stamp   = () => new Date().toISOString();
        const write   = (level, msg) => {
            try { fs.appendFileSync(logFile, `${stamp()} [${level}] ${msg}\n`); } catch { /* ignore write errors */ }
        };
        return { info: m => write('INFO', m), warn: m => write('WARN', m), error: m => write('ERROR', m), debug: m => write('DEBUG', m) };
    } catch {
        return null;
    }
})();

autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.on('update-available', () => {
    pendingUpdateError = null; // a successful check supersedes any prior error
    if (window && !window.isDestroyed()) {
        window.webContents.send('update-available');
    } else {
        pendingUpdateAvailable = true;
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
    pendingUpdateAvailable = false; // ready supersedes available
    pendingUpdateError = null;
    if (window && !window.isDestroyed()) {
        window.webContents.send('update-ready');
    } else {
        pendingUpdateReady = true;
    }
});

autoUpdater.on('error', (err) => {
    const msg = err?.message || String(err);
    console.error('[updater] error:', msg);
    pendingUpdateAvailable = false; // error supersedes in-progress download
    pendingUpdateReady = false;
    if (window && !window.isDestroyed()) {
        window.webContents.send('update-error', msg);
    } else {
        pendingUpdateError = msg;
    }
});

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
// Geo enrichment SSE — drain stream so background DB worker runs to completion
// =============================================================================

/**
 * Connect to the Go geo enrichment SSE stream and drain it until the backend
 * reports running=false or the stream closes. This keeps the singleton guard
 * active so duplicate streams are never opened, and ensures the Go worker runs
 * to completion (updating the DB) even when no renderer client is listening.
 */
function listenGeoEnrichSSE() {
    if (!checkerPort || !checkerToken) return;
    // Singleton guard — only one SSE connection at a time.
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

/**
 * POST /api/geo/enrich and return the parsed JSON response, or null on error.
 * Awaiting this resolves only after the server has accepted (or rejected) the
 * job, so callers know the exact status before deciding to open an SSE stream.
 */
function signalGoGeoEnrich() {
    if (!checkerPort || !checkerToken) return Promise.resolve(null);
    return new Promise((resolve) => {
        const req = http.request({
            hostname: '127.0.0.1',
            port: checkerPort,
            path: '/api/geo/enrich',
            method: 'POST',
            headers: { Authorization: `Bearer ${checkerToken}` },
        }, (res) => {
            let body = '';
            res.on('data', chunk => { body += chunk; });
            res.on('end', () => {
                try { resolve(JSON.parse(body)); } catch { resolve(null); }
            });
        });
        req.on('error', () => resolve(null));
        req.end();
    });
}

/**
 * Signal geo enrichment and — only if the server confirms work was started or
 * is already in progress — open the SSE listener. This prevents the race where
 * listenGeoEnrichSSE() connects before the POST is processed: the first SSE
 * tick would see running=false, close the stream, and leave enrichment with no
 * listener for the rest of the job.
 */
async function signalAndListenGeoEnrich() {
    const result = await signalGoGeoEnrich();
    if (result?.status === 'started' || result?.status === 'already_running') {
        listenGeoEnrichSSE();
    }
    return result;
}

