import { apiFetch } from '../api/client';
import { SETTINGS_LOAD } from '../constants/ActionTypes';
import { PERSISTED_CORE_FIELDS } from '../store/reducers/core';
import { PERSISTED_JUDGES_FIELDS } from '../store/reducers/judges';
import { PERSISTED_BLACKLIST_FIELDS } from '../store/reducers/blacklist';
import { PERSISTED_IP_FIELDS } from '../store/reducers/ip';
import { PERSISTED_EXPORTING_FIELDS } from '../store/reducers/result';

const pickFields = (obj, fields) => Object.fromEntries(fields.map(f => [f, obj[f]]));

export const loadSettings = () => async (dispatch) => {
    try {
        const settings = await apiFetch('/api/settings');
        if (settings && typeof settings === 'object') {
            dispatch({ type: SETTINGS_LOAD, settings });
        }
    } catch (err) {
        console.error('Failed to load settings from API:', err);
    }
};

// Reads current Redux state and persists it to the Go backend.
//
// The payload is built automatically from each slice's PERSISTED_*_FIELDS list.
// To persist a new setting:
//   1. Add the field name to the relevant PERSISTED_*_FIELDS array in the reducer.
//   2. Add the matching JSON-tagged field to the corresponding Go struct in
//      backend/internal/settings/settings.go — Go's JSON decoder silently drops
//      unknown keys, so skipping this step will cause the value to save but never load.
export const saveSettings = () => async (dispatch, getState) => {
    const { core, judges, blacklist, ip, result } = getState();
    const settings = {
        core:      pickFields(core,           PERSISTED_CORE_FIELDS),
        judges:    pickFields(judges,          PERSISTED_JUDGES_FIELDS),
        blacklist: pickFields(blacklist,       PERSISTED_BLACKLIST_FIELDS),
        ip:        pickFields(ip,              PERSISTED_IP_FIELDS),
        exporting: pickFields(result.exporting, PERSISTED_EXPORTING_FIELDS),
    };
    try {
        await apiFetch('/api/settings', {
            method: 'PUT',
            body: JSON.stringify(settings),
        });
    } catch (err) {
        console.error('Failed to save settings:', err);
    }
};
