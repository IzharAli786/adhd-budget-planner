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
`VITE_UNLOCK_HASHES`. The output goes to `dist-demo` (set the demo Vercel project's
output directory to that). It then runs `scripts/check-demo.mjs`, which fails if the dev
code's hash, any `VITE_UNLOCK_HASHES` value (env files or CI env), the dev code itself,
any hash-shaped string, or a service worker/manifest is in `dist-demo`. Never set that
variable on the demo project.

The demo stores everything in the `steady-demo` database. Its first screen offers sample
data (`src/db/seed/demo.ts`, built relative to today) or the normal setup. It holds 25
entries (a write guard in `db/undo.ts`, installed by `src/db/demo.ts`), resets itself 7
days after it was started, and More has "Reset demo" and "Bring your setup into the full
app" (a `source: 'demo'` backup; the full app restores only the setup from it). The
banner links to `VITE_ETSY_URL`.

Do not use `npm run build -- --mode demo`: npm hands the flag to the last command in the
script, so that builds the FULL app and then fails.

## First-run setup

After unlocking, `/setup` asks four quick things and stores progress in
`meta.setupProgress`, so a reload resumes on the same step. A saved payday that is no
longer after today is asked again. Setup counts as done when
`setupProgress.step` is `done` or any income exists (an older backup was restored).

## Schema versions

- v1: the first release.
- v2: debts gain `originalBalance` (a transform in `migrations.ts`).
- v3: a `notes` table (`id, date, periodStart`) for day notes and "Note for this payday". No
  transform: older databases and backups simply have no notes. A step's upgrade only reads
  stores that already exist, since a later version's tables are created after it runs.

- v4: a `lifeGoals` table (`id`) for free-form goals on Goals (`db/repos/lifeGoals.ts`):
  title, why, target date, status (`todo` / `doing` / `done`) and an optional `fundId` or
  `debtId`. No transform. The table is optional in `backupSchema.ts`, so v1-v3 files
  restore with no goals; a v3 app refuses a v4 file (`newer-schema`) instead of dropping
  them. Purging a deleted fund or debt unlinks the goals that pointed at it. Deleting a goal
  is a hard delete with undo (it holds no money history).

  Settings later gained optional `displayName` and `accent` fields; both are optional in
  `backupSchema.ts`, so no version bump: older files simply lack them.

## Custom accent and erase

`src/domain/accent.ts` judges a picked accent against the theme's backgrounds (a copy of
app.css, checked by `styles/__tests__/accentPalettes.test.ts`) and refuses one below AA,
offering the nearest passing shade. `app/theme.ts` sets the derived `--l-accent*` and
`--d-accent*` inline on `<html>`. More > Backup > "Erase everything" (`db/erase.ts`)
clears every table (the unlock flag included), the safety-copy database and the cached
appearance.

## Look back and Insights

`src/domain/insights.ts` (spending per envelope or per kind) and `src/domain/review.ts`
(money in and out per month or pay period, and the carry-over per payday) are pure and
shared by Plan's Insights card, More > Look back and the printed report. Paydays count
only from the first check-in or entry (`historyStart`): a pay schedule has no start
date. The payday backup moment saves what was carried in to `meta.periodClose` (exported
in backups); otherwise it is worked out from check-ins. Chart colours are the
`--chart-1..6` tokens, checked for contrast in `contrast.test.ts`. "Print this period /
year" renders a `.print-report` that only the `@media print` rules in `app.css` show.

## Reports (PDF)

More > Reports (`/more/reports`, also linked from Look back) makes a PDF of any date
range, both days included. `src/domain/report.ts` (`buildReport`) is pure and reuses
Look back's `flowsIn`, Insights' category rows, `debtsInRange` and `isSpend`, so its
numbers agree with the rest of the app; lists start at the history start, like Look back.
`src/features/reports/reportPdf.ts` draws it with jsPDF + jspdf-autotable, both loaded
with `import()` on the first "Create PDF" (a separate chunk the service worker precaches;
`check-pwa.mjs` fails the build if it isn't). jsPDF's optional html2canvas, dompurify and
canvg are aliased to `src/lib/pdfUnused.ts` in `vite.config.ts`: Reports never draws HTML
or SVG. Helvetica only covers WinAnsi, so every string goes through `toWinAnsi`, and money
whose symbol doesn't fit (₹, ₩, zł, ₺) prints as "INR 1,234.00" (`pdfMoney`). The PDF tests
run jsPDF's Node build with `compress: false` so they can read the text back. Reports
writes nothing, so it works in the demo without touching the 25-entry cap.

## Charts, folding and phone layouts

Chart values are readable without the table: `ui/ChartTips.tsx` lays one button per column
over Look back's money chart and the payoff chart (named with every number, one Tab stop,
arrows move, a tip on tap/hover/focus), and each Insights bar is a button with its own tip.
Axis tops are rounded by `domain/chartScale.ts` (`niceMax`) and labelled with
`f.moneyShort` ("€2.5K"). `ui/Disclosure.tsx` folds Plan's Insights, payday note and
"Can this fit?"; they start folded below 640px and the choice is kept per section in
`localStorage` (`steady:open-sections`, cleared by Erase). Below 640px Look back's table
becomes stacked cards. Tapping an envelope on Plan opens its entries this pay period
(`features/plan/EnvelopeEntriesSheet.tsx`, the same rule as the envelope's "left" number)
with "See all in log" (`/more/transactions?envelope=<id>`).

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

Specs in `e2e/`, helpers in `e2e/helpers.ts` (`unlockAndSetup`, `answerSetup`,
`heroCents`, `logExpense`, `addFirstBill`). `heroCents` is signed: "€5.00 short" reads
as -500, so a "drops by exactly" check can't pass on a number that crossed zero. Each test gets a fresh browser context, so a fresh IndexedDB: every spec
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
  halfway through a fade-in. It logs an expense and adds a bill first, so rows, chips
  and calendar dots are scanned, not just empty states.
- The demo spec starts on the entry screen ("Try Steady"), takes "Try with my own
  numbers" and finishes setup before checking for a service worker: the full app only
  registers one from the shell, so checking on the setup screen would prove nothing.
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

## Testing on your phone (same Wi‑Fi)

```bash
npm run dev:phone    # https + --host, prints a Network: https://<your-ip>:5173 URL
```

A phone on the LAN is not a secure context over plain http, so `crypto.subtle` (unlock) and
`crypto.randomUUID` (new rows) would be missing. `dev:phone` serves a self-signed certificate:
accept the warning once on the phone. Install-to-home-screen and offline still need a trusted
certificate (mkcert) or a real https host.

The unlock screen's "Try the free demo" link points at the production demo URL in builds. In
dev it points at port 5174 on the same host, served by:

```bash
npm run demo:phone   # builds the demo and serves it on https://<your-ip>:5174
```

## Deploying (Cloudflare Pages)

Two projects: `steady-planner` (full app) and `steady-planner-demo`.

```bash
npx wrangler login     # once, opens the browser
npm run deploy         # full app  → https://steady-planner.pages.dev
npm run deploy:demo    # free demo → https://steady-planner-demo.pages.dev
```

`npm run deploy` needs `.env.production.local` (git-ignored) with the real
`VITE_UNLOCK_HASHES` — make one with `node scripts/make-code.mjs`. Without it the build warns
and no code unlocks the app. Caching lives in `public/_headers`.
