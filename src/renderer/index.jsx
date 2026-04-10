import axios from 'axios';
axios.defaults.adapter = 'http';

import React from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { theme } from './theme/theme';
import Main from './containers/Main';
import { Provider } from 'react-redux';
import store from './store/index';
import posthog from 'posthog-js';
import { PostHogProvider } from '@posthog/react';
import { trackLifecycle, trackScreen } from './misc/analytics';
import { ipcRenderer } from 'electron';
import { version } from '../../package.json';

import '@fontsource/montserrat/400.css';
import '@fontsource/montserrat/500.css';
import '@fontsource/montserrat/600.css';
import '@fontsource/montserrat/700.css';
import './styles/global.css';

posthog.init('phc_Fjiyo0DXsnUcEkvTOTpAgfH0omTfdXjxkiThwLRhzmP', {
    api_host: 'https://n.proxyscrape.com',
    ui_host: 'https://eu.posthog.com',
    defaults: '2026-01-30',
    person_profiles: 'always',
    persistence: 'localStorage',
});

posthog.register({
    app_version: version,
    os: process.platform,
});

trackLifecycle('opened');
trackScreen('Core');

ipcRenderer.on('app-before-quit', () => {
    trackLifecycle('closed');
});

document.body.classList.add(process.platform === 'darwin' ? 'is-mac' : 'is-win');

const root = ReactDOM.createRoot(document.getElementById('root'));

root.render(
    <PostHogProvider client={posthog}>
        <ThemeProvider theme={theme}>
            <CssBaseline />
            <Provider store={store}>
                <Main />
            </Provider>
        </ThemeProvider>
    </PostHogProvider>
);
