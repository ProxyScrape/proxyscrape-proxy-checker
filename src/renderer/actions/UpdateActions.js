import { getLatestVersionInfo, sendOnlineInfo } from '../core/updater';
import { wait } from '../misc/wait';
import { UPDATE_CHANGE_STATE } from '../constants/ActionTypes';
import { isDev } from '../../shared/AppConstants';

export const checkAtAvailable = () => async dispatch => {
    const details = await getLatestVersionInfo();
    
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
