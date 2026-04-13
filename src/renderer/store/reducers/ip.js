import { MERGED_DEFAULT_SETTINGS } from '../../constants/SettingsConstants';
import { IP_CHANGE_OPTION, IP_SET, SETTINGS_LOAD } from '../../constants/ActionTypes';

// See PERSISTED_CORE_FIELDS in core.js for the persistence contract.
export const PERSISTED_IP_FIELDS = ['current', 'lookupUrl'];

const ip = (state = MERGED_DEFAULT_SETTINGS.ip, action) => {
    switch (action.type) {
        case SETTINGS_LOAD:
            if (action.settings && action.settings.ip) {
                return { ...state, ...action.settings.ip };
            }
            return state;
        case IP_CHANGE_OPTION:
            return {
                ...state,
                [action.target]: action.value
            };
        case IP_SET:
            return {
                ...state,
                current: action.ip
            };
        default:
            return state;
    }
};

export default ip;
