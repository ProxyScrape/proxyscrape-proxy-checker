import path from 'path';
import fs from 'fs';
import readline from 'readline';
import { spawn, execSync } from 'child_process';
import { BrowserWindow, app, ipcMain, dialog, session } from 'electron';
import { autoUpdater } from 'electron-updater';
import { isDev, isPortable } from '../shared/AppConstants';

const iconPath = path.join(__dirname, '../../public/icons/icon.png');

let window;
let goProcess = null;
let checkerPort = null;
let checkerToken = null;
let isQuitting = false;

const isMac = process.platform === 'darwin';

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

function getCheckerBinaryName() {
    const platform = process.platform;
    const arch = process.arch;
    return platform === 'win32'
        ? 'checker-win-x64.exe'
        : `checker-${platform === 'darwin' ? 'darwin' : 'linux'}-${arch === 'arm64' ? 'arm64' : 'x64'}`;
}

function getCheckerBinaryPath() {
    const binaryName = getCheckerBinaryName();
    if (app.isPackaged) {
        return path.join(process.resourcesPath, 'bin', binaryName);
    }
    return path.join(__dirname, '../../bin', binaryName);
}

function startGoBackend() {
    return new Promise((resolve, reject) => {
        const dataDir = app.getPath('userData');

        let cmd, args, opts;
        if (isDev) {
            // In dev, compile and run from source — no pre-build step required.
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

        // go run compiles before starting, so allow extra time in dev
        const startupTimeoutMs = isDev ? 90000 : 30000;
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
        token: checkerToken || ''
    };
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

let downloadsWatcher = null;
ipcMain.on('watch-downloads', (event) => {
    if (downloadsWatcher) return; // already watching
    const folder = app.getPath('downloads');
    downloadsWatcher = fs.watch(folder, { persistent: false }, (type, fileName) => {
        if (type === 'change' && fileName && fileName.endsWith('.txt')) {
            event.sender.send('downloads-changed', fileName);
        }
    });
    downloadsWatcher.on('error', () => {
        downloadsWatcher = null;
    });
});

ipcMain.on('unwatch-downloads', () => {
    if (downloadsWatcher) {
        downloadsWatcher.close();
        downloadsWatcher = null;
    }
});


const preloadPath = path.join(__dirname, '../preload/index.js');

const windowOptions = {
    width: 1220,
    height: 905,
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

// Enforce a single running instance. A second launch focuses the existing window
// instead of opening a duplicate. This also prevents the Chromium service-worker
// storage error caused by two processes sharing the same user-data directory.
if (!app.requestSingleInstanceLock()) {
    app.quit();
}

app.on('second-instance', () => {
    if (window) {
        if (window.isMinimized()) window.restore();
        window.focus();
    }
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
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https:",
        // Local Go backend (any port) + analytics/chat services
        "connect-src 'self' http://127.0.0.1:* https://app.posthog.com https://eu.posthog.com https://widget.intercom.io https://api-iam.intercom.io https://api.intercom.io wss://nexus-websocket-a.intercom.io wss://nexus-websocket-b.intercom.io https://github.com https://api.proxyscrape.com",
        "font-src 'self' data:",
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

    try {
        await startGoBackend();
    } catch {
        app.quit();
        return;
    }

    createWindow();
    if (!isDev && !isPortable) {
        autoUpdater.checkForUpdates();
    }
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

autoUpdater.on('update-downloaded', () => {
    autoUpdater.quitAndInstall(true, true);
});

autoUpdater.on('download-progress', (progressObj) => {
    if (window && !window.isDestroyed()) {
        window.webContents.send('download-progress', Math.floor(progressObj.percent));
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
