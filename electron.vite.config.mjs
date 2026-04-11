import { defineConfig, loadEnv } from 'electron-vite'
import react from '@vitejs/plugin-react'
import electronRendererPlugin from 'vite-plugin-electron-renderer'
import path from 'path'

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

const rendererDefine = {}
REQUIRED_ENV.forEach(key => {
  rendererDefine[`__${key}__`] = JSON.stringify(process.env[key] || '')
})

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: path.resolve(__dirname, 'src/main/index.js'),
        external: ['better-sqlite3']
      }
    },
    resolve: {
      alias: {
        '@shared': path.resolve(__dirname, 'src/shared')
      }
    }
  },
  preload: {
    build: {
      rollupOptions: {
        input: path.resolve(__dirname, 'src/preload/index.js')
      }
    }
  },
  renderer: {
    root: path.resolve(__dirname, 'src/renderer'),
    build: {
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
        'axios': path.resolve(__dirname, 'node_modules/axios/dist/node/axios.cjs')
      }
    }
  }
})
