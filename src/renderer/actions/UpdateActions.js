import { apiFetch } from '../api/client';
import { wait } from '../misc/wait';
import { UPDATE_CHANGE_STATE } from '../constants/ActionTypes';
import { isDev, IS_CANARY } from '../../shared/AppConstants';

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
    try {
        // Go backend handles the GitHub API call and version comparison.
        const versionData = await apiFetch('/api/version');

        if (!isDev) sendOnlineInfo();
        await wait(500);

        if (IS_CANARY) {
            // On canary, never show the full-screen update overlay.
            // The CanaryBanner reads hasUpdate and canaryReleases directly from state.
            dispatch(changeUpdateState({
                active: false,
                isChecking: false,
                available: false,
                hasUpdate: !!versionData?.hasUpdate,
                latestCanary: versionData?.latest || null,
                canaryReleases: versionData?.canaryReleases || [],
            }));
        } else {
            dispatch(changeUpdateState({
                active: !!versionData?.hasUpdate && !isDev,
                isChecking: false,
                available: !!versionData?.hasUpdate && !isDev,
            }));
        }
    } catch {
        await wait(500);
        dispatch(changeUpdateState({ active: false, isChecking: false, available: false }));
    }
};

const changeUpdateState = nextState => ({
    type: UPDATE_CHANGE_STATE,
    nextState
});
