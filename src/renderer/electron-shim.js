/**
 * Renderer-side shim for `import { ipcRenderer } from 'electron'`.
 *
 * The renderer runs in a contextIsolation: true context — it cannot reach
 * Node.js or Electron directly. All IPC goes through window.__ELECTRON__,
 * which is exposed by the preload script via contextBridge.
 *
 * In web mode (no Electron) window.__ELECTRON__ is undefined; every method
 * becomes a no-op so the app renders without crashing.
 */

const E = typeof window !== 'undefined' ? window.__ELECTRON__ : undefined;

const warn = (method, channel) =>
    console.warn(`electron-shim: ipcRenderer.${method}("${channel}") has no handler`);

export const shell = {
    openExternal(url) {
        if (E) return E.openExternal(url);
        // Web mode fallback — open in a new tab
        window.open(url, '_blank', 'noopener,noreferrer');
    },
};

// True when the packaged app was launched with --enable-updater.
export const enableUpdater = E ? (E.enableUpdater ?? false) : false;

export const ipcRenderer = {
    invoke(channel, ...args) {
        if (!E) return Promise.resolve(undefined);
        switch (channel) {
            case 'choose-path':  return E.choosePath(args[0]);
            case 'choose-multi': return E.chooseMulti();
            default:
                warn('invoke', channel);
                return Promise.resolve(undefined);
        }
    },

    send(channel) {
        if (!E) return;
        switch (channel) {
            case 'window-minimize':    return E.windowMinimize();
            case 'window-maximize':    return E.windowMaximize();
            case 'window-unmaximize':  return E.windowUnmaximize();
            case 'window-close':       return E.windowClose();
            case 'install-update':     return E.installUpdate();
            default:
                warn('send', channel);
        }
    },

    sendSync(channel) {
        // sendSync is discouraged (blocks renderer). No channels use it anymore.
        warn('sendSync', channel);
        return undefined;
    },

    on(channel, callback) {
        if (!E) return;
        switch (channel) {
            case 'app-before-quit':        return E.onBeforeQuit(callback);
            case 'download-progress':      return E.onDownloadProgress(callback);
            case 'update-available':       return E.onUpdateAvailable(callback);
            case 'update-ready':           return E.onUpdateReady(callback);
            case 'on-window-maximize':     return E.onWindowMaximize(callback);
            case 'on-window-unmaximize':   return E.onWindowUnmaximize(callback);
            default:
                warn('on', channel);
        }
    },
};
