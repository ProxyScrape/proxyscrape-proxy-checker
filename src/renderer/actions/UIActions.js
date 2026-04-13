import { UI_OPEN_DRAWER, UI_CLOSE_DRAWER, UI_OPEN_DETAILS, UI_CLOSE_DETAILS } from '../constants/ActionTypes';

export const openDrawer = drawer => ({ type: UI_OPEN_DRAWER, drawer });
export const closeDrawer = () => ({ type: UI_CLOSE_DRAWER });

export const openDetails = (host, port) => ({ type: UI_OPEN_DETAILS, details: { host, port } });
export const closeDetails = () => ({ type: UI_CLOSE_DETAILS });
