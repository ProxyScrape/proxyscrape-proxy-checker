import { UI_OPEN_DRAWER, UI_CLOSE_DRAWER, UI_OPEN_DETAILS, UI_CLOSE_DETAILS } from '../../constants/ActionTypes';

// Single source of truth for which slideout drawer is visible.
// Opening any drawer automatically clears all others — no per-drawer
// cross-wiring needed when new drawers are added in the future.
const initialState = {
    activeDrawer: null,  // 'info' | 'countries' | null
    activeDetails: null, // { host, port } | null — the proxy details drawer
};

const ui = (state = initialState, action) => {
    switch (action.type) {
        case UI_OPEN_DRAWER:
            return { activeDrawer: action.drawer, activeDetails: null };
        case UI_CLOSE_DRAWER:
            return { ...state, activeDrawer: null };
        case UI_OPEN_DETAILS:
            return { activeDrawer: null, activeDetails: action.details };
        case UI_CLOSE_DETAILS:
            return { ...state, activeDetails: null };
        default:
            return state;
    }
};

export default ui;
