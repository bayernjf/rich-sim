// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import cloudflare from '@astrojs/cloudflare';

// M1: SSR (assumptions + disclaimer must be server-rendered; /api/fx proxy endpoint).
// Host: Cloudflare (see rich-sim/docs/technical-design.md §9).
export default defineConfig({
  output: 'server',
  // Canonical origin. The Pages domain rich-sim.pages.dev keeps serving the
  // same app, so without this the two hosts are duplicate content and each
  // would self-canonicalize.
  site: 'https://app.rich-sim.bayjf.com',
  adapter: cloudflare(),
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
  },
});
