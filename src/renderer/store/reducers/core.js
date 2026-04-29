import { CORE_CHANGE_OPTION, CORE_TOGGLE_OPTION, CORE_TOGGLE_PROTOCOL, CORE_SET_PROTOCOL_WARNING, CORE_SET_TRACE_STATUS, SETTINGS_LOAD } from '../../constants/ActionTypes';

// Fields in this slice that are saved to settings.json via the Go backend.
//
// ⚠️  PERSISTENCE CONTRACT: when adding a field here, you MUST also add the matching
// JSON-tagged field to CoreSettings in backend/internal/settings/settings.go,
// otherwise the value will be saved by the frontend but silently dropped on load.
export const PERSISTED_CORE_FIELDS = [
    'timeout', 'threads', 'retries', 'shuffle', 'keepAlive',
    'captureServer', 'captureFullData', 'captureTrace', 'overrideProtocols',
    'localDns', 'protocols', 'rotatingEnabled', 'rotatingCount',
];

// protocolWarning is ephemeral UI state — never persisted, always reset on load.
const PROTOCOL_WARNING_INITIAL = {
    open: false,
    listProtocols: [],
    selectedProtocols: [],
};

// ⚠️  NULL-INIT RISK: core starts as null and stays null if SETTINGS_LOAD fires
// without a valid action.settings.core (e.g. malformed API response). Several
// mapStateToProps calls across ProtocolWarningDialog, Protocols, Result, and
// getFilteredProxies access state.core.* without optional chaining and would
// throw at render time if core is null. This is safe today only because the
// ready gate in index.jsx guarantees SETTINGS_LOAD (with a fully populated core
// from the backend) fires before <Main /> ever mounts. Consider restoring
// MERGED_DEFAULT_SETTINGS.core as the fallback to make this resilient.
const core = (state = null, action) => {
    switch (action.type) {
        case SETTINGS_LOAD:
            if (action.settings && action.settings.core) {
                return {
                    ...action.settings.core,
                    protocolWarning: PROTOCOL_WARNING_INITIAL,
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
