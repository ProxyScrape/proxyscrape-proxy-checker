import { ipcRenderer } from 'electron';
import { HISTORY_SET_CHECKS, HISTORY_SET_LOADING, HISTORY_REMOVE_CHECK, RESULT_SHOW } from '../constants/ActionTypes';

export const loadHistory = () => async (dispatch) => {
    dispatch({ type: HISTORY_SET_LOADING });
    const checks = await ipcRenderer.invoke('db-get-checks');
    dispatch({ type: HISTORY_SET_CHECKS, checks: checks || [] });
};

export const viewPastCheck = (checkId) => async (dispatch) => {
    const data = await ipcRenderer.invoke('db-get-check-results', checkId);
    if (!data) return;

    const countries = {};
    data.items.forEach(item => {
        if (item.country && item.country.name) {
            if (!countries[item.country.name]) {
                countries[item.country.name] = { count: 0, flag: item.country.flag };
            }
            countries[item.country.name].count++;
        }
    });

    const countryList = Object.keys(countries)
        .map(name => ({ active: true, name, ...countries[name] }))
        .sort((a, b) => b.count - a.count);

    const inBlacklists = [];
    const seenBlacklists = {};
    data.items.forEach(item => {
        if (item.blacklists && Array.isArray(item.blacklists)) {
            item.blacklists.forEach(bl => {
                const title = typeof bl === 'string' ? bl : bl.title;
                if (title && !seenBlacklists[title]) {
                    seenBlacklists[title] = true;
                    inBlacklists.push({ title, active: true });
                }
            });
        }
    });

    dispatch({
        type: RESULT_SHOW,
        items: data.items,
        countries: countryList,
        inBlacklists,
        timeout: data.timeoutSetting,
    });
};

export const deleteHistoryCheck = (checkId) => async (dispatch) => {
    const success = await ipcRenderer.invoke('db-delete-check', checkId);
    if (success) {
        dispatch({ type: HISTORY_REMOVE_CHECK, id: checkId });
    }
};
