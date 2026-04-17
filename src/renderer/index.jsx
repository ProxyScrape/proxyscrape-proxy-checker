import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
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
    });

    posthog.register({
        app_version: version,
        os: window.__ELECTRON__?.platform ?? 'web',
    });
}

trackLifecycle('opened');
trackScreen('Core');
initIntercom();

store.dispatch(loadSettings());

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

function AppRoot() {
    const isWeb = typeof window !== 'undefined' && !window.__ELECTRON__;
    const [webSessionReady, setWebSessionReady] = useState(() => {
        if (typeof window === 'undefined') {
            return true;
        }
        if (window.__ELECTRON__) {
            return true;
        }
        const token = window.localStorage.getItem('checker_session');
        return Boolean(token && String(token).length > 0);
    });

    if (isWeb && !webSessionReady) {
        return <Login onSuccess={() => setWebSessionReady(true)} />;
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
