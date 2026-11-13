// @ts-check
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';

import tailwindcss from '@tailwindcss/vite';
import { adminProxy } from './scripts/admin-proxy.mjs';

// https://astro.build/config
export default defineConfig({
  // Production origin: absolute URLs for link previews (og:image, canonical).
  site: 'https://juandlch.dev',
  // Per-language URLs pick the language. In production the Worker answers
  // them first with a real 301 (crawlers don't follow these meta refreshes).
  redirects: {
    '/en': '/?lang=en',
    '/es': '/?lang=es',
  },
  integrations: [react()],

  vite: {
    plugins: [tailwindcss()],
    // Keep small images as separate files so loading="lazy" actually defers them.
    build: { assetsInlineLimit: 0 },
    // Dev only: the lab APIs run in `pnpm dev:api` (wrangler, worker/).
    server: {
      proxy: {
        '/api': 'http://localhost:8787',
        '/admin/api': adminProxy,
        '/cv': 'http://localhost:8787',
        // The profile photo is public and read-only: show production's, so
        // dev matches the site without the Worker (to try uploads, open the
        // Worker itself: localhost:8787/admin).
        '/media': { target: 'https://juandlch.dev', changeOrigin: true },
      },
    },
  },
});
