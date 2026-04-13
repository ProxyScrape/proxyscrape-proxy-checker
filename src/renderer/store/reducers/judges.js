import { MERGED_DEFAULT_SETTINGS } from '../../constants/SettingsConstants';
import { JUDGES_CHANGE, JUDGES_ADD, JUDGES_REMOVE, JUDGES_TOGGLE_OPTION, SETTINGS_LOAD, JUDGES_SET_REFRESHING, JUDGES_SET_STATUSES } from '../../constants/ActionTypes';

// See PERSISTED_CORE_FIELDS in core.js for the persistence contract.
export const PERSISTED_JUDGES_FIELDS = ['swap', 'items'];

const defaultState = { ...MERGED_DEFAULT_SETTINGS.judges, refreshing: false, statuses: {} };

const judges = (state = defaultState, action) => {
    switch (action.type) {
        case SETTINGS_LOAD:
            if (action.settings && action.settings.judges) {
                return { ...state, ...action.settings.judges };
            }
            return state;
        case JUDGES_CHANGE:
            return {
                ...state,
                items: state.items.map(item => {
                    if (item.url == action.url) {
                        return {
                            ...item,
                            ...action.settings
                        };
                    }

                    return item;
                })
            };
        case JUDGES_ADD:
            if (state.items.every(item => item.url != action.url)) {
                return {
                    ...state,
                    items: [
                        ...state.items,
                        {
                            url: action.url,
                            validate: ''
                        }
                    ]
                };
            }

            return state;
        case JUDGES_REMOVE:
            return {
                ...state,
                items: state.items.filter(item => item.url != action.url)
            };
        case JUDGES_TOGGLE_OPTION:
            return {
                ...state,
                [action.target]: !state[action.target]
            };
        case JUDGES_SET_REFRESHING:
            return { ...state, refreshing: action.refreshing };
        case JUDGES_SET_STATUSES:
            return { ...state, statuses: action.statuses };
        default:
            return state;
    }
};

export default judges;
