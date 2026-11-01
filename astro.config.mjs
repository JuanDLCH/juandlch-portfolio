// @ts-check
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';

import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  // Old per-language URLs keep working and pick the language.
  redirects: {
    '/en': '/?lang=en',
    '/es': '/?lang=es',
  },
  integrations: [react()],

  vite: {
    plugins: [tailwindcss()],
    // Keep small images as separate files so loading="lazy" actually defers them.
    build: { assetsInlineLimit: 0 },
    // Dev only: the voice API runs in `pnpm dev:api` (wrangler, worker/).
    server: { proxy: { '/api': 'http://localhost:8787' } },
  },
});
