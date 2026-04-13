/**
 * Single entry point for HTTP + SSE calls to the Go checker API.
 * Desktop: base URL and token come from contextBridge ({@link window.__ELECTRON__}).
 * Web: same-origin relative URLs and session token in localStorage.
 */

/** @returns {boolean} True when running inside Electron with the preload bridge. */
export const isDesktop = typeof window !== 'undefined' && typeof window.__ELECTRON__ !== 'undefined';

/**
 * @returns {string} Base URL for API requests (e.g. http://127.0.0.1:PORT) or '' for same-origin web.
 */
export function getApiBase() {
  if (isDesktop && window.__ELECTRON__.apiBase != null) {
    return String(window.__ELECTRON__.apiBase).replace(/\/$/, '');
  }
  return '';
}

const SESSION_KEY = 'checker_session';

/**
 * Bearer token for Authorization header and SSE query param.
 * @returns {string|null}
 */
export function getToken() {
  if (isDesktop && window.__ELECTRON__.token != null) {
    return String(window.__ELECTRON__.token);
  }
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage.getItem(SESSION_KEY);
  }
  return null;
}

/**
 * Builds an absolute URL for a path like `/api/version`.
 * @param {string} path Path beginning with `/`
 */
function resolveUrl(path) {
  const base = getApiBase();
  if (!path.startsWith('/')) {
    path = '/' + path;
  }
  if (!base) {
    return path;
  }
  return base + path;
}

/**
 * Parses JSON from a Response body; falls back to text if not JSON.
 * @param {Response} response
 * @returns {Promise<any>}
 */
async function parseResponseBody(response) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return text || null;
  }
}

/**
 * Authenticated fetch wrapper: injects Bearer token, resolves base URL, returns parsed JSON.
 *
 * @param {string} path API path (e.g. `/api/settings`)
 * @param {RequestInit} [options] Passed to fetch; headers are merged with defaults
 * @returns {Promise<any>} Parsed JSON body (or null if empty 204)
 * @throws {Error} On network failure or non-OK HTTP status; message includes server body when possible
 */
export async function apiFetch(path, options = {}) {
  const url = resolveUrl(path);
  const token = getToken();

  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body != null && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', 'Bearer ' + token);
  }

  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers
    });
  } catch (err) {
    const msg = err && err.message ? err.message : 'Network error';
    const e = new Error(msg);
    e.cause = err;
    throw e;
  }

  const data = await parseResponseBody(response);

  if (!response.ok) {
    let message =
      (data && typeof data === 'object' && data.error) ||
      (data && typeof data === 'object' && data.message) ||
      (typeof data === 'string' && data) ||
      response.statusText ||
      'Request failed';

    if (response.status === 401) {
      message = typeof message === 'string' ? message : 'Unauthorized';
      if (!message.toLowerCase().includes('unauth')) {
        message = 'Unauthorized: ' + message;
      }
    }

    const err = new Error(message);
    err.status = response.status;
    err.body = data;
    throw err;
  }

  return data;
}

/**
 * Opens the SSE stream for a running check. EventSource cannot send Authorization headers,
 * so the token is appended as a query parameter (allowed for this endpoint only).
 *
 * @param {string} checkId Check UUID
 * @param {object} handlers Optional callbacks:
 *   onResult    – called for each proxy result as it arrives
 *   onProgress  – called with running counters (done, total, working, threads)
 *   onComplete  – check ran to natural completion (all proxies were checked)
 *   onStopped   – check was cancelled by the user mid-run
 *   onBackendError – server sent an SSE error frame (e.g. store read failed)
 *   onError     – native EventSource connection-level error
 * @param {string|null} [token] Bearer token (defaults to {@link getToken})
 * @returns {function} Call to close the EventSource
 */
export function openCheckStream(checkId, handlers = {}, token) {
  const authToken = token !== undefined && token !== null ? token : getToken();
  const base = getApiBase();
  const path = `/api/check/${encodeURIComponent(checkId)}/events`;
  let url = base ? base + path : path;
  if (authToken) {
    const sep = url.includes('?') ? '&' : '?';
    url = url + sep + 'token=' + encodeURIComponent(authToken);
  }

  const es = new EventSource(url);

  const safe = (fn, payload) => {
    try {
      if (typeof fn === 'function') {
        fn(payload);
      }
    } catch (err) {
      if (typeof handlers.onError === 'function') {
        handlers.onError(err);
      } else {
        console.error('openCheckStream handler error:', err);
      }
    }
  };

  const parseData = raw => {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  };

  const attach = (eventName, key) => {
    es.addEventListener(eventName, ev => {
      const data = parseData(ev.data);
      const fn = handlers[key];
      safe(fn, data);
    });
  };

  attach('result', 'onResult');
  attach('progress', 'onProgress');
  attach('complete', 'onComplete');
  attach('stopped', 'onStopped');
  // Server-sent `event: error` from the backend (a named SSE event with a data
  // payload) is captured here. This is distinct from the native EventSource
  // connection-level error handled by es.onerror below.
  attach('error', 'onBackendError');

  es.onerror = err => {
    if (typeof handlers.onError === 'function') {
      handlers.onError(err);
    }
  };

  return function cleanup() {
    es.close();
  };
}
