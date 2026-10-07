/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { resolveSiteUrl } from './src/lib/siteUrl.ts'

// https://vite.dev/config/
export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  // CSP connect-src treats a path without a trailing slash as an exact match, so the API base
  // URL (with /api/v1) can't be used directly - only its origin is templated into index.html.
  // Same precedence as src/lib/config.ts: VITE_API_URL, then the earlier VITE_API_BASE_URL, then the local API.
  const apiOrigin = new URL(env.VITE_API_URL || env.VITE_API_BASE_URL || 'http://localhost:5280/api/v1').origin

  // A production build without a usable VITE_SITE_URL fails here, before any file is written (see src/lib/siteUrl.ts).
  const siteUrl = resolveSiteUrl(env.VITE_SITE_URL, command === 'build' && mode === 'production')

  return {
    plugins: [
      react(),
      {
        name: 'html-env',
        transformIndexHtml: (html: string) =>
          html.replace('%API_ORIGIN%', apiOrigin).replaceAll('%VITE_SITE_URL%', siteUrl),
      },
    ],
    test: {
      environment: 'jsdom',
      setupFiles: './src/test/setup.ts',
    },
  }
})
