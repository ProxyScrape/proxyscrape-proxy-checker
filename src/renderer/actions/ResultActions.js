import { getFilteredProxies } from '../store/selectors/getFilteredProxies';
import { trackScreen, trackAction } from '../misc/analytics';
import { saveTextFile } from '../misc/filePicker';
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
    RESULT_SET_MAX_TIMEOUT,
    RESULT_CHANGE_PORTS_INPUT,
    RESULT_SET_PORTS_ALLOW,
    RESULT_SORT,
    RESULT_EXPORT_TOGGLE,
    RESULT_EXPORT_CHANGE_TYPE,
    RESULT_EXPORT_CHANGE_AUTH_TYPE,
    RESULT_TOGGLE_HIDE_STATUS,
    RESULT_PATCH_GEO,
} from '../constants/ActionTypes';
import { otherChanges } from './CheckingActions';
import { wait } from '../misc/wait';

/**
 * Patches geo fields for a set of enriched rows into the Redux result store.
 * Rows are matched by host (proxy IP). Called when the SSE stream delivers
 * updated rows from the geo enrichment worker.
 *
 * @param {Array<{host, countryCode, countryName, countryFlag, city}>} rows
 */
export const patchGeo = rows => ({ type: RESULT_PATCH_GEO, rows });

/**
 * Maps a raw proxy result object (from SSE events or the history API) to the
 * normalised shape stored in Redux. The `traces` field is present for live
 * check results and null for history items — both callers are safe with this.
 */
export const mapResultItem = item => ({
    host: item.proxy.host,
    port: item.proxy.port,
    auth: item.proxy.auth,
    status: item.status || 'failed',
    protocols: item.protocols || [],
    anon: item.anon || '',
    timeout: item.timeoutMs || 0,
    country: {
        code: item.country ? item.country.code : '',
        name: item.country ? item.country.name : '',
        flag: item.country ? item.country.flag : '',
        city: item.city || '',
    },
    blacklist: Array.isArray(item.blacklist) && item.blacklist.length > 0 ? item.blacklist : false,
    errors: item.errors || {},
    server: item.server || null,
    keepAlive: item.keepAlive || false,
    traces: item.traces || null,
    fullData: item.fullData || null,
    geoStatus: item.geoStatus || 'done',
});

const getProtocolPrefix = (protocols) => {
    if (protocols.length === 1) {
        return (protocols[0] === 'https' ? 'http' : protocols[0]);
    }
    if (protocols.indexOf('socks5') !== -1) return 'socks5';
    if (protocols.indexOf('socks4') !== -1) return 'socks4';
    return 'http';
};

export const formatProxyResults = (items, { withProtocol = false, authType = 1 } = {}) => {
    let content = '';

    items.forEach(item => {
        const prefix = withProtocol ? getProtocolPrefix(item.protocols) + '://' : '';
        const hasAuth = item.auth !== 'none';

        if (hasAuth && authType == 1) {
            content += prefix + item.auth + '@' + item.host + ':' + item.port + '\r\n';
        } else if (hasAuth) {
            content += prefix + item.host + ':' + item.port + ':' + item.auth + '\r\n';
        } else {
            content += prefix + item.host + ':' + item.port + '\r\n';
        }
    });

    return content;
};

export const getResultsInIpPort = (items, authType = 1) =>
    formatProxyResults(items, { withProtocol: false, authType });

export const getResultsInProtocolIpPort = (items, authType = 1) =>
    formatProxyResults(items, { withProtocol: true, authType });

export const save = () => async (dispatch, getState) => {
    const { type, authType } = getState().result.exporting;
    const saveType = type == 1 ? getResultsInIpPort : getResultsInProtocolIpPort;
    const filtered = getFilteredProxies(getState());
    const content = saveType(filtered, authType);

    try {
        const ok = await saveTextFile(content, 'proxies.txt');
        if (ok) {
            trackAction('results_exported', { export_method: 'file', proxy_count: filtered.length });
            dispatch(toggleExport());
        }
    } catch (err) {
        console.error('Export to file failed:', err);
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
        const name = item.country && item.country.name;
        if (!name) return;
        if (countries[name] === undefined) {
            countries[name] = {
                count: 1,
                flag: item.country.flag
            };
        } else {
            countries[name].count++;
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

    const countries = createCountries(result.items);

    dispatch({
        type: RESULT_SHOW,
        items: result.items,
        countries,
        inBlacklists: result.inBlacklists,
        timeout
    });

    const working = result.items.filter(item => item.status === 'working');
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
        unique_countries: countries.length,
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

export const toggleHideStatus = status => ({
    type: RESULT_TOGGLE_HIDE_STATUS,
    status,
});

