/// <reference types="vitest/config" />
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// In development, /api is proxied to the API on :8080 by default (`flask run`, or the compose
// stack's Nginx), so the app and the API share an origin, exactly as in production, and the
// SameSite=Strict refresh cookie works.
const apiTarget = process.env.FORGE_API_ORIGIN ?? 'http://127.0.0.1:8080'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  build: {
    // Vite inlines small assets as data: URIs, which the CSP (font-src 'self') refuses: the small
    // font subsets would be blocked and logged. Fonts are always separate files.
    assetsInlineLimit: (file) => (/\.woff2?$/.test(file) ? false : undefined),
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: apiTarget, changeOrigin: false },
      '/media': { target: apiTarget, changeOrigin: false },
    },
  },
  // `vite preview` serves the production build the same way (used by the end-to-end tests in CI).
  preview: {
    port: 4173,
    proxy: {
      '/api': { target: apiTarget, changeOrigin: false },
      '/media': { target: apiTarget, changeOrigin: false },
    },
  },
  test: {
    environment: 'jsdom',
    // App-level tests render the whole route tree (shell included); allow more than the 5 s default.
    testTimeout: 15_000,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // Stylesheets are stubbed in tests, except the token file, which the contrast test reads.
    css: { include: [/tokens\.css/] },
  },
})
