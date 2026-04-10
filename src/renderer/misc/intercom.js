import Intercom, { show, shutdown } from '@intercom/messenger-js-sdk';

const INTERCOM_APP_ID = 'qlx037zl';

export function initIntercom() {
    Intercom({
        app_id: INTERCOM_APP_ID,
        hide_default_launcher: true,
    });
}

export function openIntercom() {
    show();
}

export function shutdownIntercom() {
    shutdown();
}
