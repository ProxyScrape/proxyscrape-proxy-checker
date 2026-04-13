import findMixedProxies from '../misc/FindMixedProxies.js';
import { chooseMultiTxtFiles } from '../misc/filePicker';
import { uniq } from '../misc/array';
import { trackAction } from '../misc/analytics';
import { INPUT_SET_LOADED_FILE_DATA, INPUT_CLEAR } from '../constants/ActionTypes';
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

export const setLoadedData = nextState => ({
    type: INPUT_SET_LOADED_FILE_DATA,
    nextState
});

export const clearInput = () => ({ type: INPUT_CLEAR });

const getResult = (text, event, getState) => {
    try {
        // if (event.ctrlKey) {
        //     const { input } = getState();

        //     const totalLines = text.split(/\r?\n/).filter(item => item.length > 0);
        //     const uniqueLines = uniq([...totalLines, ...input.list]);
        //     console.log(uniqueLines);
        //     const { successed: list, failed: errors } = findMixedProxies(uniqueLines);

        //     return {
        //         list,
        //         errors,
        //         total: totalLines.length + input.list.length,
        //         unique: uniqueLines.length
        //     };
        // }
       
        const totalLines = text.split(/\r?\n/).filter(item => item.length > 0);
        const uniqueLines = uniq(totalLines);
        const { successed: list, failed: errors } = findMixedProxies(uniqueLines);

        return {
            list,
            errors,
            total: totalLines.length,
            unique: uniqueLines.length,
            size: text.length
        };
    } catch (error) {
        return {
            list: [],
            errors: [],
            total: 0,
            unique: 0
        };
    }
};

export const loadFromTxt = event => async (dispatch, getState) => {
 
    try {
        const fileEntries = await chooseMultiTxtFiles();

        if (fileEntries && fileEntries.length) {
            let filesText = '';
            const names = [];

            for (const entry of fileEntries) {
                filesText += entry.text;
                names.push(entry.name);
            }

            const { list, errors, total, unique, size } = getResult(filesText, event, getState);

            if (!list.length) throw new Error('No proxies found');

            dispatch(
                setLoadedData({
                    loaded: true,
                    list,
                    errors,
                    name: names.join(', '),
                    total,
                    unique,
                    size
                })
            );

            trackAction('proxy_list_imported', { source: 'file', proxy_count: list.length, unique_count: unique, error_count: errors.length });
        }
    } catch (error) {
        alert(error);
    }
};

export const checkProxy = event => async (dispatch, getState) => {
    

    try {
        
        if (event.target.dataset.file != "") {
            let filesText = '';
            const names = [];
            let filePath = pathJoin(await getDownloadsPath(), event.target.dataset.file);

            filesText = await window.__ELECTRON__.readFile(filePath);
            names.push(pathBasename(filePath));
        

            const { list, errors, total, unique, size } = getResult(filesText, event, getState);

            if (!list.length) throw new Error('No proxies found');

            dispatch(
                setLoadedData({
                    loaded: true,
                    list,
                    errors,
                    name: names.join(', '),
                    total,
                    unique,
                    size
                })
            );
        }
    } catch (error) {
        alert(error);
    }
};

export const overrideEventDefaults = event => async (dispatch, getState) => {
    try {
        event.preventDefault();
        event.stopPropagation();
    } catch (error) {
        alert(error);
    }
};

export const onFileDrop = event => async (dispatch, getState) => {
    
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

                const { list, errors, total, unique, size } = getResult(filesText, event, getState);

                if (!list.length) throw new Error('No proxies found');

                dispatch(
                    setLoadedData({
                        loaded: true,
                        list,
                        errors,
                        name: names.join(', '),
                        total,
                        unique,
                        size
                    })
                );

                trackAction('proxy_list_imported', { source: 'drag_drop', proxy_count: list.length, unique_count: unique, error_count: errors.length });
            }
        
    } catch (error) {
        alert(error);
    }
};

export const pasteFromClipboard = event => async (dispatch, getState) => {
    try {
        const text = await navigator.clipboard.readText();
        const { list, errors, total, unique, size } = getResult(text, event, getState);

        if (!list.length) throw new Error('No proxies found');

        dispatch(
            setLoadedData({
                loaded: true,
                list,
                errors,
                name: 'Clipboard',
                total,
                unique,
                size
            })
        );

        trackAction('proxy_list_imported', { source: 'clipboard', proxy_count: list.length, unique_count: unique, error_count: errors.length });
    } catch (error) {
        alert(error);
    }
};
