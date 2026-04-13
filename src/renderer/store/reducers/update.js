import { UPDATE_CHANGE_STATE } from '../../constants/ActionTypes';

const initialState = {
    active: true,
    isChecking: true,
    available: false,
    // Canary-only fields populated when IS_CANARY=true
    hasUpdate: false,
    latestCanary: null,
    canaryReleases: [],
};

const update = (state = initialState, action) => {
    switch (action.type) {
        case UPDATE_CHANGE_STATE:
            return {
                ...state,
                ...action.nextState
            };
        default:
            return state;
    }
};

export default update;
