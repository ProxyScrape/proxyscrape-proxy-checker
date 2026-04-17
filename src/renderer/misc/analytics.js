import posthog from 'posthog-js';
import { version } from '../../../package.json';

// BASE is spread into every event. Add any property here to ensure it appears
// on all events — new tracking helpers must also spread BASE.
// Note: app_version and os are also registered as PostHog super properties in
// index.jsx (posthog.register), which covers any posthog.capture() calls made
// outside this module.
const BASE = {
    platform: 'desktop',
    app_version: version,
};

let checkStartedAt = null;

export const trackScreen = (screenName) => {
    posthog.capture('proxychecker_screenviewed', { ...BASE, screen_name: screenName });
};

export const trackAction = (actionType, extra = {}) => {
    if (actionType === 'proxy_check_started') {
        checkStartedAt = Date.now();
    }

    if (actionType === 'proxy_check_completed' && checkStartedAt) {
        extra.check_duration_seconds = Math.round((Date.now() - checkStartedAt) / 1000);
        checkStartedAt = null;
    }

    posthog.capture('proxychecker_action', { ...BASE, action_type: actionType, ...extra });
};

export const trackLifecycle = (stage) => {
    posthog.capture('proxychecker_lifecycle', { ...BASE, lifecycle_stage: stage });
};
