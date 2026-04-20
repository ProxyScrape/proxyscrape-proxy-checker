import { apiFetch } from '../api/client';
import { wait } from '../misc/wait';
import { UPDATE_CHANGE_STATE } from '../constants/ActionTypes';
import { isDev, IS_CANARY } from '../../shared/AppConstants';

export const checkAtAvailable = () => async dispatch => {
    try {
        // Go backend handles the GitHub API call and version comparison.
        const versionData = await apiFetch('/api/version');
        await wait(500);

        if (IS_CANARY) {
            // On canary, never show the full-screen update overlay.
            // The CanaryBanner reads hasUpdate and canaryReleases directly from state.
            // Info slideout shows canary releases.
            dispatch(changeUpdateState({
                active: false,
                isChecking: false,
                available: false,
                hasUpdate: !!versionData?.hasUpdate,
                latestCanary: versionData?.latest || null,
                canaryReleases: versionData?.canaryReleases || [],
                releases: versionData?.canaryReleases || [],
            }));
        } else {
            dispatch(changeUpdateState({
                active: !!versionData?.hasUpdate && !isDev,
                isChecking: false,
                available: !!versionData?.hasUpdate && !isDev,
                releases: versionData?.releases || [],
            }));
        }
    } catch (e) {
        await wait(500);
        dispatch(changeUpdateState({ active: false, isChecking: false, available: false, releases: [] }));
    }
};

const changeUpdateState = nextState => ({
    type: UPDATE_CHANGE_STATE,
    nextState
});
