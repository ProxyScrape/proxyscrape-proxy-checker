import findMixedProxies, { extractScheme } from '../misc/FindMixedProxies.js';
import { chooseMultiTxtFiles } from '../misc/filePicker';
import { uniq } from '../misc/array';
import { trackAction } from '../misc/analytics';
import { INPUT_SET_LOADED_FILE_DATA, INPUT_CLEAR } from '../constants/ActionTypes';
import { showError } from '../store/reducers/app';

const getDownloadsPath = () => window.__ELECTRON__?.getDownloadsPath() ?? Promise.resolve('');

/** Extract the filename from a native path without importing Node's `path` module. */
const pathBasename = (p) => (p ? p.replace(/^.*[\\/]/, '') : '');

/** Join two path segments without importing Node's `path` module. */
const pathJoin = (a, b) => {
    const sep = a && a.includes('\\') ? '\\' : '/';
    return (a || '').replace(/[/\\]$/, '') + sep + b;
};

// webUtils.getPathForFile must be called from the preload (Electron 32+ removed
// File.path from the renderer). The preload exposes it via contextBridge.
const getFilePath = (file) => window.__ELECTRON__?.getPathForFile(file) ?? '';

// Internal — kept private so all callers go through importProxiesFromLines.
const setLoadedData = nextState => ({
    type: INPUT_SET_LOADED_FILE_DATA,
    nextState
});

export const clearInput = () => ({ type: INPUT_CLEAR });

/**
 * The single canonical pipeline for importing proxies into the checker.
 *
 * All import paths (file, drag-drop, clipboard, extension deep-link) must go
 * through this function so deduplication and counting are always consistent.
 *
 * @param {string[]} rawLines - Raw proxy strings, possibly with duplicates.
 * @param {object}   meta     - Extra fields merged into the payload
 *                              (e.g. name, sourceType, size).
 * @returns {object|null} The dispatched payload, or null when no valid
 *                        proxies were found (caller can throw/show an error).
 */
export const importProxiesFromLines = (rawLines, meta = {}) => dispatch => {
    const uniqueLines = uniq(rawLines);
    const { successed: list, failed: errors } = findMixedProxies(uniqueLines);
    if (!list.length) return null;

    const hasProtocols = rawLines.length > 0 && extractScheme(rawLines[0]) !== '';
    const payload = {
        loaded: true,
        list,
        errors,
        total: rawLines.length,
        unique: uniqueLines.length,
        size: rawLines.join('\n').length,
        hasProtocols,
        ...meta, // meta.size overrides (e.g. file imports pass the raw file byte count)
    };

    dispatch(setLoadedData(payload));
    return payload;
};

export const loadFromTxt = event => async dispatch => {
    try {
        const fileEntries = await chooseMultiTxtFiles();

        if (fileEntries && fileEntries.length) {
            let filesText = '';
            const names = [];

            for (const entry of fileEntries) {
                filesText += entry.text;
                names.push(entry.name);
            }

            const rawLines = filesText.split(/\r?\n/).filter(s => s.length > 0);
            const payload = dispatch(importProxiesFromLines(rawLines, {
                name: names.join(', '),
                sourceType: 'file',
                size: filesText.length,
            }));

            if (!payload) throw new Error('No proxies found');

            trackAction('proxy_list_imported', { source: 'file', proxy_count: payload.list.length, unique_count: payload.unique, error_count: payload.errors.length });
        }
    } catch (error) {
        dispatch(showError(error.message));
    }
};

export const checkProxy = event => async dispatch => {
    try {
        if (event.target.dataset.file != "") {
            const filePath = pathJoin(await getDownloadsPath(), event.target.dataset.file);
            const filesText = await window.__ELECTRON__.readFile(filePath);
            const rawLines = filesText.split(/\r?\n/).filter(s => s.length > 0);
            const payload = dispatch(importProxiesFromLines(rawLines, {
                name: pathBasename(filePath),
                sourceType: 'file',
                size: filesText.length,
            }));

            if (!payload) throw new Error('No proxies found');
        }
    } catch (error) {
        dispatch(showError(error.message));
    }
};

export const overrideEventDefaults = event => async dispatch => {
    try {
        event.preventDefault();
        event.stopPropagation();
    } catch (error) {
        dispatch(showError(error.message));
    }
};

export const onFileDrop = event => async dispatch => {
    try {
        event.preventDefault();
        event.stopPropagation();

        if (event.dataTransfer.files.length) {
            let filesText = '';
            const names = [];

            for await (const file of event.dataTransfer.files) {
                const filePath = getFilePath(file);
                filesText += await window.__ELECTRON__.readFile(filePath);
                names.push(pathBasename(filePath));
            }

            const rawLines = filesText.split(/\r?\n/).filter(s => s.length > 0);
            const payload = dispatch(importProxiesFromLines(rawLines, {
                name: names.join(', '),
                sourceType: 'drag_drop',
                size: filesText.length,
            }));

            if (!payload) throw new Error('No proxies found');

            trackAction('proxy_list_imported', { source: 'drag_drop', proxy_count: payload.list.length, unique_count: payload.unique, error_count: payload.errors.length });
        }
    } catch (error) {
        dispatch(showError(error.message));
    }
};

export const pasteFromClipboard = event => async dispatch => {
    try {
        const text = await window.__ELECTRON__.readClipboard();
        const rawLines = text.split(/\r?\n/).filter(s => s.length > 0);
        const payload = dispatch(importProxiesFromLines(rawLines, {
            name: 'Clipboard',
            sourceType: 'clipboard',
            size: text.length,
        }));

        if (!payload) throw new Error('No proxies found in clipboard');

        trackAction('proxy_list_imported', { source: 'clipboard', proxy_count: payload.list.length, unique_count: payload.unique, error_count: payload.errors.length });
    } catch (error) {
        dispatch(showError(error.message));
    }
};
