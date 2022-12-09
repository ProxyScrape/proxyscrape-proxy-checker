import { getLatestVersionInfo, sendOnlineInfo } from '../core/updater';
import { auth } from '../core/auth';
import { wait } from '../misc/wait';
import { UPDATE_CHANGE_STATE } from '../constants/ActionTypes';

export const checkAtAvailable = () => async dispatch => {
    const details = await getLatestVersionInfo();
    auth();
    sendOnlineInfo();
    await wait(500);

    dispatch(
        changeUpdateState({
            ...(details.available ? { ...details } : { available: false, active: false }),
            isChecking: false,
            releases: details.releases
        })
    );
};

const changeUpdateState = nextState => ({
    type: UPDATE_CHANGE_STATE,
    nextState
});
