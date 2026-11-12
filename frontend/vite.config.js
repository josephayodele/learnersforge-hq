import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// HQ dashboard. In production the app is served at hq.learnersforge.com and calls
// /api on the same origin (symlinked to the PHP backend). For local dev, run the
// backend with:  php -S localhost:8787 -t backend/public
// and the proxy below forwards /api to it.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/api': { target: 'http://localhost:8787', changeOrigin: true },
    },
  },
  build: { outDir: 'dist' },
})
