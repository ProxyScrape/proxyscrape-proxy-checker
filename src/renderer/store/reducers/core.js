import { MERGED_DEFAULT_SETTINGS } from '../../constants/SettingsConstants';
import { CORE_CHANGE_OPTION, CORE_TOGGLE_OPTION, CORE_TOGGLE_PROTOCOL, CORE_SET_PROTOCOL_WARNING, CORE_SET_TRACE_STATUS, SETTINGS_LOAD } from '../../constants/ActionTypes';

// Fields in this slice that are saved to settings.json via the Go backend.
//
// ⚠️  PERSISTENCE CONTRACT: when adding a field here, you MUST also add the matching
// JSON-tagged field to CoreSettings in backend/internal/settings/settings.go,
// otherwise the value will be saved by the frontend but silently dropped on load.
export const PERSISTED_CORE_FIELDS = [
    'timeout', 'threads', 'retries', 'shuffle', 'keepAlive',
    'captureServer', 'captureFullData', 'captureTrace', 'overrideProtocols',
    'localDns', 'protocols',
];

const INITIAL_PROTOCOL_WARNING = MERGED_DEFAULT_SETTINGS.core.protocolWarning;

const core = (state = MERGED_DEFAULT_SETTINGS.core, action) => {
    switch (action.type) {
        case SETTINGS_LOAD:
            if (action.settings && action.settings.core) {
                return {
                    ...state,
                    ...action.settings.core,
                    protocolWarning: INITIAL_PROTOCOL_WARNING,
                };
            }
            return state;
        case CORE_CHANGE_OPTION:
            return {
                ...state,
                [action.target]: action.value
            };
        case CORE_TOGGLE_OPTION:
            return {
                ...state,
                [action.target]: !state[action.target]
            };
        case CORE_TOGGLE_PROTOCOL:
            return {
                ...state,
                protocols: {
                    ...state.protocols,
                    [action.protocol]: !state.protocols[action.protocol]
                }
            };
        case CORE_SET_PROTOCOL_WARNING:
            return {
                ...state,
                protocolWarning: { ...state.protocolWarning, ...action.warning }
            };
        case CORE_SET_TRACE_STATUS:
            return {
                ...state,
                traceStatus: action.status
            };
        default:
            return state;
    }
};

export default core;
