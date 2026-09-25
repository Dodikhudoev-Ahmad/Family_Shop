/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  // CSP connect-src treats a path without a trailing slash as an exact match, so the API base
  // URL (with /api/v1) can't be used directly - only its origin is templated into index.html.
  const apiOrigin = new URL(env.VITE_API_BASE_URL ?? 'http://localhost:5280/api/v1').origin

  return {
    plugins: [
      react(),
      { name: 'csp-api-origin', transformIndexHtml: (html: string) => html.replace('%API_ORIGIN%', apiOrigin) },
    ],
    test: {
      environment: 'jsdom',
      setupFiles: './src/test/setup.ts',
    },
  }
})
