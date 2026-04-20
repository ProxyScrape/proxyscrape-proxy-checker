import { chooseMultiTxtFiles } from '../misc/filePicker';
import { INPUT_SET_LOADED_FILE_DATA, INPUT_CLEAR } from '../constants/ActionTypes';

const setLoadedData = nextState => ({
    type: INPUT_SET_LOADED_FILE_DATA,
    nextState,
});

export const clearInput = () => ({ type: INPUT_CLEAR });

/**
 * Applies a fully-parsed result payload directly to the input state.
 * Called by InputV2 after the parse Web Worker returns results, keeping
 * the expensive findMixedProxies work off the main thread.
 */
export const applyParsedResult = payload => setLoadedData(payload);

/**
 * Opens the file picker and populates the CodeMirror editor in InputV2
 * via the proxy-checker:load-lines CustomEvent. The editor's own listener
 * handles inserting the text and triggering the parse worker.
 */
export const loadFromTxt = async () => {
    try {
        const fileEntries = await chooseMultiTxtFiles();
        if (!fileEntries?.length) return;

        let filesText = '';
        const names = [];
        for (const entry of fileEntries) {
            filesText += entry.text;
            names.push(entry.name);
        }

        const lines = filesText.split(/\r?\n/).filter(Boolean);
        window.dispatchEvent(new CustomEvent('proxy-checker:load-lines', {
            detail: {
                lines,
                meta: { name: names.join(', '), sourceType: 'file' },
            },
        }));
    } catch {
        // file picker cancelled or inaccessible — fail silently
    }
};
