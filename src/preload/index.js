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

    // Events pushed from the main process (callback-based, IPC event object is never exposed)
    onBeforeQuit: (cb) => ipcRenderer.on('app-before-quit', () => cb()),
    onDownloadProgress: (cb) => ipcRenderer.on('download-progress', (_e, p) => cb(p)),
    onUpdateAvailable: (cb) => ipcRenderer.on('update-available', () => cb()),
    onUpdateReady: (cb) => ipcRenderer.on('update-ready', () => cb()),
    onWindowMaximize: (cb) => ipcRenderer.on('on-window-maximize', () => cb()),
    onWindowUnmaximize: (cb) => ipcRenderer.on('on-window-unmaximize', () => cb()),

    // Triggered by the renderer's "Restart now" button after update-ready fires.
    installUpdate: () => ipcRenderer.send('install-update'),
});
