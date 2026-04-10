import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import electronRendererPlugin from 'vite-plugin-electron-renderer'
import path from 'path'

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: path.resolve(__dirname, 'src/main/index.js')
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
