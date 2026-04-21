import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import CircularProgress from '@mui/material/CircularProgress';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
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
    // 'error'    = backend unreachable or returned an unexpected response
    // 'login'    = server mode, no stored token → show Login screen
    // 'ready'    = all auth satisfied, render Main
    const [appState, setAppState] = useState('loading');

    // When embedded in an iframe, tell the parent our rendered height after the
    // app is ready so the parent can size the iframe to fit the content exactly,
    // avoiding both outer-page scroll and internal iframe scroll.
    useEffect(() => {
        if (window.self === window.top) return; // not in an iframe
        if (appState !== 'ready') return;

        let rafId = null;

        // document.fonts.ready resolves once all @font-face rules in the
        // document have finished downloading. Until then, text renders with
        // fallback system fonts whose metrics differ from Montserrat, so any
        // height measured before this point would be wrong.
        //
        // On repeat visits fonts are already cached: document.fonts.status is
        // 'loaded' synchronously, so fontsReady starts true and there is no
        // extra delay on those loads.
        let fontsReady = document.fonts.status === 'loaded';

        const sendHeight = () => {
            // Debounce: cancel any pending frame before scheduling a new one.
            // This prevents stale measurements when multiple resize events fire
            // in rapid succession during a layout pass.
            if (rafId !== null) cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(() => {
                rafId = null;

                // Suppress measurement until web fonts are available. The
                // document.fonts.ready handler below will call sendHeight() once
                // they are, so no measurement is lost — it is just deferred.
                if (!fontsReady) return;

                const contentRoot = document.getElementById('checker-content-root');
                if (!contentRoot) return;

                // Only report height while the Core tab (index 0) is active.
                // Other tabs can be taller; sending their height would grow the
                // iframe unnecessarily (the parent now always applies the value).
                if (contentRoot.dataset.activeTab !== '0') return;

                const scrollRoot = document.getElementById('checker-scroll-root');
                if (!scrollRoot) return;

                // Measure content height from checker-content-root, NOT from
                // scrollRoot.scrollHeight. scrollRoot.scrollHeight is clamped to
                // clientHeight (i.e. 100vh) when content fits, making it
                // viewport-dependent and unable to represent a "content is shorter
                // than the current iframe" state. That caused the iframe to stay
                // tall with black space when the window narrowed and content
                // reflowed shorter.
                //
                // checker-content-root.getBoundingClientRect().height is purely
                // content-driven: it does not change when the parent resizes the
                // iframe, so there is no growth loop risk.
                //
                // Total needed height = fixed titlebar
                //   + scrollRoot paddingTop (= TITLEBAR_HEIGHT, gap for fixed bar)
                //   + contentRoot rendered height (includes its own pt:3 padding)
                //   + scrollRoot paddingBottom (footer clearance)
                //   + 2 px subpixel buffer for high-DPR devices
                const style = getComputedStyle(scrollRoot);
                const pt = parseFloat(style.paddingTop) || 0;
                const pb = parseFloat(style.paddingBottom) || 0;
                const contentH = contentRoot.getBoundingClientRect().height;
                const height = TITLEBAR_HEIGHT + pt + contentH + pb + 2;
                window.parent.postMessage({ type: 'checker-height', height }, '*');
            });
        };

        // Once fonts are ready, mark them as loaded and trigger a measurement.
        // This fires the first accurate height message on initial page load when
        // fonts are not yet cached, replacing any suppressed early measurement.
        document.fonts.ready.then(() => {
            fontsReady = true;
            sendHeight();
        });

        // Observe the inner content element so the observer fires only when
        // content changes size, not when the parent adjusts the iframe height.
        // (Observing document.documentElement would restart the growth loop.)
        const contentRoot = document.getElementById('checker-content-root');
        const ro = new ResizeObserver(sendHeight);
        ro.observe(contentRoot || document.documentElement);
        window.addEventListener('resize', sendHeight);

        return () => {
            ro.disconnect();
            window.removeEventListener('resize', sendHeight);
            if (rafId !== null) cancelAnimationFrame(rafId);
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
            // Step 1: identify the backend mode.
            // If the backend is unreachable or returns an error, show the error
            // screen — the login screen would also fail in that case, so falling
            // back silently is misleading.
            try {
                await initMode();
            } catch (err) {
                console.error('[app] backend unreachable:', err.message);
                setAppState('error');
                return;
            }

            // Step 2: mode is known — complete session setup.
            try {
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
                setAppState('login');
            }
        })();
    }, [isDesktop]);

    if (appState === 'loading') {
        return (
            <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'background.default' }}>
                <CircularProgress size={32} />
            </Box>
        );
    }

    if (appState === 'error') {
        return (
            <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'background.default', p: 3 }}>
                <Box sx={{ maxWidth: 360, textAlign: 'center' }}>
                    <Typography variant="h6" sx={{ mb: 1, fontWeight: 700 }}>
                        Service Unavailable
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3, lineHeight: 1.7 }}>
                        The checker service could not be reached. Please try again in a moment.
                    </Typography>
                    <Button variant="outlined" onClick={() => window.location.reload()}>
                        Retry
                    </Button>
                </Box>
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
