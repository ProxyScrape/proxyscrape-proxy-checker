import { getFilteredProxies } from '../store/selectors/getFilteredProxies';
import { trackScreen, trackAction } from '../misc/analytics';
import { writeFile } from 'fs';
import {
    RESULT_SHOW,
    RESULT_TOGGLE_ANON,
    RESULT_TOGGLE_PROTOCOL,
    RESULT_TOGGLE_COUNTRY,
    RESULT_TOGGLE_MISC,
    RESULT_SET_SEARCH,
    RESULT_LOAD_MORE,
    RESULT_CLOSE,
    RESULT_TOGGLE_BLACKLIST,
    RESULT_TOGGLE_COUNTRIES,
    RESULT_SET_MAX_TIMEOUT,
    RESULT_CHANGE_PORTS_INPUT,
    RESULT_SET_PORTS_ALLOW,
    RESULT_SORT,
    RESULT_EXPORT_TOGGLE,
    RESULT_EXPORT_CHANGE_TYPE,
    RESULT_EXPORT_CHANGE_AUTH_TYPE
} from '../constants/ActionTypes';
import { otherChanges } from './CheckingActions';
import { wait } from '../misc/wait';
import { ipcRenderer } from 'electron';

export const getResultsInIpPort = (items, authType = 1) => {
    let content = '';

    items.forEach(item => {
        if (item.auth !== 'none') {
            if (authType == 1) {
                content += item.auth + '@' + item.host + ':' + item.port + '\r\n';
            } else {
                content += item.host + ':' + item.port + ':' + item.auth + '\r\n';
            }
        } else {
            content += item.host + ':' + item.port + '\r\n';
        }
    });

    return content;
};

export const getResultsInProtocolIpPort = (items, authType = 1) => {
    let content = '';

    items.forEach(item => {
        if (item.auth !== 'none') {
            if (authType == 1) {
                if (item.protocols.length == 1) {
                    if (item.protocols[0] === 'https') {
                        content += 'http://' + item.auth + '@' + item.host + ':' + item.port + '\r\n';
                    } else {
                        content += item.protocols[0] + '://' + item.auth + '@' + item.host + ':' + item.port + '\r\n';
                    }
                } else {
                    if (item.protocols.indexOf('socks5') !== -1) {
                        content += 'socks5://' + item.auth + '@' + item.host + ':' + item.port + '\r\n';
                    } else if (item.protocols.indexOf('socks4') !== -1) {
                        content += 'socks4://' + item.auth + '@' + item.host + ':' + item.port + '\r\n';
                    } else {
                        content += 'http://' + item.auth + '@' + item.host + ':' + item.port + '\r\n';
                    }
                }
            } else {
                if (item.protocols.length == 1) {
                    if (item.protocols[0] === 'https') {
                        content += 'http://' + item.host + ':' + item.port + ':' + item.auth + '\r\n';
                    } else {
                        content += item.protocols[0] + '://' + item.host + ':' + item.port + ':' + item.auth + '\r\n';
                    }
                } else {
                    if (item.protocols.indexOf('socks5') !== -1) {
                        content += 'socks5://' + item.host + ':' + item.port + ':' + item.auth + '\r\n';
                    } else if (item.protocols.indexOf('socks4') !== -1) {
                        content += 'socks4://' + item.host + ':' + item.port + ':' + item.auth + '\r\n';
                    } else {
                        content += 'http://' + item.host + ':' + item.port + ':' + item.auth + '\r\n';
                    }
                }
            }
        } else {
            if (item.protocols.length == 1) {
                if (item.protocols[0] === 'https') {
                    content += 'http://' + item.host + ':' + item.port + '\r\n';
                } else {
                    content += item.protocols[0] + '://' + item.host + ':' + item.port + '\r\n';
                }
            } else {
                if (item.protocols.indexOf('socks5') !== -1) {
                    content += 'socks5://' + item.host + ':' + item.port + '\r\n';
                } else if (item.protocols.indexOf('socks4') !== -1) {
                    content += 'socks4://' + item.host + ':' + item.port + '\r\n';
                } else {
                    content += 'http://' + item.host + ':' + item.port + '\r\n';
                }
            }
        }
    });

    return content;
};

export const save = () => async (dispatch, getState) => {
    const { type, authType } = getState().result.exporting;
    const saveType = type == 1 ? getResultsInIpPort : getResultsInProtocolIpPort;
    const path = await ipcRenderer.invoke('choose-path', 'save');

    if (path) {
        const filtered = getFilteredProxies(getState());
        writeFile(path, saveType(filtered, authType), () => {
            trackAction('results_exported', { export_method: 'file', proxy_count: filtered.length });
            dispatch(toggleExport());
        });
    }
};

export const copy = () => async (dispatch, getState) => {
    const { type, authType } = getState().result.exporting;
    const saveType = type == 1 ? getResultsInIpPort : getResultsInProtocolIpPort;
    const filtered = getFilteredProxies(getState());
    navigator.clipboard.writeText(saveType(filtered, authType));
    trackAction('results_exported', { export_method: 'clipboard', proxy_count: filtered.length });
    dispatch(toggleExport());
};

export const close = () => ({
    type: RESULT_CLOSE
});

const createCountries = items => {
    const countries = {};
    const res = [];

    items.forEach(item => {
        if (countries[item.country.name] === undefined) {
            countries[item.country.name] = {
                count: 1,
                flag: item.country.flag
            };
        } else {
            countries[item.country.name].count++;
        }
    });

    Object.keys(countries).forEach(item => {
        res.push({
            active: true,
            name: item,
            ...countries[item]
        });
    });

    return res.sort((a, b) => b.count - a.count);
};

export const showResult = result => async (dispatch, getState) => {
    const {
        core: { timeout },
        input
    } = getState();

    dispatch({
        type: RESULT_SHOW,
        items: result.items,
        countries: createCountries(result.items),
        inBlacklists: result.inBlacklists,
        timeout
    });

    const working = result.items;
    const totalChecked = input.list ? input.list.length : 0;
    const workingCount = working.length;
    const failedCount = totalChecked - workingCount;

    const protocolCounts = {};
    working.forEach(item => {
        if (item.protocols) {
            item.protocols.forEach(p => { protocolCounts[p] = (protocolCounts[p] || 0) + 1; });
        }
    });

    const timeouts = working.map(i => i.timeout).filter(t => typeof t === 'number' && t > 0);
    const avgTimeout = timeouts.length > 0 ? Math.round(timeouts.reduce((a, b) => a + b, 0) / timeouts.length) : null;

    trackScreen('Results');
    trackAction('proxy_check_completed', {
        total_checked: totalChecked,
        working_proxies: workingCount,
        failed_proxies: failedCount,
        success_rate: totalChecked > 0 ? Math.round((workingCount / totalChecked) * 100) : 0,
        avg_timeout_ms: avgTimeout,
        protocol_http: protocolCounts.http || 0,
        protocol_https: protocolCounts.https || 0,
        protocol_socks4: protocolCounts.socks4 || 0,
        protocol_socks5: protocolCounts.socks5 || 0,
        unique_countries: createCountries(result.items).length,
    });

    await wait(300);
    dispatch(otherChanges({ opened: false }));
    await wait(300);
    dispatch(otherChanges({ preparing: false }));
};

export const toggleBlacklist = title => ({
    type: RESULT_TOGGLE_BLACKLIST,
    title
});

export const toggleAnon = e => ({
    type: RESULT_TOGGLE_ANON,
    anon: e.target.name
});

export const toggleCountries = () => ({
    type: RESULT_TOGGLE_COUNTRIES
});

export const toggleProtocol = e => ({
    type: RESULT_TOGGLE_PROTOCOL,
    protocol: e.target.name
});

export const toggleMisc = e => ({
    type: RESULT_TOGGLE_MISC,
    misc: e.target.name
});

export const setMaxTimeout = e => ({
    type: RESULT_SET_MAX_TIMEOUT,
    timeout: e.target.value
});

export const onSearchInput = e => ({
    type: RESULT_SET_SEARCH,
    value: e.target.value
});

export const toggleCountry = (name, all, state) => ({
    type: RESULT_TOGGLE_COUNTRY,
    name,
    all,
    state
});

export const loadMore = () => ({
    type: RESULT_LOAD_MORE
});

export const changePortsInput = e => ({
    type: RESULT_CHANGE_PORTS_INPUT,
    input: e.target.value
});

const setPortsAllow = allow => ({
    type: RESULT_SET_PORTS_ALLOW,
    allow
});

export const allowPorts = () => setPortsAllow(true);
export const disallowPorts = () => setPortsAllow(false);

export const sortResults = by => ({
    type: RESULT_SORT,
    by
});

export const toggleExport = () => ({
    type: RESULT_EXPORT_TOGGLE
});

export const changeExportType = e => ({
    type: RESULT_EXPORT_CHANGE_TYPE,
    value: e.target.value
});

export const changeExportAuthType = e => ({
    type: RESULT_EXPORT_CHANGE_AUTH_TYPE,
    value: e.target.value
});
