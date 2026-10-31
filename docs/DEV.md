# Developer notes

## Unlock code

The full app opens on an unlock screen, in dev too (PLAN §7). Use the dev code:

    STEADY-DEMO-0000-0000-0001

Its hash is in the tracked `.env.development` (dev server) and `.env.test` (unit tests)
as `VITE_UNLOCK_HASHES`. It is deliberately NOT in `.env`, so a production build never
accepts a code printed in this repo: without the hashes from Vercel it fails closed and
`vite build` prints a warning. To try a production build locally:

    VITE_UNLOCK_HASHES=3b9b0537d36c46fd9064a9fa1fb9029e63b573c0c98336a85e8ff9e3a01123f6 npm run build

Typing `O` for `0` or `I`/`L` for `1` also works (Crockford aliases), so the code can be
typed exactly as printed. Text copied along in front of the code ("Your code: STEADY-…")
is ignored.

To lock the app again, delete the `unlocked` row from the `meta` table in DevTools
(Application > IndexedDB > steady > meta), or clear site data.

### Making real codes

    node scripts/make-code.mjs

prints a new random code and its hash. Put the code in the PDF and add the hash to
`VITE_UNLOCK_HASHES` in the Vercel project (comma-separated, newest last). To hash an
existing code: `node scripts/make-code.mjs STEADY-XXXX-XXXX-XXXX-XXXX`.

Rotation: add the new hash, ship the new PDF, and remove a leaked hash after a grace
period. Installs that are already unlocked keep working because the flag is persisted.

### Threat model

The hash only keeps codes out of the bundle as plain text. It is not DRM: anyone with
DevTools can set the flag. That is accepted; the price is low and the demo is free.

### Demo build

`npm run build:demo` runs `vite build --mode demo`, which swaps `src/unlock/unlock.ts`
for `src/unlock/unlock.stub.ts` (an alias in `vite.config.ts`), and `.env.demo` blanks
`VITE_UNLOCK_HASHES`. It then runs `scripts/check-demo.mjs`, which fails if any
hash-shaped string is in `dist`. Never set that variable on the demo project.

Do not use `npm run build -- --mode demo`: npm hands the flag to the last command in the
script, so that builds the FULL app and then fails.

## First-run setup

After unlocking, `/setup` asks four quick things and stores progress in
`meta.setupProgress`, so a reload resumes on the same step. A saved payday that is no
longer after today is asked again. Setup counts as done when
`setupProgress.step` is `done` or any income exists (an older backup was restored).

## End-to-end tests (Playwright)

    npx playwright install chromium webkit   # once
    npm run e2e                              # everything
    npm run e2e -- --project=chromium        # one browser
    npm run e2e:ui                           # pick and watch tests

`playwright.config.ts` starts two servers itself:

- **Full app** on `:4173`: `npm run build && npm run preview`. The build gets the dev
  hash through `webServer.env`, because a production build reads no hash from `.env` and
  would lock the tests out (see Unlock code above).
- **Demo** on `:4174`: built into `dist-demo/` (so it can't clobber `dist/`), checked
  with `scripts/check-demo.mjs dist-demo`, then previewed. Only `e2e/demo.spec.ts` runs
  against it.

Locally a server that is already running on those ports is reused, so stop an old
`preview` if you changed code. CI always builds fresh.

Specs in `e2e/`, helpers in `e2e/helpers.ts` (`unlockAndSetup`, `heroCents`,
`logExpense`). Each test gets a fresh browser context, so a fresh IndexedDB: every spec
starts from the unlock screen and answers setup through the UI.

Notes:

- Projects use a 390 x 844 viewport with **desktop** user agents. A phone UA puts WebKit
  behind the iOS install screen, which Playwright cannot get past like a real home-screen
  install does.
- Locale is `en-IE` in `Europe/Berlin`. Playwright's WebKit on macOS reports `en-GB`
  anyway, so the app picks GBP there: specs match amounts, not the currency symbol.
- The backup spec removes `navigator.canShare` so WebKit uses the download link instead of
  the share sheet, which a test can't drive.
- The offline spec is Chromium only (PLAN §9). The first load is never controlled by a new
  service worker, so it reloads once before going offline.
- The a11y spec emulates `prefers-reduced-motion: reduce`, or axe can measure colours
  halfway through a fade-in.
- `midnight.spec.ts` uses `page.clock.install()` with an explicit `+01:00` offset, then
  `runFor` past midnight, to check `useToday` rolls over while the app stays open.

A failing test keeps a trace: `npx playwright show-trace test-results/<test>/trace.zip`.
CI uploads `playwright-report/` as an artifact.

## CI

`.github/workflows/ci.yml` on Node 24: `npm ci`, typecheck, lint, prettier check, unit
tests, `build`, `build:demo`, then Playwright (Chromium and the demo project). WebKit runs
locally; add `webkit` to the CI step when it is stable on Linux runners.

Before every commit:

    npx prettier --write src e2e && npm test && npm run build && npm run lint && npm run build:demo
