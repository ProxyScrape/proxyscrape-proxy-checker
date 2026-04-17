import { OVERLAY_JUDGES_CHANGE_STATE, OVERLAY_JUDGE_CHANGE_PING_STATE, JUDGES_SET_STATUSES } from '../constants/ActionTypes';
import { apiFetch } from '../api/client';

export const changeState = state => ({
    type: OVERLAY_JUDGES_CHANGE_STATE,
    state
});

export const startPing = () => (dispatch, getState) => {
    const { judges } = getState();

    const parsejudges = judges.items.filter(item => item.active).map(item => ({
        url: item.url,
        state: {
            checking: true,
            working: false
        }
    }));

    dispatch(changeState({ isActive: true, locked: true, items: parsejudges }));
};

export const changeJudgePingState = (url, state) => ({
    type: OVERLAY_JUDGE_CHANGE_PING_STATE,
    url,
    state
});

/**
 * Shows the judge ping overlay, pings all active judges via the backend,
 * updates each judge's result in the overlay, then dismisses it.
 * Returns true if required judge types are reachable for the given protocols.
 */
export const pingJudgesWithOverlay = protocols => async (dispatch, getState) => {
    const { judges } = getState();
    const activeJudges = judges.items.filter(item => item.active);

    // Show overlay — all judges start in "checking" (spinner) state
    dispatch(changeState({
        isActive: true,
        locked: true,
        items: activeJudges.map(item => ({
            url: item.url,
            state: { checking: true, working: false, timeout: 0 },
        })),
    }));

    let statusMap = {};
    try {
        const statuses = await apiFetch('/api/judges/refresh', { method: 'POST' });
        if (Array.isArray(statuses)) {
            statuses.forEach(s => { statusMap[s.url] = s; });
        }
    } catch {
        // leave all judges showing as failed
    }

    // Update each judge row in the overlay with its result
    activeJudges.forEach(judge => {
        const s = statusMap[judge.url];
        dispatch(changeJudgePingState(judge.url, {
            state: {
                checking: false,
                working: s ? s.alive : false,
                timeout: s ? s.timeoutMs : 0,
            },
        }));
    });

    // Sync results into the Judges tab status dots too
    dispatch({ type: JUDGES_SET_STATUSES, statuses: statusMap });

    // Hold results visible briefly so the user can read them
    await new Promise(r => setTimeout(r, 1500));

    dispatch(changeState({ isActive: false, locked: false }));

    // Any alive judge (HTTP or SSL) works for all proxy protocols — the
    // backend uses the same judge URL regardless of proxy protocol type.
    // SSL judges are opt-in for users who want to test CONNECT tunnel
    // behaviour specifically, not a requirement for HTTPS proxy checking.
    const hasAny = Object.values(statusMap).some(s => s.alive);
    return hasAny;
};
