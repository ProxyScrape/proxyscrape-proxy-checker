import { contextBridge, ipcRenderer, shell, webUtils } from 'electron';

const config = ipcRenderer.sendSync('get-api-config') || {};

contextBridge.exposeInMainWorld('__ELECTRON__', {
    // Go backend connection
    apiBase: config.apiBase ?? '',
    token: config.token ?? '',

    // Platform — the renderer can't reliably access process.platform under
    // contextIsolation, so we pass it explicitly from the preload.
    platform: process.platform,

    // File dialogs — chooseMulti returns [{ name, text }] (main process reads contents)
    choosePath: (action) => ipcRenderer.invoke('choose-path', action),
    chooseMulti: () => ipcRenderer.invoke('choose-multi'),
    // Read/write files — renderer never touches fs directly
    readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
    writeFile: (filePath, content) => ipcRenderer.invoke('write-file', filePath, content),

    // Drag-and-drop file path resolution. File.path was removed in Electron 32;
    // webUtils.getPathForFile() is the official replacement and must be called
    // from the preload (not the renderer) when contextIsolation is enabled.
    getPathForFile: (file) => webUtils.getPathForFile(file),

    // Window controls
    windowMinimize: () => ipcRenderer.send('window-minimize'),
    windowMaximize: () => ipcRenderer.send('window-maximize'),
    windowUnmaximize: () => ipcRenderer.send('window-unmaximize'),
    windowClose: () => ipcRenderer.send('window-close'),

    // Shell
    openExternal: (url) => shell.openExternal(url),

    // Paths — async invoke, never sendSync (sendSync blocks the renderer process)
    getDownloadsPath: () => ipcRenderer.invoke('getDownloadsPath'),

    // Whether the packaged app was launched with --enable-updater (canary testing).
    enableUpdater: config.enableUpdater ?? false,

    // Events pushed from the main process (callback-based, IPC event object is never exposed).
    // The Electron IPC event object cannot cross the contextBridge, so it is never forwarded.
    // For channels that carry data, pass null as the first argument so component callbacks
    // can use the natural Electron IPC signature (_e, data) without breaking:
    //   CORRECT:   (cb) => ipcRenderer.on('ch', (_e, val) => cb(null, val))
    //   WRONG:     (cb) => ipcRenderer.on('ch', (_e, val) => cb(val))   ← val lands in _e
    onBeforeQuit: (cb) => ipcRenderer.on('app-before-quit', () => cb()),
    onDownloadProgress: (cb) => ipcRenderer.on('download-progress', (_e, p) => cb(null, p)),
    onUpdateAvailable: (cb) => ipcRenderer.on('update-available', () => cb()),
    onUpdateReady: (cb) => ipcRenderer.on('update-ready', () => cb()),
    onWindowMaximize: (cb) => ipcRenderer.on('on-window-maximize', () => cb()),
    onWindowUnmaximize: (cb) => ipcRenderer.on('on-window-unmaximize', () => cb()),

    // Triggered by the renderer's "Restart now" button after update-ready fires.
    installUpdate: () => ipcRenderer.send('install-update'),

    // GeoIP database — ensure the MMDB is downloaded before a proxy check.
    // Resolves with { status: 'ready' | 'cancelled' }.
    ensureMMDB: () => ipcRenderer.invoke('mmdb:ensure'),

    // Abort an in-progress MMDB download.
    cancelMMDB: () => ipcRenderer.invoke('mmdb:cancel'),

    // Check whether the local MMDB file exists (does NOT download).
    // Resolves with { available: boolean }.
    mmdbAvailable: () => ipcRenderer.invoke('mmdb:available'),

    // Subscribe to MMDB download/decompress progress events.
    // Events: { phase: 'download'|'decompress', pct: 0-100|-1, totalBytes?: number }
    //   pct = -1 means indeterminate (decompression running).
    // Returns a cleanup function.
    onMMDBProgress: (cb) => {
        const handler = (_e, data) => cb(null, data);
        ipcRenderer.on('mmdb-progress', handler);
        return () => ipcRenderer.removeListener('mmdb-progress', handler);
    },

    // Background geo enrichment — trigger / cancel enrichment of pending rows.
    geoEnrichStart: () => ipcRenderer.invoke('geo:enrich:start'),
    geoEnrichCancel: () => ipcRenderer.invoke('geo:enrich:cancel'),

    // Subscribe to geo enrichment progress events pushed from the main process.
    // Events: { running: bool, total: number, done: number }
    // Returns a cleanup function.
    onGeoEnrichProgress: (cb) => {
        const handler = (_e, data) => cb(null, data);
        ipcRenderer.on('geo-enrich-progress', handler);
        return () => ipcRenderer.removeListener('geo-enrich-progress', handler);
    },

    // Clipboard — clipboard.readText() must be called from the main process.
    // Accessing it from the renderer/preload context is deprecated in Electron
    // and will be removed. The main process handles 'clipboard:read' and returns
    // the text over IPC, so this returns a Promise<string>.
    readClipboard: () => ipcRenderer.invoke('clipboard:read'),

    // Deep-link from the browser extension via the proxychecker:// protocol.
    // The raw URL string is forwarded; the renderer parses it.
    // Returns a cleanup function.
    onDeepLinkProxy: (cb) => {
        const handler = (_e, url) => cb(null, url);
        ipcRenderer.on('deep-link-proxy', handler);
        return () => ipcRenderer.removeListener('deep-link-proxy', handler);
    },
});
