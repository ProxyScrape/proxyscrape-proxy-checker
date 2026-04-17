import { APP_SET_ERROR, APP_CLEAR_ERROR } from '../../constants/ActionTypes';

const initialState = {
    error: null, // string | null
};

export default function app(state = initialState, action) {
    switch (action.type) {
        case APP_SET_ERROR:   return { ...state, error: action.message };
        case APP_CLEAR_ERROR: return { ...state, error: null };
        default:              return state;
    }
}

export const showError  = (message) => ({ type: APP_SET_ERROR,   message: String(message) });
export const clearError = ()        => ({ type: APP_CLEAR_ERROR });
