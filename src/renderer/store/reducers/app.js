import { APP_SET_ERROR, APP_CLEAR_ERROR } from '../../constants/ActionTypes';

const initialState = {
    error:    null, // string | null
    errorCta: null, // { label: string, href: string } | null
};

export default function app(state = initialState, action) {
    switch (action.type) {
        case APP_SET_ERROR:   return { ...state, error: action.message, errorCta: action.cta ?? null };
        case APP_CLEAR_ERROR: return { ...state, error: null, errorCta: null };
        default:              return state;
    }
}

export const showError        = (message)      => ({ type: APP_SET_ERROR, message: String(message), cta: null });
export const showErrorWithCta = (message, cta) => ({ type: APP_SET_ERROR, message: String(message), cta });
export const clearError       = ()             => ({ type: APP_CLEAR_ERROR });
