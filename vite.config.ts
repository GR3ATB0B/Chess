import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

// BASE lets the same build serve from a subpath (GitHub Pages: /Chess/)
// or a root domain (Cloudflare Pages: /).
const base = process.env.BASE ?? '/';

export default defineConfig({
  base,
  build: { target: 'es2022', sourcemap: true },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['icon.svg', 'apple-touch-icon.png', 'engine/COPYING.txt'],
      manifest: {
        name: 'Trivium Chess',
        short_name: 'Trivium',
        description: 'Learn chess by understanding why things work.',
        start_url: base,
        scope: base,
        display: 'standalone',
        background_color: '#f6f2ea',
        theme_color: '#f6f2ea',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        // Precache everything, including the Stockfish worker and its WASM,
        // so the whole course works offline after the first visit.
        globPatterns: ['**/*.{js,css,html,svg,png,wasm,txt,webmanifest}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: 'index.html',
      },
    }),
  ],
  test: { include: ['tests/**/*.test.ts'] },
});
