import { defineConfig, devices } from '@playwright/test'

// The hash of the dev code STEADY-DEMO-0000-0000-0001 (docs/DEV.md). A production build
// without hashes fails closed, so the E2E build gets the dev hash from here, never .env.
const DEV_UNLOCK_HASH = '3b9b0537d36c46fd9064a9fa1fb9029e63b573c0c98336a85e8ff9e3a01123f6'

// 390 x 844 is an iPhone 13/14: the size the app is designed for first. Desktop UAs on
// purpose: a phone UA would put WebKit behind the iOS install screen (PLAN §6), which
// Playwright cannot get past the way a real home-screen install does.
const phone = { viewport: { width: 390, height: 844 } }

// EU-first app: run in an EU locale and zone so money is € and "today" is CET/CEST.
const eu = { locale: 'en-IE', timezoneId: 'Europe/Berlin' }

// Parallel worktrees each pass their own E2E_PORT / E2E_DEMO_PORT. Reusing a server is then
// off: on a shared port it could be another checkout's build, and tests would pass against it.
const PORT = Number(process.env.E2E_PORT ?? 4173)
const DEMO_PORT = Number(process.env.E2E_DEMO_PORT ?? 4174)
const reuse = !process.env.CI && !process.env.E2E_PORT

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    trace: 'retain-on-failure',
    ...eu,
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: /demo\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], ...phone, baseURL: `http://localhost:${PORT}` },
    },
    {
      name: 'webkit',
      testIgnore: /demo\.spec\.ts/,
      use: { ...devices['Desktop Safari'], ...phone, baseURL: `http://localhost:${PORT}` },
    },
    {
      // The demo build is its own origin and bundle (PLAN §7): no lock, no service worker.
      name: 'demo',
      testMatch: /demo\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], ...phone, baseURL: `http://localhost:${DEMO_PORT}` },
    },
  ],
  webServer: [
    {
      command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
      url: `http://localhost:${PORT}`,
      env: { VITE_UNLOCK_HASHES: DEV_UNLOCK_HASH },
      reuseExistingServer: reuse,
      timeout: 180_000,
    },
    {
      // Its own outDir so it can build next to the full app without clobbering dist/.
      command: `npx vite build --mode demo --outDir dist-demo && node scripts/check-demo.mjs dist-demo && npx vite preview --mode demo --outDir dist-demo --port ${DEMO_PORT} --strictPort`,
      url: `http://localhost:${DEMO_PORT}`,
      reuseExistingServer: reuse,
      timeout: 180_000,
    },
  ],
})
