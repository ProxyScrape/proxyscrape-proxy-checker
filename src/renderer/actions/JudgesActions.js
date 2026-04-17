import { JUDGES_CHANGE, JUDGES_ADD, JUDGES_REMOVE, JUDGES_TOGGLE_OPTION, JUDGES_SET_REFRESHING, JUDGES_SET_STATUSES } from '../constants/ActionTypes';
import { apiFetch } from '../api/client';

export const change = (url, settings) => ({
    type: JUDGES_CHANGE,
    url,
    settings
});

export const add = url => ({
    type: JUDGES_ADD,
    url
});

export const remove = url => ({
    type: JUDGES_REMOVE,
    url
});

export const toggleOption = e => ({
    type: JUDGES_TOGGLE_OPTION,
    target: e.target.name
});

/**
 * Pings all active judges via the backend and stores their alive/latency status.
 * Returns true if required judge types are reachable, false otherwise.
 * @param {string[]} [protocols] Protocols to validate (defaults to all four)
 */
export const refreshJudges = (protocols = ['http', 'https', 'socks4', 'socks5']) => async dispatch => {
    dispatch({ type: JUDGES_SET_REFRESHING, refreshing: true });
    dispatch({ type: JUDGES_SET_STATUSES, statuses: {} });
    try {
        const statuses = await apiFetch('/api/judges/refresh', { method: 'POST' });
        const map = {};
        if (Array.isArray(statuses)) {
            statuses.forEach(s => { map[s.url] = s; });
        }
        dispatch({ type: JUDGES_SET_STATUSES, statuses: map });

        // Any alive judge works for all proxy protocols.
        const hasAny = Object.values(map).some(s => s.alive);
        return hasAny;
    } catch {
        return false;
    } finally {
        dispatch({ type: JUDGES_SET_REFRESHING, refreshing: false });
    }
};
