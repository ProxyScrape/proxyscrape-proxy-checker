import { apiFetch } from '../api/client';
import { wait } from '../misc/wait';
import { UPDATE_CHANGE_STATE } from '../constants/ActionTypes';
import { isDev } from '../../shared/AppConstants';

export const checkAtAvailable = () => async dispatch => {
    try {
        // Go backend handles the GitHub API call and version comparison.
        const versionData = await apiFetch('/api/version');
        await wait(500);

        // On canary, Update.jsx suppresses the overlay until electron-updater fires
        // (phase !== null guard). The API check still runs to populate the Info
        // slideout changelog and the portable update link.
        // The backend returns canary entries in canaryReleases and stable entries
        // in releases — pick whichever is populated for the current build.
        const releases = versionData?.canaryReleases?.length
            ? versionData.canaryReleases
            : (versionData?.releases || []);
        dispatch(changeUpdateState({
            active: !!versionData?.hasUpdate && !isDev,
            isChecking: false,
            available: !!versionData?.hasUpdate && !isDev,
            releases,
        }));
    } catch {
        await wait(500);
        dispatch(changeUpdateState({ active: false, isChecking: false, available: false, releases: [] }));
    }
};

const changeUpdateState = nextState => ({
    type: UPDATE_CHANGE_STATE,
    nextState
});
