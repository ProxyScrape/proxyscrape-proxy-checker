import store from '../store';
import { readFileSync, existsSync } from 'fs';
import { SETTINGS_FILE_PATH, MERGED_DEFAULT_SETTINGS } from '../constants/SettingsConstants';
import { currentVersion } from './updater';
import { rename, writeFile } from 'fs/promises';

let timeout;
let prevSettings = '';

/**
 * Debounced settings persistence. Reads current Redux state, serialises
 * relevant slices to JSON, and writes to the settings file using an
 * atomic rename (write to `.proxyscrape` temp file, then rename).
 * Skips the write if the serialised output hasn't changed since last save.
 */
export const saveSettings = () => {
    if (timeout) clearTimeout(timeout);

    timeout = setTimeout(async () => {
        const { core, judges, ip, blacklist, result, main } = store.getState();
        const json = JSON.stringify(
            {
                core,
                judges: {
                    ...judges,
                    items: judges.items.map(judge => ({
                        ...judge,
                        validate: judge.validate.toString()
                    }))
                },
                ip: {
                    lookupUrl: ip.lookupUrl
                },
                blacklist,
                exporting: {
                    type: result.exporting.type,
                    authType: result.exporting.authType
                },
                main: {},
                version: currentVersion
            },
            null,
            4
        );

        if (prevSettings !== json) {
            await writeFile(SETTINGS_FILE_PATH + '.proxyscrape', json);
            await rename(SETTINGS_FILE_PATH + '.proxyscrape', SETTINGS_FILE_PATH);
            prevSettings = json;
        }
    }, 1000);
};

/**
 * Loads persisted settings from disk. Falls back to {@link MERGED_DEFAULT_SETTINGS}
 * if the file doesn't exist or can't be parsed. Applies any pending version
 * migrations via {@link transformPrevSettings}.
 * @returns {Object} Merged settings object ready for Redux initialisation
 */
const getSettings = () => {
    if (existsSync(SETTINGS_FILE_PATH)) {
        try {
            return {
                ...MERGED_DEFAULT_SETTINGS,
                ...transformPrevSettings(JSON.parse(readFileSync(SETTINGS_FILE_PATH, 'utf8')))
            };
        } catch {
            return MERGED_DEFAULT_SETTINGS;
        }
    }

    return MERGED_DEFAULT_SETTINGS;
};

/**
 * Removes a property from an object and adds a new one in a single step.
 * Used by settings migrations to rename keys.
 * @param {Object} object
 * @param {string} removeName - Property key to delete
 * @param {{ name: string, value: * }} replacement - New key/value pair
 * @returns {Object}
 */
const removeOldPropertyAndAddNew = (object, removeName, { name, value }) => {
    delete object[removeName];

    return { ...object, [name]: value };
};

/**
 * Applies sequential version migrations to settings loaded from a previous version.
 * Each transform has a target version and an action function. Transforms whose
 * version is greater than the saved version are applied in order.
 * @param {Object} settings - Parsed settings from disk (includes `version` field)
 * @returns {Object} Migrated settings
 */
const transformPrevSettings = settings => {
    const transforms = [
        {
            version: '1.5.3',
            action: input => {
                return {
                    ...input,
                    core: removeOldPropertyAndAddNew(input.core, 'retry', { name: 'retries', value: 0 })
                };
            }
        }
    ];

    if (settings.version === undefined) return MERGED_DEFAULT_SETTINGS;

    if (settings.version < currentVersion) {
        return transforms.filter(({ version }) => version > settings.version).reduce((prev, { action }) => action(prev), settings);
    } else {
        prevSettings = JSON.stringify(settings, null, 4);
        return settings;
    }
};

export const initial = getSettings();
