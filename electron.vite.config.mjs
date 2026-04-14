import { defineConfig, loadEnv } from 'electron-vite'
import react from '@vitejs/plugin-react'
import electronRendererPlugin from 'vite-plugin-electron-renderer'
import path from 'path'
import { createRequire } from 'module'

const _require = createRequire(import.meta.url)
const pkg = _require('./package.json')
const IS_CANARY = pkg.version.includes('-canary')

const REQUIRED_ENV = [
  'POSTHOG_KEY',
  'POSTHOG_API_HOST',
  'POSTHOG_UI_HOST',
  'INTERCOM_APP_ID',
]

const isBuild = process.argv.includes('build')

const env = loadEnv(isBuild ? 'production' : 'development', __dirname, '')
REQUIRED_ENV.forEach(key => {
  if (!process.env[key] && env[key]) process.env[key] = env[key]
})

if (isBuild) {
  const missing = REQUIRED_ENV.filter(key => !process.env[key])
  if (missing.length > 0) {
    console.error('\n\x1b[31mBuild failed: missing required environment variables:\x1b[0m')
    missing.forEach(key => console.error(`  - ${key}`))
    console.error('\nSet them via .env file or inline, e.g.:')
    console.error('  POSTHOG_KEY=phc_xxx POSTHOG_API_HOST=https://... POSTHOG_UI_HOST=https://... INTERCOM_APP_ID=xxx npm run build\n')
    process.exit(1)
  }
}

const rendererDefine = {
  // Replace process.env references in shared files so the renderer never accesses
  // the Node.js `process` global, which is not defined in a browser context.
  'process.env.NODE_ENV': JSON.stringify(isBuild ? 'production' : 'development'),
  'process.env.PORTABLE_EXECUTABLE_DIR': 'undefined',
  '__IS_CANARY__': JSON.stringify(IS_CANARY),
}
REQUIRED_ENV.forEach(key => {
  rendererDefine[`__${key}__`] = JSON.stringify(process.env[key] || '')
})

export default defineConfig({
  main: {
    build: {
      outDir: path.resolve(__dirname, 'dist/main'),
      rollupOptions: {
        input: path.resolve(__dirname, 'src/main/index.js')
      }
    },
    define: {
      '__IS_CANARY__': JSON.stringify(IS_CANARY),
      // Bake NODE_ENV into the main bundle the same way the renderer does,
      // so isDev (from AppConstants.js) is correct at runtime in packaged builds.
      // Without this, process.env.NODE_ENV is undefined in the packaged main
      // process, isDev evaluates to true, and DevTools opens on every launch.
      'process.env.NODE_ENV': JSON.stringify(isBuild ? 'production' : 'development'),
    },
    resolve: {
      alias: {
        '@shared': path.resolve(__dirname, 'src/shared')
      }
    }
  },
  preload: {
    build: {
      outDir: path.resolve(__dirname, 'dist/preload'),
      rollupOptions: {
        input: path.resolve(__dirname, 'src/preload/index.js')
      }
    }
  },
  renderer: {
    root: path.resolve(__dirname, 'src/renderer'),
    build: {
      // outDir must be absolute (or relative to project root, not to `root`).
      // Without this, Vite resolves outDir relative to the renderer `root`
      // (src/renderer), producing src/renderer/dist/renderer/ instead of
      // dist/renderer/. That wrong path is never picked up by upload-artifact
      // or electron-builder's files glob, so the renderer never reaches the ASAR.
      outDir: path.resolve(__dirname, 'dist/renderer'),
      rollupOptions: {
        input: path.resolve(__dirname, 'src/renderer/index.html')
      }
    },
    define: rendererDefine,
    plugins: [
      react(),
      electronRendererPlugin()
    ],
    resolve: {
      alias: {
        '@shared': path.resolve(__dirname, 'src/shared'),
        // Route `import { ipcRenderer } from 'electron'` to the contextBridge shim.
        // The alias takes priority over electronRendererPlugin's virtual module.
        // The plugin still runs to polyfill Node built-ins (fs, path, etc.).
        'electron': path.resolve(__dirname, 'src/renderer/electron-shim.js'),
      }
    }
  }
})
