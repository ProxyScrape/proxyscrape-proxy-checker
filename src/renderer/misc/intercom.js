import Intercom, { show, shutdown } from '@intercom/messenger-js-sdk';

/* global __INTERCOM_APP_ID__ */

const isElectron = typeof window !== 'undefined' && !!window.__ELECTRON__;

let initialized = false;

export function initIntercom() {
    if (!isElectron || !__INTERCOM_APP_ID__) return;
    Intercom({
        app_id: __INTERCOM_APP_ID__,
        hide_default_launcher: true,
    });
    initialized = true;
}

export function openIntercom() {
    if (!initialized) return;
    show();
}

export function shutdownIntercom() {
    if (!initialized) return;
    shutdown();
}
