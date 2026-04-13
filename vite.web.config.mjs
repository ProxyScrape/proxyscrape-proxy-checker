/**
 * Vite config for web-mode development.
 *
 * Run alongside the Go backend in server mode:
 *   Terminal 1: cd backend && go run ./cmd/checker serve --mode=server --port=8080
 *   Terminal 2: npm run dev:web
 *
 * Then open http://localhost:5173 — no Electron, login screen is shown.
 */
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { createRequire } from 'module'

const _require = createRequire(import.meta.url)
const pkg = _require('./package.json')
const isCanary = pkg.version.includes('-canary')

const REQUIRED_ENV = [
    'POSTHOG_KEY',
    'POSTHOG_API_HOST',
    'POSTHOG_UI_HOST',
    'INTERCOM_APP_ID',
]

const env = loadEnv('development', process.cwd(), '')
REQUIRED_ENV.forEach(key => {
    if (!process.env[key] && env[key]) process.env[key] = env[key]
})

const rendererDefine = {
    '__IS_CANARY__': JSON.stringify(isCanary),
}
REQUIRED_ENV.forEach(key => {
    rendererDefine[`__${key}__`] = JSON.stringify(process.env[key] || '')
})

const GO_BACKEND = 'http://127.0.0.1:8080'

export default defineConfig({
    root: path.resolve(import.meta.dirname, 'src/renderer'),
    define: rendererDefine,
    plugins: [react()],
    resolve: {
        alias: {
            '@shared': path.resolve(import.meta.dirname, 'src/shared'),
            // Same shim as in electron.vite.config.mjs — all ipcRenderer calls
            // become no-ops in web mode since window.__ELECTRON__ is undefined.
            'electron': path.resolve(import.meta.dirname, 'src/renderer/electron-shim.js'),
        },
    },
    server: {
        port: 5173,
        proxy: {
            '/api': {
                target: GO_BACKEND,
                changeOrigin: true,
            },
        },
    },
})
