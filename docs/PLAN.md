# Steady Payday Planner: Architecture Plan (v1, revised)

> **How to read this:** each section ends with what you, as a junior dev, should take from it. Look for **Interview angle** notes. They mark topics that interviewers often ask about.

---

## 0. Decide before M0 (blocking)

1. **Who types the code?** Your global instructions say you write all the code and Claude guides you. This workflow says Claude builds. Proposed default: Claude writes the scaffold and config (M0, PWA/Vercel config in M3), you write the domain functions and features with hints, and Claude reviews them. **This sets the timeline, so confirm it first.**
2. **Hosting plan:** Vercel **Pro** (about $20/month). Hobby is for non-commercial use only.
3. **Name check:** search "Steady" on EUIPO/TMview, USPTO and the app stores before buying the domain or making any assets. Steady (steadyapp.com) is an existing fintech app.
4. **Launch price (EU Omnibus rule):** a struck-through "sale" has to reference the lowest price charged in the last 30 days. Choose one: (a) list at €17 for 30 or more days, then run a sale at €12, or (b) launch at €12 as the plain price with no "sale" framing.
5. **Domain:** register for 5 or more years with auto-renew, registrar lock and 2FA. If the domain lapsed, the next owner could push a service worker to every installed copy.

---

## 1. Overview

Steady Payday Planner is an offline-first PWA for budgeting from one payday to the next. All data stays in IndexedDB on the device. There is no backend, no account and no sync. It is sold on Etsy as a PDF that carries the link, a QR code, an unlock code and an install guide. The core question it answers in one glance: **"How much can I spend today, and until payday?"** It always shows how it got that number and labels it as an estimate.

**Design principles**
1. **Payday is the unit of time.** Monthly is an option.
2. **One number, one action.** Today shows a per-day number and one card. Nothing else sits above the fold.
3. **Nothing punishes you.** No streaks, no red, no item-by-item backlog after time away. Progress only grows.
4. **Data is sacred.** We call persist(), take a pre-migration snapshot in a separate DB, use strict restore validation, and tie the backup prompt to payday.
5. **Pure logic, thin UI.** Every money rule is a pure, tested function in `src/domain`, including the reconciliation rules (what counts as already in the balance).
6. **Simple by default.** New users start in Simple mode. Full tools are one toggle away.

### Differentiators

| Capability | MasterMoneyBudget | MoneyNest | **Steady** |
|---|---|---|---|
| Delivery | Single HTML file | Web app | Installable PWA (iOS/Android/desktop) |
| Offline on mobile | No | Partial | Full: precached shell, IndexedDB |
| Budget period | Monthly only | Paycheck | Weekly / biweekly / semimonthly / monthly / irregular, per-payday override |
| Safe-to-spend + math | No | Yes | Yes, lines always sum, autopay is reconciled, balance age is shown |
| Run-to-payday | No | Yes | Yes, per-day allowance from start of day |
| "Can this fit?" | No | Yes | Yes, before and after |
| 48h pause | No | Yes | Yes, expired items batch-decided |
| Snowball vs avalanche | No | Yes | Yes, interest saved and debt-free date; minimums are real bills |
| Recurring bills | Basic | ? | Rules expanded on read; skip/move/pay one occurrence; "change from date X" |
| Typed quick-add ("12 coffee") | No | No | **Yes**, plus one-tap recent chips |
| Undo | No | ? | **Yes**: persisted undo log and "Recently deleted" |
| Data-loss protection | Known bug | ? | **persist(), pre-migration snapshot, validated restore, migration tests** |
| EU-first | No | ? | **Yes**: EUR, dd.mm, Monday week start, fixed ISO 4217 decimals |
| Progress, no streaks | No | Garden | Garden that only grows, from outcomes rather than log volume |
| Simple / large text / reduced motion | No | Yes | Simple is the default; low-energy is a Today variant; 44px targets |
| Free demo | No | ? | **Separate demo origin**; bring your setup into the full app |
| Clutter | High | Medium | Low: 3 tabs in Simple mode, 5 in Full |

> **Take-away:** a feature table only builds trust if the hard rows (reconciliation, data safety) really are correct. Most of this plan is about those rows.

---

## 2. Folder structure

```
manthar/
  index.html
  vite.config.ts            # react, tailwind, pwa; mode 'demo' aliases unlock -> stub
  vercel.json               # SPA rewrite + cache headers
  public/                   # icons, apple-touch-icon, privacy/terms/imprint/help/start pages
  docs/                     # runbook (kill-switch SW, domain, support macros), later.md
  src/
    main.tsx
    app/                    # router, providers, AppShell, TabBar, UpdateToast, i18n/en.ts
    domain/                 # PURE TS. No React, no Dexie, no Date.now().
      money.ts  currencies.ts   # minor units; fixed ISO 4217 decimals table
      dates.ts                  # 'YYYY-MM-DD' math
      paySchedule.ts            # paydays, weekend shift, overrides, period bounds
      recurrence.ts             # expand rules from anchor, split "from X"
      reconcile.ts              # check-in rules: what is already in the balance
      safeToSpend.ts  runway.ts  debt.ts  quickAdd.ts  catchUp.ts  nextAction.ts  garden.ts
      __tests__/                # table tests + fast-check properties
    db/
      schema.ts  migrations.ts  # Dexie versions; pure transforms shared with import
      snapshot.ts               # pre-migration dump to a separate DB
      repos/  backup.ts  undo.ts  seed/demo.ts
      __tests__/fixtures/       # real vN databases built in fake-indexeddb
    features/
      today/ plan/ bills/ envelopes/ savings/ debts/ quickadd/ setup/
      settings/ unlock/ install/ impulse/ garden/ catchup/ help/
    ui/                     # Button Dialog Sheet Toast MoneyInput DateInput Stat Chip
    styles/app.css
    lib/                    # clock (useToday), storage.persist, badge, install, crypto, share
    unlock/                 # real module; demo build aliases it to unlock.stub.ts
  e2e/
```

**Rule:** `domain` imports nothing from `db`, `features` or `ui`. `ui` imports only `domain/money`. Nothing imports `unlock/` except `features/unlock`. The Vite alias swaps it for a stub in the demo build.

> **Interview angle:** "How do you structure a React app?" Group by feature, keep business logic in pure modules, and point dependencies inward. Bonus point: a build-time alias swaps a module out, which is cleaner than scattering `if (DEMO)` checks across shared code.

---

## 3. Data model

### 3.1 Money as integer minor units

Amounts are stored as integer minor units (€12.50 is `1250`). Decimals per currency come from a **fixed ISO 4217 table in code**, not from Intl at runtime, because ICU data differs between browsers (ISK, HUF, CLP). `meta.currency` and `meta.decimals` are stored, and every backup carries them.

**Currency change:** if no amounts exist, the change is free. If amounts exist, the app asks "Relabel only (same numbers)". Conversion is not offered in v1.

**Rounding points (exhaustive, each one tested):** debt interest uses `Math.round`. perDay uses `Math.floor`. 52-week challenge amounts are integers by construction. Quick-add turns the decimal string into an integer with no `parseFloat`. Nothing else rounds.

> **Interview angle:** "Why not floats for money?" Floats are binary fractions, so decimal cents drift. Use integer minor units, and list every rounding point.

### 3.2 Dates and "today"

Calendar dates are `'YYYY-MM-DD'` strings. Instants (createdAt, check-in `at`) are ISO timestamps. **"Today" comes from local parts** (`getFullYear/getMonth/getDate`) in `lib/clock.ts`, never from `toISOString().slice(0,10)`, which gives yesterday's date after midnight in CET. `useToday()` updates on `visibilitychange` and on a timer set for the next local midnight. Domain functions always receive `today` as a parameter.

### 3.3 Types

```ts
type Cents = number; type ISODate = string; type Instant = string; type Id = string;

type PaySchedule =
  | { kind: 'weekly' | 'biweekly'; anchor: ISODate }
  | { kind: 'semimonthly'; days: [number, number | 'last'] }
  | { kind: 'monthly'; day: number | 'last' }
  | { kind: 'irregular'; expected: ISODate[] };
interface IncomeSource { id: Id; name: string; amount: Cents; schedule: PaySchedule;
  weekendRule: 'before' | 'after' | 'none'; primary: boolean; active: boolean }
interface PaydayOverride { id: string /* `${incomeId}|${originalDate}` */; incomeId: Id;
  originalDate: ISODate; date: ISODate }                       // holidays, early pay

type Recurrence =
  | { freq: 'once'; date: ISODate }
  | { freq: 'weekly'; interval: number; anchor: ISODate }
  | { freq: 'monthly'; interval: number; day: number | 'last'; anchor: ISODate }
  | { freq: 'yearly'; month: number; day: number };
interface Bill { id: Id; name: string; amount: Cents; rule: Recurrence; until?: ISODate;
  envelopeId?: Id; debtId?: Id; autopay: boolean; createdAt: Instant; deletedAt?: Instant }
interface BillOccurrence { id: string /* `${billId}|${originalDate}` */; billId: Id;
  originalDate: ISODate; status: 'paid' | 'skipped' | 'moved'; movedTo?: ISODate;
  amountOverride?: Cents; paidAmount?: Cents; paidAt?: Instant; auto?: boolean }

interface Envelope { id: Id; name: string; budget: Cents /* per period */; isDefault: boolean;
  color: string; sort: number; deletedAt?: Instant }        // default = "Everyday"
interface Transaction { id: Id; date: ISODate; amount: Cents /* + in, - out */; note: string;
  envelopeId?: Id; fundId?: Id; debtId?: Id; billOccurrenceId?: string;
  inBalance?: boolean /* backdated, already in bank balance */; createdAt: Instant; deletedAt?: Instant }
interface BalanceCheckIn { id: Id; at: Instant; date: ISODate; balance: Cents }
interface SavingsFund { id: Id; name: string; target?: Cents; perPeriod: Cents; openingSaved: Cents;
  challenge?: { kind: '52week' | 'fixed'; start: ISODate }; deletedAt?: Instant } // saved = opening + Σ fund tx
interface Debt { id: Id; name: string; balance: Cents; balanceAsOf: ISODate; aprBps: number;
  minPayment: Cents; dueDay: number; deletedAt?: Instant }   // creates a linked Bill
interface ImpulseItem { id: Id; name: string; amount: Cents; addedAt: Instant;
  decision?: 'bought' | 'skipped' | 'archived'; decidedAt?: Instant }
interface NoSpendDay { date: ISODate }
interface UndoEntry { seq?: number; at: Instant; label: string; ops: { table: string; before: unknown | null; key: string }[] }
interface Meta { key: string; value: unknown }
// meta keys: settings, currency, decimals, unlocked*, setupProgress, lastOpened, lastBackupAt,
// changesSinceBackup*, snoozes*, gardenPoints. (* = internal, never exported)
```

### 3.4 Dexie schema + migrations

```ts
db.version(1).stores({
  incomes: 'id', paydayOverrides: 'id, incomeId',
  bills: 'id, debtId', billOccurrences: 'id, billId, originalDate',
  envelopes: 'id, sort', transactions: 'id, date, createdAt, envelopeId, fundId, debtId',
  checkIns: 'id, at', funds: 'id', debts: 'id', impulse: 'id, addedAt',
  noSpend: 'date', undo: '++seq', meta: 'key',
});
// later (example):
db.version(2).stores({ transactions: 'id, date, createdAt, envelopeId, fundId, debtId, [envelopeId+date]' });
```

**Rules**
- Index only the fields you query by. **Do not index `deletedAt`.** IndexedDB skips rows where the key is undefined, and booleans are not valid keys. The tables are small, so filter soft-deleted rows in JS.
- Never edit an old `version(n)` block. Always add `n+1`.
- **Fixtures are real databases.** The test opens schema vN in `fake-indexeddb`, writes fixture rows, then reopens with the latest version and checks the rows. Import reuses the same pure transforms from `db/migrations.ts`.
- **Pre-migration snapshot:** first open the DB without a version (dynamic mode) and read `verno`. If it is lower than the code's version, dump every table to the separate DB `steady-premigration`, then do the versioned open. Delete the snapshot after the next successful open plus 7 days. It is never stored in `meta` and never exported.
- `db.on('versionchange')` closes the DB and reloads when idle.

### 3.5 Recurrence: store the rule, expand on read

One row per bill. `expandOccurrences(bill, from, to, overrides)` computes each date **from the anchor**, never from the previous clamped date. So Jan 31 gives Feb 28 and then Mar 31. A safe modulo handles anchors in the future. Changes to one occurrence go into `BillOccurrence` rows keyed by `billId|originalDate`. Paid amounts are stored there, so a later amount edit never rewrites history.

**"Change from date X"** follows the RFC 5545 split. Set `until = X−1` on the old bill and create a new bill from X. Overrides for the old series stay attached to it. Editing "all" only touches occurrences that have no override.

### 3.6 Paycheck periods

A period is derived: `[thisPayday, nextPayday)` from the **primary** income. The weekend shift is applied first, and period bounds use the shifted date, so a payday on the 1st shifted to Friday the 29th starts the period on the 29th. `PaydayOverride` handles holidays and early pay. If an irregular schedule has no future date, Today's action is "When is your next pay?". Monthly mode swaps in calendar months.

> **Interview angle:** "Derived vs stored state?" Store the facts (rules, overrides, transactions) and derive the rest (periods, occurrences, balance). Derived data cannot go out of sync with its source.

---

## 4. Core domain logic (pure functions)

### 4.1 Reconciliation and safe-to-spend

**Check-in rules (`reconcile.ts`)**
- A check-in is an **instant** (`at`). A transaction counts toward the balance if `createdAt > checkIn.at` and `!inBalance`.
- If the user backdates an entry to before the last check-in, the app asks "Is this already in your bank balance?" and sets `inBalance`.
- **At check-in, autopay occurrences dated on or before the check-in date are auto-marked paid** (`auto: true`).
- For non-autopay occurrences due before the check-in, one prompt asks "Did these come out yet?", with "All yes" and per-item exceptions.

```
currentBalance   = checkIn.balance + Σ tx.amount (counted per rules above)
billsDue         = Σ (amountOverride ?? amount) of occurrences not paid/skipped with date < nextPayday
                   (overdue included; lookback = since previous payday or last check-in, whichever is earlier)
savingsPlanned   = Σ max(0, fund.perPeriod − Σ fund tx this period)
envelopeReserved = Σ max(0, env.budget − spentThisPeriod − linkedUnpaidBills)   // envelopes on only
                   untagged spending counts against the default "Everyday" envelope
buffer           = settings.buffer (default €0, suggested €50)

safeToSpend = currentBalance − billsDue − savingsPlanned − envelopeReserved − buffer
```

Debt minimums are **not a separate line**. Each debt creates a linked bill (`bill.debtId`), so there is one source of truth. Paying that bill writes a transaction with `debtId`.

Return value: `{ total, lines: BreakdownLine[], balanceAgeDays, estimateNote }`. "See the math" renders `lines` directly. **Simple mode collapses the lines to 4, and they always sum:** Balance, Bills before payday, Set aside (savings, envelopes, buffer), Safe to spend. A negative total reads "€38 short", with one calm suggestion. Every math view ends with "Estimate based on what you entered."

**"Can this fit?"**: `canFit(x) = { fits: total − x ≥ 0, after, perDayAfter }`.

**Property tests (fast-check):**
- Time passing never raises safe-to-spend unless money comes in.
- Adding a bill never raises it.
- An overdue unpaid bill lowers it.
- A check-in after an autopay bill does not change it (no double count).
- An envelope-linked bill is counted once.
- A savings contribution never raises it.

### 4.2 Run-to-payday

```
spentToday     = −Σ counted spend tx dated today
startOfDaySafe = safeToSpend + spentToday              // allowance from the start of the day
perDay         = startOfDaySafe > 0 ? floor(startOfDaySafe / daysLeft) : 0   // daysLeft ≥ 1
leftToday      = perDay − spentToday
onTrack        = safeToSpend − avgDailySpend(last 7d) × (daysLeft − 1) ≥ 0
```

Test: logging €10 today lowers `leftToday` by exactly €10. The countdown reads "6 days to payday · Fri 7 Nov". There are no streaks.

### 4.3 Debt payoff simulation

```
simulate(debts, monthlyBudget, strategy, maxMonths = 600):
  require monthlyBudget ≥ Σ minPayment                  // else {error:'budget_below_minimums'}
  loop month while any balance > 0:
    each debt: interest = round(balance × aprBps / 10000 / 12); balance += interest; totalInterest += interest
    pool = monthlyBudget
    each debt: pay = min(minPayment, balance); balance −= pay; pool −= pay
    order = snowball ? balance asc (tie apr desc) : aprBps desc (tie balance asc)
    for d in order while pool > 0: extra = min(pool, d.balance); d.balance −= extra; pool −= extra
  return { months, totalInterest, payoffOrder, schedule[] }
compare = { snowball, avalanche, interestSaved, monthsDiff }
```

The simulation warns on negative amortization (interest ≥ minimum). Below the comparison it reads: "Estimate. Real lenders may calculate interest differently." Tests cover a textbook case, zero APR, a single debt, and a budget exactly equal to the minimums.

> **Interview angle:** "Snowball vs avalanche?" Avalanche minimises interest. Snowball gives quick wins. It is the same loop with a different comparator, which is the strategy pattern. The complexity is O(months × debts · log debts).

### 4.4 Quick-add parser (v1 grammar)

```
entry    = [sign] amount [currency] words* [tag] [when]
         | words+ [sign] amount [currency] [tag] [when]
sign     = "+" | "-"                        ; + = income, default = spend
amount   = digits [("." | ",") digit{1,2}]  ; no thousands separators in v1
currency = "€" | "$" | "£" | ISO4217
tag      = "@" word                         ; case-insensitive prefix match on envelope names
when     = "today" | "yesterday"
words    = anything else -> note
```

`parseQuickAdd(text, {envelopes, today})` returns `{ ok, amount, kind, note, envelopeId?, date }`. The string is parsed to an integer with no float step. A live preview chip shows the result before saving. Date and envelope can also be picked with **chips**. The sheet opens amount-first with `inputmode="decimal"`. **Recent and frequent chips** ("Coffee €3.20 again") log in one tap. The note suggests an envelope based on history.

Table tests: `12 coffee`, `coffee 12`, `12,50 lidl @food`, `+1500 salary`, `4.99 netflix yesterday`, `12.05 lunch` (gives €12.05), `1.250 rent` (rejected: 3 decimals, ask the user), `y coffee 3` ("y" is part of the note), empty input, `abc`.

> **Interview angle:** "How do you test a parser?" Table-driven tests: one array of input/expected pairs, including ambiguous and invalid inputs. Shrink the grammar before you add more tests.

### 4.5 Other pure modules

- **`catchUp(lastOpened, today, data)`** has two modes.
  - **Short gap (7 days or less):** one summary card with counts.
  - **Fresh start (more than 7 days):** "Welcome back. Let's just update one number." The user enters one balance. Past autopay bills are marked paid. Non-autopay bills get "Mark all paid", with exceptions. The gap is simply absorbed by the new balance, with no fake transactions. Expired impulse items are archived. The screen shows counts, never a list.
- **`nextAction(state, snoozes, today)`** returns `{ id, trigger, cta, doneState }`. Every CTA can be finished in 30 seconds or less. "Not now" snoozes it for 24h with no guilt copy. Priority:
  1. Next payday unknown.
  2. Overdue non-autopay bill.
  3. Balance older than 3 days.
  4. Payday passed, so check in, **then offer a backup**.
  5. Backup older than 14 days.
  6. Expired 48h item.
  7. Deferred setup task ("Add your rent, 20 seconds").
  8. Log today.
  9. "All done for today."
- **`gardenStage(points)`** is monotonic. Points come from outcomes: check-ins, bills paid, no-spend days and impulse items skipped. They never come from the number of entries logged, and never from reviews.

---

## 5. Screens + navigation

**Tabs:** Simple mode (the default) has **Today, Bills, More**. Full mode adds **Plan** and **Goals**. Turn it on with More, then "Show more tools". The bottom bar is used on mobile and a side rail at md and wider.

| Tab | Content |
|---|---|
| **Today** | Hero "€23 for today", under it "€161 until payday · Fri" and "based on your balance from 2 days ago · update". Then one action card, the quick-add field with recent chips, and a "See the math" link. The garden glance sits below the fold. |
| **Plan** (Full) | Income, envelopes (off by default), savings, "can this fit?" |
| **Bills** | Month calendar and list; mark paid / skip / move; recurring editor with "this / from here / all" |
| **Goals** (Full) | Savings funds (52-week or fixed per period), debts comparison, no-spend days, garden |
| **More** | 48h list, transactions, Recently deleted, backup/restore, settings, themes, help ("How this number works"), what's new, legal, copy support info |

**What Simple mode shows on each screen**

| Screen | Simple | Full |
|---|---|---|
| Today math | 4 lines (always sums) | Every line, with items |
| Envelopes | Hidden (one Everyday pot) | Optional per-envelope |
| Savings / debts | Hidden, but still counted in "Set aside" / bills | Goals tab |
| Transactions, 48h, no-spend | More tab | More / Goals |

Simple mode never deletes data. It only changes the views.

- **Quick-add:** the Today field, plus a floating **+** on every other tab (none on Today, where it would duplicate the field). On desktop, the `n` key opens it.
- **Low-energy:** a "Just today" toggle on Today. It shows the hero and one card with "Not now", and nothing else. It is a variant of Today, not a separate mode.
- **Routing:** React Router 7 in declarative mode. **All tab routes are imported eagerly.** Only heavy secondary views, such as the debt chart, are lazy.
- **First run** (installed app):
  1. Enter the unlock code. "No code? Try the demo" is offered here.
  2. A one-time "Not financial advice" acknowledgement.
  3. Three questions: next payday, how often you are paid, balance right now. Locale and currency are auto-detected and shown as one editable line.
  4. "Start from a backup or demo file" is offered as an alternative.
  - Progress saves after each step and resumes where the user left off. Bills, envelopes and the first backup become deferred Today actions.

> **Interview angle:** "How do you manage state?" IndexedDB is the source of truth, read reactively with `useLiveQuery`. UI state lives in `useState`. A small context holds settings and `useToday`. No Redux: there is no client cache to keep in sync.

---

## 6. PWA / offline

**Manifest:** `short_name: "Steady"`, `display: "standalone"`, `start_url: "/?source=pwa"`, `scope: "/"`, and a warm off-white `background_color`. `theme_color` is static, with two `<meta name="theme-color" media="(prefers-color-scheme: …)">` tags rather than a value per theme. Icons: 192, 512, 512 maskable, and an apple-touch-icon at 180 (via `@vite-pwa/assets-generator`). iOS splash images move to v1.1.

**Service worker:** `generateSW`, with a precache of `**/*.{js,css,html,woff2,png,svg,webmanifest}` and `navigateFallback: '/index.html'`. No runtime caching.

**Updates (`registerType: 'prompt'`):**
1. A new SW installs and waits. A toast says "An update is ready", with a "Refresh now" button.
2. Otherwise `skipWaiting` runs at the next cold start.
3. If a resumed page gets a new controller (`controllerchange`), it reloads, but only when no dialog is open and no input is dirty.
4. On `vite:preloadError` or a failed dynamic import, it reloads (guarded against loops).
5. Eager tab imports remove most of the stale-chunk risk.
6. Kill switch: a self-unregistering SW is documented in `docs/runbook.md`.

**Vercel** (`vercel.json`). Later rules override earlier ones for the same header:
```json
{ "rewrites": [{ "source": "/((?!assets/|.*\\.).*)", "destination": "/index.html" }],
  "headers": [
    { "source": "/(.*)", "headers": [{ "key": "Cache-Control", "value": "no-cache" }] },
    { "source": "/assets/(.*)", "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }] }]}
```

**Install-first onboarding** detects standalone mode with `matchMedia('(display-mode: standalone)')` and `navigator.standalone`.

| Context | Behaviour |
|---|---|
| iOS Safari, or iOS 16.4+ Chrome/Edge/Firefox | Full-screen "Install first so your data stays safe". Three steps: Share, Add to Home Screen, open from the icon. Explains that tab data and home-screen data are separate. A small "Continue in browser" link shows a persistent banner. |
| In-app browsers (Etsy app, Instagram, PDF viewers / SFSafariViewController) | "Open this link in Safari/Chrome", with a copy button |
| Android / desktop Chromium | `beforeinstallprompt` drives an "Install app" button |
| Installed | Skip |

`/start` is a short, typeable static page that routes to the right flow. The PDF carries a QR code for moving from desktop to phone.

**Storage durability**
- `navigator.storage.persist()` is called after setup, its status shows in Settings, and it is retried on later opens if denied. `estimate()` also shows in Settings.
- **Backup moment:** right after the payday check-in: "Payday done. Save a backup? 1 tap". It also becomes a Today action if the last backup is older than 14 days. The first backup is a deferred week-1 action, which rehearses the share sheet once.
- **Backup file:** `steady-backup-YYYY-MM-DD.json`. The Blob is **prepared when the backup screen opens**, so `navigator.share({files})` still runs inside the tap's transient activation (otherwise iOS throws NotAllowedError). The fallback is a download link. Internal meta keys are never exported.
- **Restore** (zod mini):
  - Reject a `schemaVersion` newer than the app ("Update the app first").
  - Reject files over 5 MB.
  - Every amount must pass `Number.isSafeInteger`. Dates must be real calendar dates. IDs must be unique. `envelopeId`, `billId`, `fundId` and `debtId` references must resolve.
  - Unknown or internal keys are stripped.
  - A preview shows counts and the date range.
  - The current data is auto-backed up to `steady-premigration`, then everything is replaced in one Dexie transaction.
  - A `source:'demo'` file imports **setup only**: schedule, bills, envelopes, funds, debts.

**Reminders:** in-app only, plus catch-up on open. `setAppBadge(count)` shows bills due within 2 days plus expired 48h items:
- Chromium: on by default where supported.
- iOS: only after an optional notification-permission opt-in, offered after the first week.

**Dev on a phone:** `crypto.subtle`, `randomUUID` and service workers need HTTPS. Test through Vercel previews or an HTTPS tunnel, not `http://192.168…`.

> **Interview angle:** "Service worker caching strategies?" Cache-first for hashed assets, network-first for HTML or data that changes, stale-while-revalidate for content that may be slightly old. "How does an SW update?" Install, wait, activate. `skipWaiting` and `clients.claim` decide when the new SW takes over. Follow-up: what happens to lazy chunks the old page still needs?

---

## 7. Unlock + demo build

**Unlock**
- The code looks like `STEADY-XXXX-XXXX-XXXX-XXXX`, with 16 Crockford base32 characters (about 80 bits). Input is normalised to uppercase with spaces and dashes removed.
- The app computes `sha256hex('steady-v1:' + normalized)` and compares it against `VALID_HASHES`, taken from `VITE_UNLOCK_HASHES` at build time.
- **What the hash really does:** it keeps the code out of the bundle as plain text. It is not DRM, and anyone with DevTools can bypass it. Say exactly that in the interview: it shows you understand the threat model.
- **Single source of truth:** `meta.unlocked = {at, hashPrefix}`. It is not mirrored to localStorage, not exported and not restored from backup. Re-entering the code is cheap.
- **Full lock:** the code is the first screen of the full app. There is no entry cap and no second free tier. The demo is the only trial.
- **Rotation:**
  1. Add the new hash and upload a new PDF. Etsy lets past buyers re-download it too.
  2. Retire a leaked hash after a grace period. Installs that are already unlocked keep working, because the flag is persisted.
  3. This stops casual sharing in the future. It is not a revocation.
- A cosmetic 1s delay applies after 5 wrong tries. The UI never shames "leakers".

**Demo build** (`vite build --mode demo`, a separate Vercel project at `demo.steadyplanner.app`)
- A separate origin means separate storage, so real data is never touched.
- **Capped edits, persisted on the demo origin:**
  - Fixed DB name `steady-demo`, with a "Reset demo" button.
  - Auto-reset after 7 days, and a cap of 25 entries.
  - It survives app switching, so the setup is still there when the buyer comes back from Etsy.
  - Deleting on `pagehide` was dropped: it broke the back/forward cache and wiped data mid-purchase.
- Two ways in: "Look around with sample data" (seeded relative to today), or "Try with my own numbers", which runs the same 3-question setup.
- "Bring your setup into the full app" downloads a backup with `source:'demo'`. The full app imports setup only.
- No SW and no install prompt. A banner says "Demo: get the full app on Etsy" and links to the listing with a `ref` parameter. There is no analytics.
- **No leaks:**
  - `unlock/` is aliased to a stub in demo mode.
  - A CI step greps the demo bundle for hash-shaped strings.
  - `VITE_UNLOCK_HASHES` is not set on the demo project.

> **Interview angle:** "Hashing vs encryption?" Hashing is one-way and verifies that input matches. Encryption is reversible with a key. A hash of a low-entropy secret can be brute-forced, which is why the code length matters.

---

## 8. Theming, accessibility, i18n

**Theming:** Tailwind 4 `@theme` plus CSS variables.
- Tokens: `--bg --surface --text --muted --accent --accent-contrast --danger-soft`.
- Neutral base: `#FAF7F2` / `#1F1E1C`. Themes swap the accent and a tint: clay (default), sage, ocean, blush, sand, and midnight (forces dark).
- `data-theme` and `data-mode` go on `<html>`. `auto` follows the OS.
- A unit test checks WCAG AA 4.5:1 for every pair in the token table.
- **One font:** self-hosted `@fontsource-variable/inter`, with the woff2 precached.

**Accessibility**
- Tap targets are at least 44×44 px (`min-h-11 min-w-11` in the primitives).
- Native `<dialog>` with `showModal()`, a labelled title, and focus returned to the trigger.
- Large text runs from 100% to 150% via the root font-size, using rem layouts. Tested at 150%.
- Reduced motion follows the OS, with an in-app override. The garden then shows static stages.
- `aria-live="polite"` announces money changes. Charts have a table alternative. Colour is never the only signal.
- **Delete and undo:**
  - Single items are soft-deleted at once, with an Undo toast (10 s). They appear in **Recently deleted** for 30 days.
  - **Confirm dialogs** (with the item name) appear only for destructive actions: deleting a recurring series, a fund or debt with history, restore, and wipe.
  - **Undo log:** each repo mutation writes before-images to the `undo` table (last 20). It is persisted, so it survives reload and stays consistent with `useLiveQuery`.

**i18n / locale**
- Settings: `locale` (from `navigator.language`), `currency` (default EUR, decimals from the fixed table), `weekStart`, and date style.
- `weekStart` defaults from `Intl.Locale` `getWeekInfo()` or the `weekInfo` getter (detect both), with a fallback table that gives Monday for EU locales.
- `Intl.NumberFormat`, `DateTimeFormat`, `RelativeTimeFormat` and `PluralRules` come from a cached factory.
- The UI is English in v1. Strings live in `src/app/i18n/en.ts` behind `t()`.

> **Interview angle:** "How do you make a modal accessible?" Trap focus, close on Esc, restore focus, label the title, and make the background inert. Native `<dialog>` does most of this.

---

## 9. Testing strategy

| Layer | Tool | What |
|---|---|---|
| Domain unit | Vitest + **fast-check** | Money, the currency table, dates (leap year, clamp from anchor, future anchor, local midnight), schedules (weekend shift across a month, overrides), recurrence split, reconciliation, safe-to-spend properties (§4.1), runway, debt sim, parser tables. **At least 90% line coverage on `src/domain`.** |
| DB | Vitest + fake-indexeddb | Repos; **real vN to latest migration fixtures**; pre-migration snapshot; backup round-trip (deep-equal); restore rejection cases (newer schema, unsafe ints, 2026-02-30, broken refs, demo file brings setup only); undo log |
| Component | Vitest browser mode + Testing Library | Quick-add sheet and chips, Dialog focus, MoneyInput, Simple mode 4-line math sums, nextAction snooze |
| E2E | Playwright 1.64 (Chromium + WebKit, mobile viewport) | Unlock, then the 3-question setup, then a number in under 60 s; add bill; see math; check-in reconciles autopay; backup/restore; fresh-start catch-up |
| Clock | Playwright `page.clock` | App open across local midnight; across EU DST change days (fixed dates, e.g. 2026-03-29); 48h expiry |
| Offline + update E2E | Playwright, **Chromium only** | Offline: SW ready, go offline, reload, add an expense, check it persists. Update: page open on build A, deploy B, resume, switch tabs, no white screen, data intact. |
| a11y | @axe-core/playwright | Zero serious violations on each tab, light and dark |
| Bundle | CI script | Demo bundle has no hashes; initial JS under 200 KB gz |
| **Manual iPhone checklist** (M3, M8, M12) | Real device, iOS 16.4+ | Install from the PDF/QR, unlock, quit, reopen, update, share-backup to Files, restore on a second device, in-app-browser path |

Playwright WebKit is not iOS Safari: it has no standalone mode, no separate storage and no eviction. That is why the manual checklist exists.

CI: GitHub Actions runs `tsc --noEmit`, eslint, vitest, playwright and the bundle checks. Vercel builds previews per PR.

> **Interview angle:** "Test pyramid?" Many fast unit and property tests, fewer integration tests, a few E2E journeys, and a manual checklist for what automation can't reach.

---

## 10. Milestones

Each milestone is one PR, with a walkthrough and a short quiz. **You install it on your own iPhone from M3 onward.**

| # | Deliverable | Acceptance check | Interview topics |
|---|---|---|---|
| **M0** Scaffold + decisions | Section 0 resolved; Vite 8 + React 19 + TS 5 strict + Tailwind 4 + ESLint/Prettier + Vitest + Playwright + CI + Vercel Pro preview; Etsy shop setup started (ID verification, payments, policies) | Build and tests pass in CI; preview loads over HTTPS on a phone | Bundlers, ESM, TS strict, CI |
| **M1** Domain core | `money`, `currencies`, `dates`, `clock`, `paySchedule`, `recurrence` + tests | Tables for all 5 schedules, weekend shift across a month, Jan 31 from the anchor, future biweekly anchor, Feb 29 yearly | Floats vs ints, pure functions, TDD |
| **M2** Data layer | Dexie v1, repos, `useLiveQuery` hooks, backup/restore with the full rules, pre-migration snapshot, real-fixture harness | Round-trip deep-equal; restore rejects all bad cases; v1 fixture upgrades | IndexedDB, indexes, transactions, migrations |
| **M3** Shell + installable PWA | Router (eager tabs), tab bar, themes, dark mode, primitives, manifest, prompt-update SW, Vercel headers, install-first matrix, `/start` | axe passes; offline E2E (Chromium); manifest and SW validity check; manual install on iPhone | Service workers, cache headers, a11y |
| **M4** Bills + paydays | Calendar + list, recurring editor (this / from here / all), paid/skip/move, income + payday overrides, debt-linked bills ready | Editing "from X" splits the series; overrides survive; paid amounts don't change | Data modelling, derived vs stored |
| **M5** Today + safe-to-spend | Reconciliation, breakdown, 4-line Simple math, runway, check-in, can-this-fit, v1 quick-add + recent chips, nextAction with snooze | "12 coffee" logs €12.00 and leftToday drops by exactly €12; all §4.1 properties pass | Parsing, reactive data, property testing |
| **M6** Unlock + setup | Hash unlock (full lock), rotation list, not-advice acknowledgement, resumable 3-question setup, deferred setup actions | Wrong code rejected; a number in under 60 s after unlock; setup resumes after a kill | Hashing, threat modelling, state machines |
| **M7** Beta 1 | 5 ADHD testers on their own phones: install, first number, one quick-add. Fix the top 3 friction points. | Written findings plus the 3 fixes merged | Usability testing, prioritisation |
| **M8** Durability + catch-up + undo | persist(), payday backup moment, prepared-Blob share, fresh-start flow, Recently deleted, persisted undo log, badge (iOS opt-in) | Update E2E keeps data; real-iPhone backup to Files and restore on a second device; fresh-start after 3 weeks takes one input | Command pattern, platform quirks |
| **M9** Envelopes, savings, ADHD extras | Envelopes (off by default, Everyday default), funds via `fundId` tx, 52-week/fixed challenges, no-spend days, 48h list with batch decisions, garden (outcome points), Just-today variant | 48h item shows "decide" at 48h (clock injected); envelope-linked bill counted once | Time-dependent tests, useEffect pitfalls |
| **M10** Debts | Debt CRUD, linked minimum bills, snowball vs avalanche, chart + table, estimate note | Matches a hand-computed fixture; negative amortization warning | Algorithms, strategy pattern, Big-O |
| **M11** Demo + polish + i18n | Demo build (stub alias, capped and persisted, reset, setup-only export), locale/currency/week start, large text, reduced motion, contrast tests, perf budget, help FAQ, what's new | Demo bundle grep is clean; demo setup imports into the full app; 150% text has no overflow; WebKit E2E green | Build-time env, code splitting, Intl |
| **M12** Launch | Legal pages, support email, support macros, refund table, real screenshots and recording, PDF, listing, test purchase from a second Etsy account on iPhone | Launch checklist (§11) is all green | Deployment, docs, product thinking |

**Portfolio angle:** a README with the problem, real screenshots, an architecture diagram and a "Decisions" section (money in cents, reconciliation rules, update strategy, unlock threat model), plus a live demo link, CI and coverage badges, and the beta findings. That is a strong interview story.

---

## 11. Etsy launch kit

**PDF (8 to 10 pages, A4 and US Letter)**
1. **Page 1:** short URL (`steadyplanner.app/start`), a QR code, the unlock code in large type, and "This is an app for your phone or computer, not a printable."
2. Requirements: iOS 16.4+ (Safari, Chrome or Edge), Android Chrome, desktop Chrome/Edge. Internet is needed for the first install.
3. Install on iPhone: open in Safari (not inside the Etsy app), Share, Add to Home Screen, open from the icon, **then** enter the code. A calm callout explains that the tab and the home-screen app keep separate data.
4. Android and desktop install.
5. First 60 seconds: three questions.
6. Backups: save one on payday, and how to restore on a new phone.
7. FAQ: privacy (no account, no tracking), what "estimate" means, Simple mode, moving devices, updates.
8. Support (Etsy messages or the support email), licence summary, disclaimers, links to /privacy, /terms, /imprint.

**Title (about 70 chars):** ADHD-Friendly Paycheck Budget App, Offline Safe-to-Spend Planner
Extra keywords go in the 13 tags and the attributes.

**13 tags (each 20 chars or fewer):** adhd budget planner · paycheck budget · budget planner app · paycheck planner · budget tracker · offline budget app · safe to spend · bill tracker · debt snowball · savings tracker · envelope budget · expense tracker · money planner

**Images (real screenshots of the shipped build only, in phone frames):**
1. Hero with the per-day number.
2. "How you get it: download the PDF from etsy.com > Purchases, open the link in Safari or Chrome. Web app, not a printable."
3. See the math.
4. Quick-add "12 coffee".
5. Bills calendar.
6. Snowball vs avalanche.
7. 48-hour pause.
8. Garden.
9. Simple vs Full, and themes.
10. "Works offline · no account · data stays on your phone" with the demo URL as text.

The video is a real 15 s screen recording.

**Description:** the first line is "Web app for your phone, not a printable." It includes the requirements, the demo URL as text (URLs are not clickable there), what's in the PDF, a dated support promise, and the compliance lines.

**Compliance**
- "ADHD-friendly design. This is a budgeting tool, not a medical product or treatment."
- "Not financial advice. All numbers are estimates based on what you enter." This is also shown inside the app (setup acknowledgement, math view, debt view).
- **AI disclosure:** list exactly what AI helped with (code, PDF copy, any icons, illustrations or garden art, any mockups) and mark "Designed by [seller]" correctly. Check Etsy's current listing form at launch. If there is no AI field, the description statement is the disclosure.
- "Digital download: a PDF with your access link and unlock code. No physical item."
- "Your data is stored only on your device. Please back up on payday."
- **Support promise (dated, not "lifetime"):** "Hosted and updated until at least 2029. If it is ever discontinued: 6 months' notice, a downloadable offline build, and a documented backup format."
- **Banned phrases** in all copy: treat, therapy, help with symptoms, dopamine, executive dysfunction fix, clinically, therapist-approved.
- **Review ask:** one neutral, dismissible prompt after a real success (the first payday survived, day 7 or later), linking to Etsy Purchases. No reward attached, and no garden points.
- **Licence:** one household, personal use, code not transferable.
- **EU withdrawal right:** check how Etsy's checkout handles consent for digital content. Don't just write "no refunds".

**Legal and support (static pages, no backend)**
- `/privacy`: covers host IP logs, data that stays on the device, and backups the user shares.
- `/terms` (licence) and `/imprint`.
- `/help` FAQ.
- A support email on the app domain, for help only and never for marketing.
- An in-app "Copy support info" button: version, platform, standalone, persist status, schema version. No financial data.
- An Etsy saved-reply library for "can't find file", "won't install", "lost data", "new phone".
- **Refund table:** refund if it can't install on a supported device. Decide case by case once it has been unlocked and used for 14 or more days.

**Unit economics**
- On €12: listing fee €0.20, 6.5% transaction fee, about 4% + €0.30 payment processing, and 12–15% Offsite Ads when they apply. That leaves about **€8.5–9.5 net**.
- Fixed costs: Vercel Pro about €19/month plus the domain about €2/month, roughly **€21/month, so break-even is about 3 sales a month**.
- Taxes: income tax and business registration in your country. Etsy reports your income under DAC7.

**Demo link:** demo.steadyplanner.app. It is not a payment link. There is no checkout or "buy" button anywhere off Etsy, only "Available on Etsy".

---

## 12. Risks + open questions

**Risks**

| Risk | Mitigation |
|---|---|
| iOS data split: the user unlocks in a tab, installs, finds an empty app | Unlock lives inside the installed app; install-first matrix; `/start` and QR; PDF step order |
| Safe-to-spend is double-counted or stale, and trust is lost | Reconciliation rules, autopay auto-pay at check-in, debts as bills, balance age shown, property tests, "estimate" wording |
| Wrong "today" (UTC, open across midnight) | Local clock module, `useToday`, `page.clock` tests |
| Phone lost with no backup | Backup offered at payday check-in; share sheet rehearsed in week 1; restore tested on a real device |
| Migration corrupts data (the competitor's flaw) | Real-fixture tests, pre-migration snapshot DB, validated transactional import |
| Stale or broken build after an update | no-cache on everything except /assets, eager tabs, preloadError reload, kill-switch runbook |
| Code leaks | 80-bit code, rotation, retire leaked hashes; accept some leakage |
| Vercel suspension or domain lapse | Pro plan; multi-year auto-renew, lock, 2FA; dated promise and exit plan |
| Trademark takedown | Section 0 search before assets |
| "Not as described" or "can't find file" cases | Page 1 of the PDF, listing image 2, saved replies, requirements stated |
| Scope (all 14+ v1 features) | Ordered milestones, beta at M7, Simple-first, the rest goes to `docs/later.md` |
| Fake-discount complaint | Section 0, item 4 |

**Open questions**
1. Section 0 items (who codes, hosting, name, price, domain). **Blocking for M0.**
2. Envelope leftovers: return them to safe-to-spend (recommended default) with a per-envelope rollover toggle?
3. Language: English at launch, German next?
4. Demo entry cap: is 25 the right number?

**Decided since v1 of this plan:**
- Balance check-in is required (it is setup question 3).
- The period follows the primary income only.
- String-date helpers instead of Temporal.
- Demo on a subdomain.
- Full lock, no entry cap.
- A dated update promise.

---

**Doing well** (on the brief itself): the locked decisions are specific, the competitor research is concrete, and you knew the iOS storage split. That is the most important platform fact for this product.

**Needs work:** the v1 scope is still large. Reconciliation (section 4.1) is the hardest and most important part, so give M5 the most time. Treat the M7 beta as a gate, not a formality.

**Next step:** before M1, write the expected outputs by hand for 5 pay-schedule cases, including a Jan 31 monthly bill stepped through Feb and Mar, and a payday on the 1st that falls on a Sunday with `weekendRule: 'before'`. That becomes your first test table.

**Quick check question:** the user checks in a balance on the 3rd, and rent (autopay) left the account on the 1st. Which rule stops rent from being subtracted twice, and in which module does it live?

---

**Rejected review points**
- **Cut debts, monthly mode, no-spend days, undo or confirm-delete from v1, or ship v1.0 at M5+M8+M10** (adhd-ux 2, business 15, offline 15): v1 scope is locked. I accepted reordering instead: PWA early, then a beta at M7.
- **Remove setAppBadge** (offline 15): it is in the locked facts. Kept it, with an opt-in on iOS.
- **Move hosting to Cloudflare Pages or Netlify** (business 1): Vercel is locked. Took Vercel Pro instead.
- **Rename the product proactively** (business 3): the name and domain are locked. Kept a trademark-check gate. A conflict would go back to you as a decision.
- **Rename "safe-to-spend" to "estimated spending room"** (business 8): it is the locked feature name and needed for MoneyNest parity. Added "estimate" wording around it instead.
- **Persist the demo for 7 days without limits** (business 7): the demo must be non-persisted or capped. Picked capped edits (25 entries, 7-day reset), which covers the conversion concern.
- **Drop the confirm dialog on every delete in favour of undo only** (adhd-ux 10): confirm-delete is locked. Narrowed it to destructive actions, with undo for single items.
- **Cut the irregular schedule** (offline 15): it is a cheap list of dates and a differentiator over monthly-only competitors.
- **Cut savings challenges entirely** (adhd-ux 11): they are MoneyNest parity. Reduced them to 52-week and fixed, both derived from fund transactions.
