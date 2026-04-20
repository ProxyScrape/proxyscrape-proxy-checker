/**
 * Runtime mode detection for the proxy checker UI.
 *
 * Modes:
 *   desktop  – running inside Electron (window.__ELECTRON__ present)
 *   server   – web build, classic username/password login
 *   guest    – web build, anonymous HttpOnly-cookie sessions, no login needed,
 *              settings and judges are read-only
 *
 * isGuestMode() returns true when the backend reported mode="guest".
 * The value is set once by initMode() during app startup and cached in module
 * scope so that components can read it synchronously after init.
 */

let _mode = null;   // null = unknown (initMode not yet called)
let _limits = null; // non-null only in guest mode; set by initMode

/**
 * Fetch the server run mode (and guest limits) from GET /api/mode and cache
 * both. Must be called before rendering the app.
 * @returns {Promise<'desktop'|'server'|'guest'>}
 */
export async function initMode() {
    if (typeof window !== 'undefined' && window.__ELECTRON__) {
        _mode = 'desktop';
        return _mode;
    }
    try {
        const res = await fetch('/api/mode');
        if (res.ok) {
            const data = await res.json();
            _mode = data && data.mode ? String(data.mode) : 'server';
            _limits = (data && data.limits) ? data.limits : null;
        } else {
            _mode = 'server';
        }
    } catch {
        _mode = 'server';
    }
    return _mode;
}

/**
 * @returns {string} Current mode ('desktop' | 'server' | 'guest').
 * Returns 'server' if initMode() has not been called yet.
 */
export function getMode() {
    if (_mode === null) {
        return 'server';
    }
    return _mode;
}

/** Convenience helper: true when running in guest (anonymous session) mode. */
export function isGuestMode() {
    return getMode() === 'guest';
}

/**
 * Returns the backend-reported limits for guest mode, or null in all other
 * modes. Shape: { inFlightProxies: number }
 *
 * Only valid after initMode() has resolved.
 * @returns {{ inFlightProxies: number }|null}
 */
export function getGuestLimits() {
    return _limits;
}
