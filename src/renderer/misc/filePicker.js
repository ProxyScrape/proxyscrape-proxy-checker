/**
 * File picker abstraction: native dialogs in Electron; hidden file inputs and downloads in the browser.
 *
 * Desktop (preferred): {@link window.__ELECTRON__.choosePath} when exposed by preload, otherwise IPC to main.
 * When neither applies but the app still runs in Electron, falls back to `ipcRenderer` (legacy preload).
 */

import { ipcRenderer } from 'electron';
/** Extract the filename from a native path without importing Node's `path` module. */
const pathBasename = (p) => (p ? p.replace(/^.*[\\/]/, '') : '');

/** True when the preload exposed the Electron bridge (future Track C). */
export const hasElectronBridge =
  typeof window !== 'undefined' && typeof window.__ELECTRON__ !== 'undefined';

/**
 * True when we should use Electron main-process dialogs and Node fs (not pure web).
 * Uses Electron-specific signals so an app without `__ELECTRON__` (placeholder preload) still works.
 */
export function isElectronFileEnvironment() {
  if (typeof window === 'undefined') {
    return false;
  }
  if (hasElectronBridge) {
    return true;
  }
  if (typeof window.process !== 'undefined' && window.process.type === 'renderer') {
    return true;
  }
  if (typeof navigator !== 'undefined' && /electron/i.test(navigator.userAgent)) {
    return true;
  }
  return false;
}

/**
 * @param {'open'|'save'} action
 * @returns {Promise<string|undefined|null>}
 */
async function invokeDesktopChoosePath(action) {
  if (hasElectronBridge && typeof window.__ELECTRON__.choosePath === 'function') {
    return window.__ELECTRON__.choosePath(action);
  }
  return ipcRenderer.invoke('choose-path', action);
}

/**
 * @returns {Promise<string[]|undefined|null>}
 */
async function invokeDesktopChooseMulti() {
  if (hasElectronBridge && typeof window.__ELECTRON__.chooseMulti === 'function') {
    return window.__ELECTRON__.chooseMulti();
  }
  return ipcRenderer.invoke('choose-multi');
}

/**
 * Web: single file open via hidden input; returns the file name (not a real path).
 * @param {string} accept
 * @returns {Promise<string|null>}
 */
function pickFilePathWeb(accept) {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    document.body.appendChild(input);

    const done = value => {
      if (input.parentNode) {
        document.body.removeChild(input);
      }
      resolve(value);
    };

    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      if (!file) {
        done(null);
        return;
      }
      done(file.name);
    });

    input.addEventListener('cancel', () => done(null));

    input.click();
  });
}

/**
 * Native or web file dialog for a single path (open or save).
 * - Electron open: absolute path from the dialog.
 * - Electron save: absolute path for writing (caller uses fs).
 * - Web open: file base name only (no full path in browsers).
 * - Web save: returns `null` — use {@link saveTextFile} instead.
 *
 * @param {'open'|'save'} action
 * @returns {Promise<string|null|undefined>}
 */
export async function choosePath(action) {
  if (isElectronFileEnvironment()) {
    try {
      return await invokeDesktopChoosePath(action);
    } catch (e) {
      console.error('choosePath failed:', e);
      return null;
    }
  }

  if (action === 'open') {
    return pickFilePathWeb('.txt,text/plain');
  }

  return null;
}

/**
 * Multi-file .txt picker: returns file contents and display names.
 * Desktop: `choose-multi` IPC then reads each path with fs.
 * Web: multi file input + File.text().
 *
 * @returns {Promise<Array<{ name: string, text: string }>|null>}
 */
export async function chooseMultiTxtFiles() {
  if (isElectronFileEnvironment()) {
    try {
      // Main process handles the dialog AND reads file contents, returning
      // [{ name, text }] so the renderer never needs to touch fs directly.
      const files = await invokeDesktopChooseMulti();
      if (!files || !files.length) return null;
      return files;
    } catch (e) {
      console.error('chooseMultiTxtFiles failed:', e);
      return null;
    }
  }

  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt,text/plain';
    input.multiple = true;
    input.style.display = 'none';
    document.body.appendChild(input);

    const finish = async () => {
      const files = input.files;
      document.body.removeChild(input);
      if (!files || !files.length) {
        resolve(null);
        return;
      }
      const out = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const text = await file.text();
        out.push({ name: file.name, text });
      }
      resolve(out);
    };

    input.addEventListener('change', () => finish());
    input.addEventListener('cancel', () => {
      if (input.parentNode) {
        document.body.removeChild(input);
      }
      resolve(null);
    });
    input.click();
  });
}

/**
 * Triggers a browser download (used for export when not in Electron).
 * @param {string} filename
 * @param {string} content
 */
function downloadInBrowser(filename, content) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Saves text: Electron save dialog + fs.writeFile; pure web uses a file download.
 *
 * @param {string} content File contents
 * @param {string} [defaultFilename='proxies.txt']
 * @returns {Promise<boolean>} True if the file was written or downloaded; false if the dialog was cancelled
 */
export async function saveTextFile(content, defaultFilename = 'proxies.txt') {
  if (!isElectronFileEnvironment()) {
    downloadInBrowser(defaultFilename, content);
    return true;
  }

  const filePath = await invokeDesktopChoosePath('save');
  if (!filePath) {
    return false;
  }

  return window.__ELECTRON__.writeFile(filePath, content);
}
