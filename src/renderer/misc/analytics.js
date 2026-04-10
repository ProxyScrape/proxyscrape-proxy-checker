import posthog from 'posthog-js';

const BASE = { platform: 'desktop' };

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
