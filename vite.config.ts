/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath } from 'node:url'

const pwaStub = fileURLToPath(new URL('./src/lib/pwaStub.ts', import.meta.url))
const unlockStub = fileURLToPath(new URL('./src/unlock/unlock.stub.ts', import.meta.url))

export default defineConfig(({ mode }) => {
  // Hashes are not in the shared .env (PLAN §7): a production build without them from
  // the host locks everyone out. Say so loudly instead of shipping that by surprise.
  if (mode === 'production' && !loadEnv(mode, process.cwd(), 'VITE_').VITE_UNLOCK_HASHES) {
    console.warn('\n[steady] VITE_UNLOCK_HASHES is empty: no code will unlock this build.\n')
  }
  return {
    // Its own folder, so a demo build can never be deployed as (or over) the full app.
    build: { outDir: mode === 'demo' ? 'dist-demo' : 'dist' },
    resolve: {
      alias: [
        // No service worker in the demo or in unit tests, so the register hook is a no-op.
        ...(mode === 'demo' || mode === 'test'
          ? [{ find: 'virtual:pwa-register/react', replacement: pwaStub }]
          : []),
        // The demo has no lock and must not carry a single hash (PLAN §7): every import of
        // src/unlock/unlock resolves to the stub, so the real module is never bundled.
        ...(mode === 'demo' ? [{ find: /^.*\/unlock\/unlock$/, replacement: unlockStub }] : []),
      ],
    },
    plugins: [
      react(),
      tailwindcss(),
      // The demo lives on its own origin with no service worker (PLAN §7): a cached demo
      // would keep serving stale sample data long after the buyer moved to the full app.
      mode !== 'demo' &&
        mode !== 'test' &&
        VitePWA({
          // 'prompt': a new SW waits until the user taps "Refresh now", so a page never
          // swaps code under someone mid-entry.
          registerType: 'prompt',
          strategies: 'generateSW',
          injectRegister: false,
          // The glob below already picks up the PNG/SVG icons; listing them here too would
          // precache each one twice. Only .ico falls outside the glob.
          includeAssets: ['favicon.ico'],
          // Same reason: the glob already has the manifest icons.
          includeManifestIcons: false,
          manifest: {
            name: 'Steady Payday Planner',
            short_name: 'Steady',
            description: 'How much can I spend today, and until payday?',
            display: 'standalone',
            start_url: '/?source=pwa',
            scope: '/',
            background_color: '#FAF7F2',
            theme_color: '#FAF7F2',
            icons: [
              { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
              { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
              {
                src: 'maskable-icon-512x512.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'maskable',
              },
            ],
          },
          workbox: {
            // webmanifest is left out because the plugin precaches it itself (PLAN §6 lists it).
            globPatterns: ['**/*.{js,css,html,woff2,png,svg}'],
            navigateFallback: '/index.html',
            // Everything is precached; there is no API to cache at runtime.
            runtimeCaching: [],
          },
        }),
    ],
    test: {
      include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
      setupFiles: ['src/test/setup.ts'],
    },
  }
})
