import { apiFetch } from '../api/client';
import { wait } from '../misc/wait';
import { UPDATE_CHANGE_STATE } from '../constants/ActionTypes';
import { isDev } from '../../shared/AppConstants';

const RELEASES_URL = 'https://api.github.com/repos/ProxyScrape/proxy-checker/releases';
const ONLINE_URL = 'https://api.proxyscrape.com/v2/analytics/proxy-checker.php';

const sendOnlineInfo = () => {
    const body = JSON.stringify({ user_online: true });
    try {
        fetch(ONLINE_URL, { method: 'POST', body, headers: { 'Content-Type': 'application/json' } });
        setInterval(() => {
            fetch(ONLINE_URL, { method: 'POST', body, headers: { 'Content-Type': 'application/json' } });
        }, 60000);
    } catch {
        // non-critical, ignore
    }
};

export const checkAtAvailable = () => async dispatch => {
    let details = { available: false, releases: [] };

    try {
        const versionData = await apiFetch('/api/version');
        const releasesRes = await fetch(RELEASES_URL, { headers: { Accept: 'application/vnd.github.v3+json' } });
        const releases = releasesRes.ok ? await releasesRes.json() : [];
        details = { available: !!versionData?.hasUpdate, releases };
    } catch {
        // version check failed — show no update
    }

    if (!isDev) sendOnlineInfo();
    await wait(500);

    dispatch(
        changeUpdateState({
            ...(details.available && !isDev ? { ...details } : { available: false, active: false }),
            isChecking: false,
            releases: details.releases
        })
    );
};

const changeUpdateState = nextState => ({
    type: UPDATE_CHANGE_STATE,
    nextState
});
