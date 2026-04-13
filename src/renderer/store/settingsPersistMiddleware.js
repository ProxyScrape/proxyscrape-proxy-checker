import { saveSettings } from '../actions/SettingsActions';

// Action types that represent a user-initiated settings change.
// Any of these trigger a debounced persist to the Go backend.
const SETTINGS_ACTIONS = new Set([
    'CORE_CHANGE_OPTION',
    'CORE_TOGGLE_OPTION',
    'CORE_TOGGLE_PROTOCOL',
    'JUDGES_CHANGE',
    'JUDGES_ADD',
    'JUDGES_REMOVE',
    'JUDGES_TOGGLE_OPTION',
    'BLACKLIST_CHANGE_ITEM_PATH',
    'BLACKLIST_ADD_ITEM',
    'BLACKLIST_REMOVE_ITEM',
    'BLACKLIST_TOGGLE_OPTION',
    'BLACKLIST_SET_ACTIVE_ITEM',
    'IP_CHANGE_OPTION',
    'RESULT_EXPORT_CHANGE_TYPE',
    'RESULT_EXPORT_CHANGE_AUTH_TYPE',
]);

let debounceTimer = null;

const settingsPersistMiddleware = store => next => action => {
    const result = next(action);

    if (SETTINGS_ACTIONS.has(action.type)) {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            store.dispatch(saveSettings());
        }, 300);
    }

    return result;
};

export default settingsPersistMiddleware;
