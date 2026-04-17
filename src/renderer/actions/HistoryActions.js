import { apiFetch } from '../api/client';
import { HISTORY_SET_CHECKS, HISTORY_SET_LOADING, HISTORY_REMOVE_CHECK, HISTORY_CLEAR, RESULT_SHOW } from '../constants/ActionTypes';
import { mapResultItem } from './ResultActions';

export const loadHistory = () => async (dispatch) => {
    dispatch({ type: HISTORY_SET_LOADING });
    try {
        const checks = await apiFetch('/api/checks');
        dispatch({ type: HISTORY_SET_CHECKS, checks: checks || [] });
    } catch {
        dispatch({ type: HISTORY_SET_CHECKS, checks: [] });
    }
};

export const viewPastCheck = (checkId) => async (dispatch) => {
    const data = await apiFetch('/api/checks/' + checkId + '/results?page=1&limit=1000');
    if (!data || !data.items) return;

    const items = data.items.map(mapResultItem);

    const countries = {};
    items.forEach(item => {
        const countryName = item.country && item.country.name ? item.country.name : null;
        if (countryName) {
            if (!countries[countryName]) {
                countries[countryName] = { count: 0, flag: item.country.flag || '' };
            }
            countries[countryName].count++;
        }
    });

    const countryList = Object.keys(countries)
        .map(name => ({ active: true, name, ...countries[name] }))
        .sort((a, b) => b.count - a.count);

    const inBlacklists = [];
    const seenBlacklists = {};
    items.forEach(item => {
        const bls = item.blacklist;
        if (Array.isArray(bls)) {
            bls.forEach(bl => {
                const title = typeof bl === 'string' ? bl : bl.title;
                if (title && !seenBlacklists[title]) {
                    seenBlacklists[title] = true;
                    inBlacklists.push({ title, active: true });
                }
            });
        }
    });

    const maxItemTimeout = items.reduce((max, item) => Math.max(max, item.timeoutMs || 0), 0);

    dispatch({
        type: RESULT_SHOW,
        items,
        countries: countryList,
        inBlacklists,
        timeout: maxItemTimeout || 60000,
    });
};

export const deleteHistoryCheck = (checkId) => async (dispatch) => {
    try {
        await apiFetch('/api/checks/' + checkId, { method: 'DELETE' });
        dispatch({ type: HISTORY_REMOVE_CHECK, id: checkId });
    } catch {
        // deletion failed silently — item remains in list
    }
};

export const clearHistory = () => async (dispatch) => {
    dispatch({ type: HISTORY_CLEAR });
    apiFetch('/api/checks', { method: 'DELETE' }).catch(() => {});
};
