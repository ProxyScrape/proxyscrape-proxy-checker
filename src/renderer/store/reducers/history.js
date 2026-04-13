import {
    HISTORY_SET_CHECKS,
    HISTORY_SET_LOADING,
    HISTORY_REMOVE_CHECK,
    HISTORY_CLEAR,
} from '../../constants/ActionTypes';

const initialState = {
    checks: [],
    loading: false,
};

const history = (state = initialState, action) => {
    switch (action.type) {
        case HISTORY_SET_CHECKS:
            return {
                ...state,
                checks: action.checks,
                loading: false,
            };
        case HISTORY_SET_LOADING:
            return {
                ...state,
                loading: true,
            };
        case HISTORY_REMOVE_CHECK:
            return {
                ...state,
                checks: state.checks.filter(c => c.id !== action.id),
            };
        case HISTORY_CLEAR:
            return {
                ...state,
                checks: [],
            };
        default:
            return state;
    }
};

export default history;
