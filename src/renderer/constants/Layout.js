import { IS_CANARY } from '../../shared/AppConstants';

/** Height of the custom window titlebar + tabs (must match CSS `.titlebar`). */
export const TITLEBAR_HEIGHT = 38;

/** Approximate height of the fixed footer bar. */
export const FOOTER_HEIGHT = 115;

/** Height of the canary warning banner shown above the footer on canary builds. */
export const CANARY_BANNER_HEIGHT = 40;

/** Height of the guest-mode upsell banner shown above the footer in guest mode. */
export const GUEST_BANNER_HEIGHT = 40;

/**
 * Returns the correct `bottom` offset (px) for fixed toast cards.
 *
 * When the checker overlay is open the footer is visually hidden, so toasts
 * sit 12 px above the viewport bottom. When it is closed they sit above the
 * footer (+ optional canary/guest banner) as normal.
 *
 * @param {boolean} checkingOpen - true when state.checking.opened is true
 * @param {boolean} isGuest - true when running in guest mode
 */
export const getToastBottom = (checkingOpen, isGuest = false) =>
    checkingOpen
        ? 12
        : FOOTER_HEIGHT + (IS_CANARY ? CANARY_BANNER_HEIGHT : 0) + (isGuest ? GUEST_BANNER_HEIGHT : 0) + 12;
