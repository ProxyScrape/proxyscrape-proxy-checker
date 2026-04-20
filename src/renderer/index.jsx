import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import CircularProgress from '@mui/material/CircularProgress';
import Box from '@mui/material/Box';
import { theme } from './theme/theme';
import Main from './containers/Main';
import Login from './containers/Login';
import { Provider } from 'react-redux';
import store from './store/index';
import posthog from 'posthog-js';
import { PostHogProvider } from '@posthog/react';
import { trackLifecycle, trackScreen } from './misc/analytics';
import { initIntercom, shutdownIntercom } from './misc/intercom';
import { ipcRenderer } from 'electron';
import { version } from '../../package.json';
import { loadSettings } from './actions/SettingsActions';
import { reconnectIfRunning } from './actions/CheckingActions';
import { initMode, isGuestMode } from './misc/mode';
import { TITLEBAR_HEIGHT } from './constants/Layout';

import '@fontsource/montserrat/400.css';
import '@fontsource/montserrat/500.css';
import '@fontsource/montserrat/600.css';
import '@fontsource/montserrat/700.css';
import './styles/global.css';

/* global __POSTHOG_KEY__ __POSTHOG_API_HOST__ __POSTHOG_UI_HOST__ */

if (__POSTHOG_KEY__) {
    posthog.init(__POSTHOG_KEY__, {
        api_host: __POSTHOG_API_HOST__,
        ui_host: __POSTHOG_UI_HOST__,
        defaults: '2026-01-30',
        person_profiles: 'always',
        persistence: 'localStorage',
        // We use manual trackScreen() calls — disable auto pageview capture.
        // defaults:'2026-01-30' would set this to 'history_change' without this override.
        capture_pageview: false,
    });

    const isElectron = typeof window !== 'undefined' && !!window.__ELECTRON__;
    const isInIframe = window.self !== window.top;

    const superProps = {
        app_version: version,
        platform: isElectron ? 'desktop' : 'web',
        os: window.__ELECTRON__?.platform ?? 'web',
    };

    // When embedded in an iframe, record the parent page's hostname so events
    // can be attributed to the embedding site. document.referrer is used because
    // window.top.location is inaccessible in cross-origin iframes.
    if (isInIframe) {
        try {
            superProps.iframe_host = document.referrer
                ? new URL(document.referrer).hostname
                : 'unknown';
        } catch {
            superProps.iframe_host = 'unknown';
        }
    }

    posthog.register(superProps);
}

trackLifecycle('opened');
trackScreen('Core');
initIntercom();

if (typeof window !== 'undefined' && window.__ELECTRON__ && ipcRenderer && ipcRenderer.on) {
    ipcRenderer.on('app-before-quit', () => {
        trackLifecycle('closed');
        shutdownIntercom();
    });
}

// Use the platform value exposed by the preload — process.platform is not
// reliably accessible in the renderer under contextIsolation.
const platform = window.__ELECTRON__?.platform === 'darwin' ? 'is-mac' : 'is-win';
document.body.classList.add(platform);

/**
 * Bootstrap a guest session by POSTing to /api/guest/session.
 * The server sets the HttpOnly cookie and we only need the call to succeed.
 * A 2xx response means the cookie is set (new or refreshed).
 * On any failure we proceed anyway — the cookie may already be present from a
 * prior visit, and the backend will return 401 if not, which is handled later.
 */
async function bootstrapGuestSession() {
    try {
        const res = await fetch('/api/guest/session', { method: 'POST', credentials: 'same-origin' });
        if (!res.ok) {
            console.warn('[guest] session bootstrap returned', res.status);
        }
    } catch (err) {
        console.warn('[guest] session bootstrap network error:', err);
    }
}

function AppRoot() {
    const isDesktop = typeof window !== 'undefined' && Boolean(window.__ELECTRON__);
    const isWeb = typeof window !== 'undefined' && !isDesktop;

    // 'loading'  = mode fetch + optional session bootstrap in progress
    // 'login'    = server mode, no stored token → show Login screen
    // 'ready'    = all auth satisfied, render Main
    const [appState, setAppState] = useState('loading');

    // When embedded in an iframe, tell the parent our rendered height after the
    // app is ready so the parent can size the iframe to fit the content exactly,
    // avoiding both outer-page scroll and internal iframe scroll.
    useEffect(() => {
        if (window.self === window.top) return; // not in an iframe
        if (appState !== 'ready') return;

        const sendHeight = () => {
            // The app uses a fixed-height inner scroll container, so
            // document.documentElement.scrollHeight always equals the iframe's
            // current height (not the content's natural height). Instead we
            // measure the scroll container's true content height and add the
            // titlebar that sits above it.
            const scrollRoot = document.getElementById('checker-scroll-root');
            // Add 2px to absorb subpixel rounding on high-DPR devices (e.g. Samsung
            // phones with DPR 2.625). scrollHeight is an integer rounded down from the
            // true physical-pixel height, which can leave the iframe 1px short and
            // produce a hairline scrollbar only visible on real hardware.
            const height = scrollRoot
                ? TITLEBAR_HEIGHT + scrollRoot.scrollHeight + 2
                : document.documentElement.scrollHeight + 2;
            window.parent.postMessage({ type: 'checker-height', height }, '*');
        };

        // ResizeObserver fires when the rendered content changes size (e.g. after
        // fonts/images load). window resize also triggers a new measurement.
        const ro = new ResizeObserver(sendHeight);
        ro.observe(document.documentElement);
        window.addEventListener('resize', sendHeight);

        return () => {
            ro.disconnect();
            window.removeEventListener('resize', sendHeight);
        };
    }, [appState]);

    useEffect(() => {
        if (isDesktop) {
            // Desktop: token comes from Electron preload — load settings and go.
            store.dispatch(loadSettings());
            setAppState('ready');
            return;
        }

        (async () => {
            try {
                await initMode();

                if (isGuestMode()) {
                    // Bootstrap the anonymous session (idempotent — server
                    // reuses existing cookie if it is still valid).
                    await bootstrapGuestSession();
                    store.dispatch(loadSettings());
                    // Reconnect to any check that was still running when the
                    // user last left or refreshed the page. The server replays
                    // all results produced so far, so the overlay opens with
                    // the correct progress immediately.
                    await store.dispatch(reconnectIfRunning());
                    setAppState('ready');
                    return;
                }

                // Server mode: require a stored session token.
                const token = window.localStorage.getItem('checker_session');
                if (token && String(token).length > 0) {
                    store.dispatch(loadSettings());
                    setAppState('ready');
                } else {
                    setAppState('login');
                }
            } catch (err) {
                console.error('[app] startup failed:', err);
                // Fall back to login screen on unexpected errors.
                setAppState('login');
            }
        })();
    }, [isDesktop]);

    if (appState === 'loading') {
        return (
            <Box
                sx={{
                    minHeight: '100vh',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    bgcolor: 'background.default',
                }}
            >
                <CircularProgress size={32} />
            </Box>
        );
    }

    if (isWeb && appState === 'login') {
        return <Login onSuccess={() => { store.dispatch(loadSettings()); setAppState('ready'); }} />;
    }

    return (
        <Provider store={store}>
            <Main />
        </Provider>
    );
}

const root = ReactDOM.createRoot(document.getElementById('root'));

root.render(
    <PostHogProvider client={posthog}>
        <ThemeProvider theme={theme}>
            <CssBaseline />
            <AppRoot />
        </ThemeProvider>
    </PostHogProvider>
);
