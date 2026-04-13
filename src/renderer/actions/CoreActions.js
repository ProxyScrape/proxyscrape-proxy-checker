import { CORE_CHANGE_OPTION, CORE_TOGGLE_OPTION, CORE_TOGGLE_PROTOCOL, CORE_SET_PROTOCOL_WARNING, CORE_SET_TRACE_STATUS } from '../constants/ActionTypes';
import { getMaxThreads } from '../misc/other';
import { apiFetch } from '../api/client';

export const changeOption = e => ({
    type: CORE_CHANGE_OPTION,
    target: e.target.name,
    value: e.target.value
});

export const toggleOption = e => ({
    type: CORE_TOGGLE_OPTION,
    target: e.target.name
});

export const setProtocolWarning = warning => ({
    type: CORE_SET_PROTOCOL_WARNING,
    warning,
});

// Toggles captureTrace and, when enabling, fetches /api/trace/status so the
// UI can immediately warn the user if pcap permissions are missing.
export const toggleCaptureTrace = () => (dispatch, getState) => {
    dispatch({ type: CORE_TOGGLE_OPTION, target: 'captureTrace' });

    const nowEnabled = getState().core.captureTrace; // state after toggle
    if (!nowEnabled) {
        dispatch({ type: CORE_SET_TRACE_STATUS, status: null });
        return;
    }

    apiFetch('/api/trace/status')
        .then(status => dispatch({ type: CORE_SET_TRACE_STATUS, status }))
        .catch(() => dispatch({ type: CORE_SET_TRACE_STATUS, status: { available: false, reason: 'unavailable' } }));
};

// Re-checks pcap availability without toggling the option. Used by the "Re-check"
// button in the warning banner after the user installs Wireshark/Npcap/setcap.
export const recheckTraceStatus = () => dispatch => {
    dispatch({ type: CORE_SET_TRACE_STATUS, status: null }); // clear while loading
    apiFetch('/api/trace/status')
        .then(status => dispatch({ type: CORE_SET_TRACE_STATUS, status }))
        .catch(() => dispatch({ type: CORE_SET_TRACE_STATUS, status: { available: false, reason: 'unavailable' } }));
};

export const toggleProtocol = e => (dispatch, getState) => {
    dispatch({
        type: CORE_TOGGLE_PROTOCOL,
        protocol: e.target.name
    });

    const { core } = getState();
    const maxThreads = getMaxThreads(core.protocols);

    if (core.threads > maxThreads) {
        dispatch(
            changeOption({
                target: {
                    name: 'threads',
                    value: maxThreads
                }
            })
        );
    }
};
