import { apiFetch, openCheckStream } from '../api/client';
import { isIP } from '../misc/regexes';
import { trackAction } from '../misc/analytics';
import { CHECKING_UP_COUNTER_STATUS, CHECKING_OPEN, CHECKING_OTHER_CHANGES, CORE_SET_PROTOCOL_WARNING } from '../constants/ActionTypes';
import { showError, showErrorWithCta } from '../store/reducers/app';
import { psUrl } from '../misc/other';
import { showResult, mapResultItem } from './ResultActions';
import { pingJudgesWithOverlay } from './OverlayJudgesActions';

let currentCheckId = null;
let closeCurrentStream = null;
let resolveProtocolWarning = null;

const buildInBlacklists = items => {
    const seen = {};
    const list = [];
    items.forEach(item => {
        if (Array.isArray(item.blacklist)) {
            item.blacklist.forEach(bl => {
                if (!seen[bl]) {
                    seen[bl] = true;
                    list.push({ title: bl, active: true });
                }
            });
        }
    });
    return list;
};

/**
 * Attach an SSE stream to a running check and open the checking overlay.
 *
 * `initialCounter` sets the counter state shown immediately when the overlay
 * opens. Pass `{ all: total, done: 0 }` for a fresh check and
 * `{ all: total, done: <snapshot length> }` when reconnecting so the user
 * sees the correct progress instantly rather than starting from zero.
 *
 * The server replays all snapshot results before streaming new ones, so
 * `bufferedResults` will be populated in full regardless of when the client
 * connected or reconnected.
 */
function attachCheckStream(dispatch, id, initialCounter) {
    currentCheckId = id;
    const bufferedResults = [];

    const finalise = () => {
        if (closeCurrentStream) {
            closeCurrentStream();
            closeCurrentStream = null;
        }
        currentCheckId = null;
    };

    const displayResults = () => {
        finalise();
        dispatch(otherChanges({ finalizingMessage: null }));
        dispatch(showResult({
            items: bufferedResults,
            inBlacklists: buildInBlacklists(bufferedResults),
        }));
    };

    dispatch(openChecking(initialCounter));

    closeCurrentStream = openCheckStream(id, {
        onResult: event => {
            bufferedResults.push(mapResultItem(event));
        },
        onProgress: event => {
            dispatch(upCounterStatus({
                all: event.total,
                done: event.done,
                working: event.working,
                threads: event.threads,
                protocols: {},
            }));
        },
        onEnriching: () => {
            dispatch(otherChanges({ finalizingMessage: 'Enriching location data...' }));
        },
        onGeoBatch: data => {
            const patchMap = new Map((data?.results ?? []).map(r => [r.host, r]));
            bufferedResults.forEach(item => {
                const patch = patchMap.get(item.host);
                if (!patch) return;
                item.country = {
                    code: patch.countryCode || '',
                    name: patch.countryName || '',
                    flag: patch.countryFlag || '',
                    city: patch.city || '',
                };
                item.geoStatus = 'done';
            });
        },
        onComplete: displayResults,
        onStopped: displayResults,
        onBackendError: displayResults,
    });
}

/**
 * On startup, check whether a check is still running on the server for the
 * current guest session. If one is found, reconnect to it automatically.
 *
 * The backend replays all results produced so far before streaming new ones,
 * so the client receives the complete result set regardless of when it joins.
 * The overlay counter is initialised from the server's snapshot length so it
 * shows the real progress immediately rather than starting from zero.
 *
 * Only called in guest mode (from index.jsx after bootstrapGuestSession).
 */
export const reconnectIfRunning = () => async (dispatch) => {
    try {
        const data = await apiFetch('/api/check/active');
        if (data && data.id) {
            attachCheckStream(dispatch, data.id, { all: data.total, done: data.done, protocols: {} });
        }
    } catch {
        // No active check, network error, or non-guest mode — proceed normally.
    }
};

export const respondToProtocolWarning = choice => dispatch => {
    dispatch({ type: CORE_SET_PROTOCOL_WARNING, warning: { open: false } });
    if (resolveProtocolWarning) {
        resolveProtocolWarning(choice);
        resolveProtocolWarning = null;
    }
};

const validateJudges = (judges) => {
    if (judges.filter(({ active }) => active).length === 0) {
        throw new Error('You have no active judges');
    }

    if (judges.some(({ url }) => {
        try { new URL(url); return false; } catch { return true; }
    })) {
        throw new Error('Judge URL is not correct');
    }
};

const validateBlacklist = items => {
    const urlOrPath = /^(https?:\/\/.+)|(\/.+)|([A-Za-z]:\\.+)$/;
    if (items.every(({ path }) => urlOrPath.test(path))) {
        return true;
    }

    throw new Error('Blacklist path must be an local path or URL');
};

const validateInput = list => {
    if (list.length > 0) {
        return true;
    }

    throw new Error('No proxies found');
};

const transformProtocols = protocols => {
    const enabledProtocols = Object.keys(protocols).filter(protocol => protocols[protocol]);

    if (enabledProtocols.length > 0) {
        return enabledProtocols;
    }

    throw new Error('Select protocols');
};

const getUniqueListProtocols = list =>
    [...new Set(list.map(p => p.protocol).filter(Boolean))];

const showProtocolWarning = (dispatch, listProtocols, selectedProtocols) =>
    new Promise(resolve => {
        resolveProtocolWarning = resolve;
        dispatch({
            type: CORE_SET_PROTOCOL_WARNING,
            warning: { open: true, listProtocols, selectedProtocols },
        });
    });

export const start = () => async (dispatch, getState) => {
    try {
        const { core, judges, blacklist, ip, input, checking, overlay } = getState();

        if (checking.opened || overlay.judges.locked) {
            return;
        }

        const selectedProtocols = transformProtocols(core.protocols);
        const activeJudges = judges.items.filter(item => item.active);

        validateInput(input.list);

        // Determine effective per-proxy protocol mode.
        // When overrideProtocols is true, ignore declared protocols and use the
        // selected ones uniformly (legacy behaviour).
        // When false (default), honour the protocol declared in each import line.
        const listProtocols = getUniqueListProtocols(input.list);
        let useListProtocols = !core.overrideProtocols && listProtocols.length > 0;

        if (useListProtocols) {
            const mismatched = listProtocols.filter(p => !selectedProtocols.includes(p));
            if (mismatched.length > 0) {
                const choice = await showProtocolWarning(dispatch, listProtocols, selectedProtocols);
                if (choice === 'cancel') {
                    return;
                }
                if (choice === 'override') {
                    useListProtocols = false;
                }
            }
        }

        // Collect the full set of protocols we actually need judges for.
        const protocols = useListProtocols
            ? [...new Set([...listProtocols, ...selectedProtocols])]
            : selectedProtocols;

        validateJudges(activeJudges);

        if (blacklist.filter) {
            validateBlacklist(blacklist.items);
        }

        // Signal that checking is starting so toasts use compact positioning
        // immediately (before the full-screen overlay opens after judges pass).
        dispatch(otherChanges({ starting: true }));

        // Show the judge ping overlay, ping all judges, then proceed only if
        // required judge types are reachable for the selected protocols.
        const judgesOk = await dispatch(pingJudgesWithOverlay(protocols));
        if (!judgesOk) {
            throw new Error('No working judges found for the selected protocols. Check the Judges tab for details.');
        }

        trackAction('proxy_check_started', {
            proxy_count: input.list.length,
            authenticated_proxies: input.list.filter(p => p.auth && p.auth !== 'none').length,
            unauthenticated_proxies: input.list.filter(p => !p.auth || p.auth === 'none').length,
            protocols: protocols.join(','),
            threads: core.threads,
            timeout: core.timeout,
        });

        const payload = {
            proxies: input.list.map(p => ({
                host: p.host,
                port: parseInt(p.port),
                auth: p.auth || 'none',
                protocol: useListProtocols ? (p.protocol || '') : '',
            })),
            protocols,
            threads: core.threads,
            timeout: core.timeout,
            retries: core.retries,
            judgeUrls: activeJudges.map(j => ({ url: j.url, validate: j.validate, active: j.active })),
            blacklistSources: blacklist.filter ? blacklist.items : [],
            myIP: isIP(ip.current) ? ip.current : null,
            keepAlive: core.keepAlive,
            captureServer: core.captureServer,
            captureTrace: core.captureTrace,
            localDns: core.localDns,
            captureFullData: core.captureFullData,
            shuffle: core.shuffle,
        };

        const data = await apiFetch('/api/check', {
            method: 'POST',
            body: JSON.stringify(payload),
        });

        attachCheckStream(dispatch, data.id, { all: input.list.length, done: 0, protocols: {} });
    } catch (error) {
        dispatch(otherChanges({ starting: false }));
        if (error.status === 429) {
            dispatch(showErrorWithCta(error.message, {
                subtitle: 'The online checker limits concurrent runs. Wait for your current checks to finish, or use the desktop app for unlimited concurrent checking.',
                label: 'Get the free desktop app',
                href: psUrl('/proxy-checker', 'guest-limit-error'),
            }));
        } else {
            dispatch(showError(error.message));
        }
    }
};

export const stop = () => async (dispatch, getState) => {
    const { checking } = getState();

    if (checking.preparing) {
        return;
    }

    trackAction('proxy_check_stopped', {
        checked_so_far: checking.counter.done,
        total_proxies: checking.counter.all,
    });

    dispatch(otherChanges({ preparing: true }));

    if (currentCheckId) {
        try {
            await apiFetch('/api/check/' + currentCheckId, { method: 'DELETE' });
        } catch {
            // SSE onStopped will handle cleanup regardless
        }
    }
};

export const otherChanges = state => ({
    type: CHECKING_OTHER_CHANGES,
    state
});

export const openChecking = counter => ({
    type: CHECKING_OPEN,
    counter
});

export const upCounterStatus = counter => ({
    type: CHECKING_UP_COUNTER_STATUS,
    counter
});

