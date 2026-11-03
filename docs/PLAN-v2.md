# Steady v2: the pay-based money model, implementation plan

This plan combines Design A (data and domain) and Design B (product and UX) into one buildable
plan, revised after an adversarial review (25 findings, R1 to R25). Section 0 records every
decision where the designs or the review disagreed. Everything after it is the decided version,
with no open alternatives except the three owner questions in §7. Section 8 lists how each review
finding was handled, including the parts that were rejected and why.

Locked by the owner (2026-11-03), and not reopened here:

- **A.** Safe to spend is pay-based only: carried-in money + income − bills − expenses (envelope
  budgets reserve their unspent part) − cushion. Pay counts by itself. Editing pay changes the
  number at once. The bank-balance check-in no longer drives any number.
- **A2.** Savings (fund moves, per-payday plans, challenges) and debt payments (minimums and
  extras) never reduce safe to spend and never appear in income, expense or spending totals.
  They live in their own Savings and Debt sections. A bill that is not a debt still counts.
- **B.** Planning period is a setting: calendar month or pay period. New users get calendar month.
- **C.** Starting balance editable any time; currency changeable; roll-over toggle.

---

## 0. Decisions

| # | Topic | **Decision** | Why |
|---|---|---|---|
| 1 | The pace guard and the hero (R2, R3, R7) | **The guard is advice by default.** `PACE_GUARD_BINDS = false` in `domain/pace.ts`. The hero is `perDay − spentToday`, where perDay comes from safe to spend (S). The guard works on a **cash estimate** (it counts last period's money even with roll over off, plus savings moves, debt payments and unpaid debt minimums), and shows as one helper line and the `tight-before-pay` card. | Locked decision A says a pay edit must move the number. A binding guard whose checkpoint is the payday inside the period cancels the edit (R2). The guard must also not show "€0, money looks tight" while last month's €2,752 sits in the account (R3). The switch stays so the owner can make it bind later (§7 Q1). |
| 2 | Envelope math | Lines: spending, then "still in envelopes" (the reserve); B's bar presentation | `max(budget, committed)` is exactly `committed + clamp(budget − committed)`. |
| 3 | Where the money settings live (R10) | **Their own exported meta key `plan`**, not the `settings` row | `mutate()` stores the whole row as its before-image. If they shared the settings row, undoing a starting-balance change would also undo a later theme change. |
| 4 | Repeating savings | `fund.perPeriod` ("each payday"). No `Bill.fundId`. | Avoids a new reference, a delete cascade and new backup rules. |
| 5 | Debt payments (R6) | **Every logged payment is a dated debt transaction.** The payment form has "This is my November minimum": it also marks that occurrence paid and links it (`billOccurrenceId`) in the same undo step. A Coming-up tick on a minimum only marks it paid, and it counts as paid on its due date. | Keeps the real payment date, so "still owed" falls on the right day. Each payment is stored once. No guessing within ±7 days. |
| 6 | Pay edits | `from`/`until` on incomes. Three scopes: this payday only, from this period on (default), every payday (a typo fix). | Without `from`, a changed income would reach back to the start date and rewrite carried-in money. |
| 7 | Budgets that change over time (R19) | **In v5:** `Envelope.pastBudgets` | Adding it later would need a v6 bump, because a v5 app strips unknown fields. "Budget for November" and past planned bars need it. |
| 8 | Switching month ↔ payday | One-tap opt-in "Adjust budgets to monthly (€300 → €650)", undoable, written as dated budgets. The switch first shows **S before and after** (R3). | Convenient without surprising anyone. With roll over off, the switch can move S by the whole starting balance, so it is previewed. |
| 9 | Expenses dated in the future | The domain counts any dated row by its date. In the calendar, "Expense" on a future day becomes a one-off "Planned cost" bill. | The domain stays total; the UI keeps planned costs tickable. |
| 10 | `PaydayOverride.date` | Optional (absent = not moved) | An amount-only override must not undo the weekend shift. |
| 11 | Checkbox on Coming-up notes | `Note.doneAt` | The competitor's "Dentist appointment" has one. |
| 12 | Catch-up after time away | Optional "Start fresh from today", settle past bills (bookkeeping), archive expired 48h items, **plus an optional drift correction** (R8) | One optional number. Corrections keep history; start fresh resets it. |
| 13 | Coming up range | The next 5 items within 45 days, unpaid items since the start first, from CORE's `itemsBetween` (R14) | 14 days misses a monthly payday. One shared list keeps Coming up and the Calendar in agreement. |
| 14 | Navigation | Bills becomes Calendar; Goals gets Overview · Savings · Debt; `/bills` redirects to `/calendar` (query string kept) | Matches the competitor's words; old links keep working. |
| 15 | Money settings screen | **Money basics (`/more/basics`)**, linked from Plan, the math sheet and Settings | Item 6 needs one clear place. |
| 16 | "Per day or whole month" hero setting | Dropped | YAGNI. The period total sits under the hero. |
| 17 | Guard checks the payday after month end | Always in month mode, on cash | The overhang is real cash whether or not the plan carries it. |
| 18 | Envelopes on by default | New installs: on, with only "Everyday" at budget 0. A budget of 0 reads "No budget set", never "past the plan" (R22). The migration keeps them off where they were off. | Item 4 works out of the box. Budget 0 gives exactly the numbers of envelopes off. |
| 19 | Rebuilding the start for existing users (R1) | **Start at the latest check-in by default.** The first check-in is offered as "Keep Look back's carry history". | Later check-ins absorbed spending that was never logged. Starting at the first one would bring all of it back as money. |
| 20 | Envelope on a debt bill | The migration removes it; the bill form hides the envelope picker for debt bills | A2: debt never reduces S, not even through an envelope. |
| 21 | Demo "Bring setup" import | Setup tables only; the device keeps its own `settings` and `plan` | Smallest change; Today then asks for a starting balance. |
| 22 | Garden points | Fund grew, debt paid, period not short, plus frozen check-in points (high-water mark) | Points still come from outcomes only. |
| 23 | Shared code | B's lanes. CORE owns every pure money function, the shared day list and the UI primitives the lanes need (R14). | The invariants are tested in one place; lanes don't build the same thing twice. |
| 24 | Month mode and weekend-shifted paydays (R9) | **In month mode a payday belongs to the month of its nominal date.** The effective (shifted) date decides only the start cut-off and the cash timing in the guard. | 1 Nov 2026 is a Sunday. With "before", the pay lands on Fri 30 Oct, and October would show two paydays and November none. |
| 25 | Autopay bills with no check-in (R4) | Derived `effectiveStatus`: an autopay entry dated on or before today reads as paid in every view. Nothing is written. | Check-ins used to mark them. Without that, Coming up, "left to pay" and every "actual" would show bills the bank already took. |
| 26 | Deleting or pausing an income (R5) | Delete becomes **stop after the last payday on or before today** when it has paydays since the start. "Delete everywhere, it was a mistake" is a confirmed extra choice. | A hard delete would remove paydays from closed periods and rewrite carried-in money. |
| 27 | Where the start's day boundary is stored (R11) | `plan.startAt`: the instant of local midnight at the start of `startDate`, saved when the start is set | `owedAtStart` then compares instants, so the number never changes when the phone travels across time zones. |
| 28 | Item 4 "on the home page" (R17) | A small "Envelopes this month" card on Today (top 3, planned vs actual) linking to Plan | The request says the home page. The full chart stays on Plan. |
| 29 | Payday-mode periods after splits (R16) | Periods follow the **primary chain**: several rows may be primary if their `[from, until]` ranges don't overlap. A moved payday moves a boundary; skipped and amount changes never do. | A split keeps old periods on the old schedule and new ones on the new. |

> **Interview angle:** "How do you resolve conflicting designs?" Write each disagreement down and choose by your invariants (here: the lines always add up, savings and debt never touch S, history never rewrites). For the one call that is really a product judgement (decision 1), ship the safe default and keep a cheap switch.

---

## 1. The money model

### 1.1 Terms

- **Plan settings** (`meta.plan`, §2.1): `planBy`, `startDate`, `startAt`, `startingBalance` (B), `rollover`, `buffer`.
- **B**: signed cents, the money at the **start** of `startDate`.
- **Period P** = `[start, end)`. Month mode: a calendar month. Payday mode: `[primary payday, next primary payday)`, following the primary chain (§1.3).
- **Window W(P)** = `[max(P.start, startDate), P.end)`. When `P.end ≤ startDate`, P is "before tracking".
- **Plain bill**: no `debtId`. **Debt bill**: has a `debtId`. Only plain bills are "bills" in the money model.
- **Accrual**: every flow counts in the period its date falls in, whether paid, due, received or expected. Ticking a bill paid or pay arriving never moves S.
- **Payday slot**: `slot(p) = max(startDate, planBy = 'month' ? p.nominal : p.date)`. A payday counts only when its effective date `p.date ≥ startDate` (otherwise the money is already inside B).
- **effectiveStatus(e, today)**: `'paid'` when `e.status = 'due'`, `e.autopay` and `e.date ≤ today`; otherwise `e.status`.

### 1.2 Classifying entries (`domain/ledger.ts`)

```ts
export type TxKind = 'income' | 'expense' | 'refund' | 'saving' | 'debt' | 'billPayment' | 'adjustment'
export function txKind(t: Transaction): TxKind {
  if (t.fundId !== undefined) return 'saving'                 // either sign; never in the ledger (A2)
  if (t.debtId !== undefined) return 'debt'                   // wins over billOccurrenceId (R6)
  if (t.billOccurrenceId !== undefined) return 'billPayment'  // legacy plain-bill payment; the occurrence counts
  if (t.adjust === true) return 'adjustment'                  // drift correction (R8)
  if (t.amount < 0) return 'expense'
  return t.envelopeId !== undefined ? 'refund' : 'income'
}
export const isDebtBill = (b: Pick<Bill, 'debtId'>) => b.debtId !== undefined
```

This replaces `reconcile.isSpend`, `insights.isEverydaySpend` and `isDebtPayment`. `isSpend` was wrong under A2 because it counted debt transactions as spending.

### 1.3 Periods (`domain/period.ts`, new)

```ts
export type PlanBy = 'month' | 'payday'
export interface Period { kind: PlanBy; start: ISODate; end: ISODate }
export interface PeriodContext { planBy: PlanBy; incomes: readonly IncomeSource[]; overrides: readonly PaydayOverride[] }
export function primaryAt(incomes: readonly IncomeSource[], date: ISODate): IncomeSource | undefined
export function periodAt(date: ISODate, ctx: PeriodContext): Period | null   // null only in payday mode with no next payday
export const daysLeft = (p: Period, today: ISODate) => Math.max(1, daysBetween(today, p.end))
export function previousPeriod(p: Period, ctx: PeriodContext): Period | null
export function nextPeriod(p: Period, ctx: PeriodContext): Period | null
export function periodsIn(range: DateRange, ctx: PeriodContext): Period[]      // tiles the range with no gaps
export function periodsPerYear(planBy: PlanBy, s?: PaySchedule): number | null // 12/52/26/24/12/null
export function scaleBudget(c: Cents, from: number, to: number, unit: Cents): Cents // rounds to whole units
```

Rules:
- **Primary chain (R16).** `primaryAt(incomes, d)`: among active incomes with `primary` and `from ≤ d ≤ until` (open ends allowed), the one with the latest `from`; otherwise the first active income covering `d`. Repos keep at most one primary per date: `demoteOthers` demotes only primaries whose ranges overlap. `splitIncomeFrom` leaves `primary: true` on both halves (old one gets `until`, new one `from`).
- Payday-mode boundaries are the effective dates of chain paydays (each payday taken from the income that is primary at its nominal date). An override's `date` moves a boundary; `skipped` and `amount` never do.
- Every consumer takes its period from `periodAt`. This replaces `useBillsData`'s month fallback, `payPeriodRanges`, `monthRanges`, `previousPayPeriod` and `calendarMonthPeriod`.
- Known limitation: schedule edits made in place before v5 (no `from`/`until`) still re-tile older payday periods.

### 1.4 Formulas (`domain/ledger.ts`, `domain/safeToSpend.ts`)

```
paydayIncome(W) = Σ (override.amount ?? i.amount) over active incomes i and paydays p of i with
                  (i.from ?? −∞) ≤ p.nominal ≤ (i.until ?? +∞), not skipped,
                  p.date ≥ startDate, slot(p) ∈ W                 // effective date = override.date ?? weekendShift(nominal)
loggedIncome(W) = Σ t.amount, txKind = 'income', t.date ∈ W
income(W)       = paydayIncome(W) + loggedIncome(W)               // every income, not only the primary
corrections(W)  = Σ t.amount, txKind = 'adjustment', t.date ∈ W  // signed

billsIn([a,b))  = Σ e.amount for plain-bill entries with entry date in [a,b), status ≠ skipped
                  // e.amount = paidAmount ?? amountOverride ?? bill.amount
owedAtStart     = Σ e.amount for plain-bill entries dated in [startDate − 31, startDate),
                  status ≠ skipped, not autopay (the bank took those before the start),
                  not history (rule.freq = 'once' or e.date ≥ addedOn(bill)),
                  and (status = 'due' or paidAt ≥ startAt)          // instants, no time zone (R11)
bills(W)        = billsIn(W) + (W.start = startDate ? owedAtStart : 0)

expenses(W)     = −Σ t.amount, txKind ∈ {expense, refund}, t.date ∈ W   // net of refunds; future dates count

flows[a,b)      = income + corrections − billsIn − expenses over [a,b)   // a ≥ startDate; paydays by slot
budgetBalance(d)= B − owedAtStart + flows[startDate, d)
carriedIn(P)    = P.end ≤ startDate          → null (before tracking)
                  P.start ≤ startDate < P.end → B
                  rollover                    → budgetBalance(P.start)
                  else                        → 0                         // locked A; see §7 Q2
leftover(P)     = carriedIn(P) + income(W) + corrections(W) − bills(W) − expenses(W)   // no reserve, no cushion
```

**Envelopes** (only when `envelopesEnabled`), for each live envelope e over the **whole** period P:

```
budget_e     = budgetFor(e, P)   // the pastBudgets entry with the smallest until ≥ P.start, else e.budget
home(t)      = expense: t.envelopeId if live, else the default envelope; refund: t.envelopeId if live
committed_e  = −Σ t.amount for expense/refund rows with home e, dated in P
             + Σ linked plain-bill entries in P (not skipped)          // debt bills never count
spent_e      = the part of committed_e dated ≤ today
scheduled_e  = committed_e − spent_e                                   // drawn lighter, as "coming"
reserved_e   = clamp(budget_e − committed_e, 0, budget_e)
over_e       = budget_e > 0 ? max(0, committed_e − budget_e) : 0      // calm text, never red (R22)
reserved     = Σ reserved_e
```

- The whole period is used, not the window, because a budget belongs to a period. Spending in the same period before the start uses up the budget but is not subtracted again; B already reflects it.
- A linked bill counts once: it is in bills, and it shrinks the reserve.

**Safe to spend:**

```
S(P)   = carriedIn + income(W) + corrections(W) − bills(W) − expenses(W) − reserved − buffer
status = S < 0 ? 'short' : 'ok'
```

Savings moves, fund withdrawals, debt transactions and debt bills appear in **none** of these terms (A2).

**Runway and hero** (`domain/runway.ts`):

```
S0          = S recomputed without today's 'expense' rows
perDay      = S0 > 0 ? floor(S0 / daysLeft) : 0
spentToday  = −Σ amount, txKind = 'expense', date = today          (refunds and future rows excluded)
heroPerDay  = PACE_GUARD_BINDS && guard ? min(perDay, guard.perDay) : perDay   // default: perDay
leftToday   = heroPerDay − spentToday                               (the big number; "€4 over" below 0)
```

**Pace guard on cash** (`domain/pace.ts`, pure; R2, R3, R7). It never changes S.

```
cash flows  = payday income by effective date (p.date ≥ startDate) + logged income + corrections
              − plain bills by entry date (not skipped) − expenses/refunds
              − net savings moves (txKind 'saving') − debt payments (debt txs + paid minimums with no linked tx)
cash(d)     = B − owedAtStart + Σ cash flows dated [startDate, d)    // what the account should hold at the start of d
A0          = cash(today) + today's cash flows except 'expense' rows
checkpoints = effective income dates in (today, P.end]
              ∪ { H = first primary payday ≥ P.end }  when planBy = 'month'
M_cash(e)   = A0 + Σ cash flows dated (today, e)
              − unpaid debt minimums dated [startDate, e)             (effectiveStatus 'due', not skipped)
              − reserved − Σ budgets of envelope periods starting in [P.end, e) − buffer
guard       = over checkpoints, the smallest floor(max(0, M_cash(e)) / daysBetween(today, e)),
              returned as { perDay, until: e, short: M_cash(e) < 0, lines } when perDay_guard < perDay or short
```

- Savings **plans** are not subtracted (they are choices); savings moves already made or dated in the future are.
- Property: with roll over on, no savings, debt or correction rows and no shifted paydays, in payday mode, `M_cash(P.end) = S0`.
- **Account estimate** (Money basics, catch-up): `cash(today + 1)` plus unpaid plain bills dated on or before today (they haven't left the bank yet).
- **Can this fit?** subtracts the cost from S, S0 and every `M_cash(e)`, so its answer uses the same rule as the hero and the guard line.

### 1.5 Lines, the simple view and the bar (`domain/safeToSpend.ts`, rewritten)

| id | Label (month mode; payday mode says "this pay period") | Amount | Items |
|---|---|---|---|
| `carried` | "Starting balance · 3 Nov" / "Carried in from October" / "October ran €40 past the plan". Left out when 0 and roll over is off. | +carriedIn | |
| `income` | "Money in for November" | +income | Each payday ("arrives Wed 25 Nov" when after today), each logged income |
| `corrections` | "Corrections" (only when there are any) | ±corrections | Each correction |
| `bills` | "Bills in November" | −bills | Each entry with its effective paid tick, plus "Still owed from before you started" |
| `expenses` | "Spending in November" | −expenses | Per envelope when envelopes are on, otherwise per day |
| `envelopes` | "Still budgeted in envelopes" | −reserved | Per envelope |
| `buffer` | "Cushion" | −buffer | |

- The simple view is built **by summing the lines above**, never recomputed: Money for November (carried + income + corrections) · Bills · Spending and set aside (expenses + envelopes + cushion) · Safe to spend.
- Footer, always shown: "Savings €40 and debt payments €145 this month are tracked on their own and don't change this number."

`leftToSpendBar(plan)` returns segments **Started lighter | Bills | Spent | Corrections | Still in envelopes | Cushion | Safe to spend** (zero-width segments omitted; R25).
- Inflows = max(0, carriedIn) + income + max(0, corrections). "Started lighter" = max(0, −carriedIn); the "Corrections" segment = max(0, −corrections).
- When S ≥ 0 the segments add up to inflows. When S < 0 the safe segment is 0, the other segments add up to the outflows, and the caption reads "€38 short".
- Percentages use `largestRemainder`, which moves from `report.ts` to `domain/money.ts`.
- Savings and Debt are **separate side panels, never segments**.

### 1.6 The Savings and Debt sections' own numbers (A2)

```
fundSaved(f, txs, asOf)  = f.openingSaved − Σ fund tx (fundId = f, date ≤ asOf)      // later dates show as "Scheduled"
periodSavings(P)         = { saved: net into funds dated [P.start, min(P.end, today+1)),
                             scheduled: net dated (today, P.end),
                             planned: Σ_f min(f.perPeriod × primaryPaydays(P), target_f − fundSaved(f, P.start−1)) }
debtPayments(d)          = −amount of 'debt' transactions for d (their own dates)
                         + paid debt-bill occurrences with no linked transaction (paidAmount ?? amount, at the entry date;
                           effectiveStatus applies)                                  // R6: no double count
owedNow(d, today)        = max(0, d.balance − Σ payments dated in (d.balanceAsOf, today])   // estimate, interest ignored
periodDebt(P)            = { due: Σ debt-bill entries in P not skipped,
                             paid: Σ payments dated in P and ≤ today,
                             scheduled: due entries dated > today in P }
Today tiles: savedAcrossFunds = Σ fundSaved(asOf today)
             stillOwed        = Σ owedNow
             minimumsMonthly  = Σ minPayment where owedNow > 0
             goalsInProgress  = life goals with status 'doing' (sub-line: "1 not started")
```

- `simulate()` takes owedNow as the balance.
- When owedNow reaches 0, the Debt card offers "Looks paid off. Mark it done?". That sets the balance to 0 and the existing `syncBills` ends the minimum.

### 1.7 Edge cases (each one is a table test)

1. `startDate` is null: `planToday` returns `no-start`, and Today asks "What's in your account right now?".
2. The period is before tracking: carriedIn, S and leftover are null. Look back shows cash-basis flows (§3).
3. Tracking starts mid-period: W is clipped; the envelope budget is still the full period's (conservative), and the math sheet says so.
4. A negative B or negative carry is allowed: "October ran €40 past the plan, so November starts €40 lighter. That's okay." The bar shows "Started €40 lighter".
5. No income in month mode: the plan still works; the card says "Add your pay".
6. Payday mode with no next payday: `no-payday` blocks Today, as now.
7. A skipped payday or skipped bill counts as 0. A skipped primary payday is still a period boundary.
8. Month mode, weekend shift: pay nominal Sun 1 Nov 2026 with "before" lands Fri 30 Oct and counts in **November**. Pay nominal Sat 31 Oct 2026 with "after" lands Mon 2 Nov and counts in **October**. Start date 1 Nov with the 31 Oct case: the effective date is after the start, so it counts in November (slot clipped to the start).
9. A moved bill counts in the period of its effective date.
10. A future-dated transaction counts in its period, never in `spentToday`.
11. A fund withdrawal (positive) is not income. Spending paid from a fund (§4.2) is a fund withdrawal and never touches S.
12. A refund tagged to an envelope lowers that envelope and spending.
13. Entries in a deleted envelope go to the default envelope. A bill linked to a deleted envelope becomes unlinked.
14. An envelope on a debt bill is ignored.
15. A legacy transaction with only `billOccurrenceId` is ignored (the occurrence counts). One with `debtId` too is a debt payment, and its occurrence is not counted again.
16. `inBalance` is ignored.
17. An ended income is not primary after `until`, and its paydays after `until` don't count. Secondary paydays always count. Irregular expected dates count by date.
18. An autopay bill dated before the start is not owed at the start. An autopay bill dated yesterday shows as paid everywhere.
19. An envelope with budget 0 shows "No budget set · €105 spent" and gives the same S as envelopes off.
20. Switching between month and payday mode changes how money is divided. `budgetBalance` stays the same except on days between a shifted payday's nominal and effective dates.
21. A period note written in payday mode is still found in month mode (§4.4).
22. Roll over off in December after a good November: S counts only December's pay, and the guard (on cash) shows no warning.

### 1.8 Invariants (each one is a fast-check property)

| | Invariant |
|---|---|
| I1 | The full lines, the simple lines and the bar segments each add up (lines to S; bar to inflows, or to outflows when short), including negative B and negative corrections. |
| I2 | Within one period, S does not depend on today. Only the per-day number, effective statuses and the guard do. |
| I3 | No savings or debt change alters S, carriedIn, leftover, income, bills, expenses, envelope usage, category rows or donut shares (deep-equal). In the other direction, saved and paid change by exactly the amount. |
| I4 | Marking a plain bill paid or unpaid at its own amount never changes S. Paying x instead changes S by −(x − amount). |
| I5 | Roll over on: leftover(Pₖ) = carriedIn(Pₖ₊₁). Roll over off: carriedIn = 0 after the first period. |
| I6 | The default edit scopes never change a closed period's leftover: pay from this period on, stopping a bill from today, moving a debt's due day by a split, **deleting an income (stop after the last payday)**, deleting a recurring bill (stop from here on). |
| I7 | Logging an expense today lowers `leftToday` by exactly its amount, with the guard binding or not. |
| I8 | Adding a plain bill never raises S. An unlinked bill dated in W changes S by exactly −amount. |
| I9 | An autopay entry dated on or before today is never shown as unpaid by `itemsBetween`, the calendar totals or any "actual". |
| I10 | A pay edit "from this period on" changes S by δ × (counted paydays in W), and `perDay` by the matching floor. The hero moves whenever S0 moves (guard not binding). |
| I11 | Guard: `M_cash(P.end) = S0` under the conditions in §1.4; `guard.perDay < perDay` whenever a guard is returned without `short`. |

> **Interview angle:** "Recursion vs closed form?" "This period's carry is last period's leftover" is recursive and costs O(periods²) over a year of Look back rows. Rewriting it as budgetBalance(P.start) = B + a prefix sum of dated flows makes each row O(1) after one sort, the same trick as prefix sums for range-sum queries.

### 1.9 Worked example

**Setup.** Today is Tue 10 Nov 2026. Start 3 Nov, B = €900. Roll over on. Cushion €50. Envelopes on: Groceries €300, Everyday €0.
- Pay: €2,000 monthly on the 25th (Wed 25 Nov, Fri 25 Dec; no weekend shift). Logged income +€60 "sold lamp" on 8 Nov.
- Bills (monthly, manual): Rent €950 on the 1st, added 3 Nov (its 1 Nov date is history). Streaming €13 on the 5th (5 Nov paid). Phone €25 on the 12th. Electricity €64 on the 20th.
- Debt (Debt section only): Visa €1,200 as of 1 Nov, minimum €95 on the 15th. An extra €50 paid on 9 Nov is a debt transaction dated 9 Nov; the 15 Nov minimum stays due.
- Savings (Savings section only): Holiday +€40 on 3 Nov, plan €40 each payday.
- Spending before today: Groceries €84.50, untagged €21.30 (Everyday).

**Month mode, November, W = [3 Nov, 1 Dec):**

| Line | Amount |
|---|---|
| Starting balance · 3 Nov | 900.00 |
| Money in: 2,000 (arrives 25 Nov) + 60 | +2,060.00 |
| Bills: 13 + 25 + 64 | −102.00 |
| Spending: 84.50 + 21.30 | −105.80 |
| Still budgeted: Groceries 300 − 84.50 (Everyday: no budget set) | −215.50 |
| Cushion | −50.00 |
| **Safe to spend in November** | **2,486.70** |

- Simple view: 2,960.00 − 102.00 − 371.30 = 2,486.70. Bar: 102 \| 105.80 \| 215.50 \| 50 \| 2,486.70 = 2,960.
- Savings panel: €40 of €40 planned. Debt panel: €50 paid, €95 due 15 Nov. Still owed: 1,200 − 50 = **€1,150** (estimate).
- perDay = floor(248,670 ÷ 21) = **€118.41**. The hero shows €118.41; under it: "€2,486.70 safe to spend in November · 21 days left".
- Guard on cash: A0 = 900 − 40 − 13 − 105.80 + 60 − 50 = 751.20.
  - 25 Nov: 751.20 − 89 (phone, electricity) − 95 (Visa minimum) − 215.50 − 50 = 301.70 ÷ 15 = €20.11.
  - H = 25 Dec: 751.20 + (2,000 − 89 − 1,052) − 190 (two Visa minimums) − 215.50 − 300 (December Groceries) − 50 = 854.70 ÷ 45 = **€18.99**.
  - Helper line: "Until your pay on Fri 25 Dec, about €18.99 a day keeps your bills and debt minimums covered." No tight card (both values are positive).
- Pay edit €2,000 → €2,100, "from this period on" (split at the 25 Nov nominal date): S = **2,586.70** at once, and the hero becomes **€123.17**. Toast and live region: "Safe to spend in November €2,486.70 → €2,586.70". The guard becomes min(€20.11 at 25 Nov, 954.70 ÷ 45 = €21.21) = €20.11, so the line now names Wed 25 Nov.

**Payday mode, P = [25 Oct, 25 Nov), W = [3 Nov, 25 Nov):**
- 900 + 60 − 102 − 105.80 − 215.50 − 50 = **486.70**. perDay = floor(48,670 ÷ 15) = €32.44.
- Guard at P.end = 25 Nov: 301.70 ÷ 15 = €20.11, the same as month mode's 25 Nov checkpoint, so the two modes agree.
- A pay edit "from this period on" changes S by 0 here; the preview says: "Your 25 Oct pay was already in your starting balance. The change shows from 25 Nov."

**December, month mode, nothing more logged in November:**
- leftover(Nov) = 900 + 2,060 − 102 − 105.80 = 2,752.20 (reserve and cushion return to it).
- Roll over on: 2,752.20 + 2,000 − 1,052 − 300 − 50 = **3,350.20**.
- Roll over off: S = 2,000 − 1,052 − 300 − 50 = **598.00**; hero floor(59,800 ÷ 31) = €19.29. On 1 Dec, cash A0 = 2,662.20 − 950 (rent today) = 1,712.20; guard at 25 Dec = (1,712.20 − 102 − 190 − 300 − 50) ÷ 24 = €44.59; at 25 Jan = 1,623.20 ÷ 55 = €29.51. Both are above €19.29, so there is no line and no tight card (R3 fixed).
- Money basics shows the late-pay hint: "You're paid on the 25th. Planning by pay period may fit you better."

---

## 2. Data, migration and backup

### 2.1 Types

```ts
// domain/plan.ts (new content; the old periodIncome is deleted)
export type PlanBy = 'month' | 'payday'
export interface PlanSettings {
  planBy: PlanBy                   // new installs: 'month'
  startDate: ISODate | null        // null → 'no-start'
  startAt: Instant | null          // local midnight at the start of startDate, fixed when set (R11)
  startingBalance: Cents           // signed
  rollover: boolean                // default true
  buffer: Cents                    // moved here from settings (undoable now)
  startSource: 'user' | 'migrated-latest' | 'migrated-first' | null
  introPending?: true              // exported, so the intro survives a restore (R15)
  legacy?: LegacySnapshot          // the numbers on the update day, for the intro sheet (R1)
}
export interface LegacySnapshot {
  asOf: ISODate
  before: { safe: Cents; perDay: Cents }   // the v4 engine
  after: { safe: Cents; perDay: Cents }    // the v5 engine, same day, same start
  reasons: { id: 'pay' | 'savings' | 'debt' | 'bills' | 'other'; amount: Cents }[]   // add up to after − before
}
// domain/settings.ts: envelopesEnabled default becomes TRUE (Everyday only, budget 0). buffer leaves Settings.
// domain/types.ts
interface IncomeSource   { /* … */ from?: ISODate; until?: ISODate }                 // nominal dates, inclusive
interface PaydayOverride { id; incomeId; originalDate; date?: ISODate; amount?: Cents; skipped?: true }
interface Note           { /* … */ doneAt?: Instant }
interface Transaction    { /* … */ adjust?: true }                                  // drift correction (R8)
interface Envelope       { /* … */ pastBudgets?: { until: ISODate; amount: Cents }[] } // sorted by until (R19)
// Bill unchanged. inBalance stays on old rows and is ignored.
```

- `meta.plan` is an **exported** key with its own entry in `metaValueSchemas`.
- New internal meta key `notices` (`INTERNAL_PREFIXES`, never exported): `{ monthHintAt? }`.
- `budgetFor(e, P)`: the entry with the smallest `until ≥ P.start`, else `e.budget` (the current amount). A budget edit in period P pushes `{until: P.start − 1, amount: old}` (replacing entries with `until ≥ P.start − 1`) and sets `budget = new`.

### 2.2 Dexie v5

```ts
{ version: 5, stores: {} }        // no index change
MIGRATIONS[5] = makeMigrateToPayModel({ localDate, startOfLocalDay, today })   // tests inject; the app passes the device's
```

- The version bump triggers the existing pre-migration snapshot. **Migration snapshots are kept 60 days** (imports stay at 7). CORE adds `exportSnapshotAsBackup()` so More › Backup can offer "Download the copy from before the update" (R21).
- The undo log is cleared, as with every migration.

### 2.3 The transform (pure, idempotent, total: it never throws on a device)

```ts
5: (d) => {
  const s = { ...(settingsRow?.value ?? {}) }
  const checkIns = d.checkIns ?? []
  const hasData = (d.incomes?.length ?? 0) > 0 || checkIns.length > 0 || settingsRow !== undefined
  if (planRow) return stripDebtEnvelopes(d)                          // idempotent
  const plan: PlanSettings = { planBy: hasData ? 'payday' : 'month', rollover: true,
    buffer: s.buffer ?? 0, startDate: null, startAt: null, startingBalance: 0, startSource: null }
  delete s.buffer
  if (hasData) s.envelopesEnabled ??= false                          // pin the old default
  if (checkIns.length > 0) {
    const c = latestByDateThenAt(checkIns)                           // R1: latest, not first
    const start = tryOr(() => startFromCheckIn(c, d, fns), { startDate: c.date, startingBalance: c.balance })
    Object.assign(plan, start, { startAt: fns.startOfLocalDay(c.date), startSource: 'migrated-latest',
      introPending: true, legacy: tryOr(() => legacySnapshot(d, plan, fns), undefined) })
  }
  return { ...stripDebtEnvelopes(d), meta: hasData ? upsert(upsert(meta, 'settings', s), 'plan', plan) : meta }
}
```

`startFromCheckIn(c, rows, fns)` (`domain/legacyStart.ts`) returns the money at the **start** of `c.date` as the new ledger sees it. An entry is "inside c" when `createdAt ≤ c.at` or `inBalance`. "Everyday" means txKind income, expense or refund.

```
B = c.balance
  − Σ t.amount  everyday t dated c.date, inside c              // the ledger counts them again on c.date
  + Σ e.amount  paid plain entries dated ≥ c.date, paidAt ≤ c.at // they had already left the account
  + Σ e.amount  e ∈ owedAtStart(start = c) with paidAt ≤ c.at   // owedAtStart counts them; they had left
  − Σ p.amount  paydays with effective date c.date              // the old rule treated them as inside c
  + Σ t.amount  everyday t dated < c.date, not inside c         // the old model applied them; the ledger ignores pre-start dates
```

`legacySnapshot` runs a **frozen copy of the v4 engine** (`domain/legacy/v4Today.ts`: old reconcile, safeToSpend and planToday, unchanged, deleted one release after v5) and the v5 engine on the same day. It splits the difference into named reasons: pay counted (paydays the old model didn't count yet), savings plan no longer set aside, debt minimums kept apart, bill window differences, and "other" for the remainder, so the reasons add up exactly.

**Migration tests:**
- **M1 (replay):** when nothing was entered or paid after c.at, the plan balance at the end of c.date equals c.balance minus the unpaid manual plain bills (not history) dated up to c.date.
- **M2 (per entry type, replaces the old M2):** after c.at, an everyday expense or income dated ≥ c.date moves the plan balance by its amount; a savings move or debt payment moves it by 0 (and appears in `legacy.reasons`); a plain bill dated ≥ c.date moves it on its date whatever its paid state.
- **M3:** idempotent. **M4:** total on junk rows (falls back to c.date and c.balance; `legacy` absent).
- **M5:** the same fixture gives the same result in `Europe/Berlin` and `America/New_York` once `startAt` is fixed.
- **M6:** `legacy.reasons` add up to `after − before`.

**Existing installs:**
- **The owner's phone** gets payday mode, roll over on and a start at the latest check-in. The `model-intro` action card stays until the intro sheet is finished ("Not now" snoozes it for 24 h). The sheet shows:
  1. "On the update day: before €23 a day, now €41 a day. Why: your pay is counted +€X · savings plan no longer set aside +€40 · Visa minimum kept apart +€95 · other +€Y."
  2. Its starting point: "€Z on 31 Oct (your latest balance)". The alternative "Start from your first balance (€X on 14 Sep) to keep Look back's carry history" applies `startFromCheckIn(first)` with `startSource: 'migrated-first'` in one undo step, showing its per-day preview.
  3. Positive entries since the start that fall within ±3 days of a payday and within ±15% of its amount, **pre-ticked** as "That was my pay". "Confirm" converts the ticked ones (entry removed, the payday's amount set) in one undo step; unticked ones stay as extra money.
  4. Each secondary income with "counts N paydays since your start". "It started later" sets `from`.
  "Done" clears `introPending`.
- **Demo installs** migrate the same way. New sample data is seeded fresh (§2.6).

### 2.4 Backup schema v5

**`backupSchema.ts`:**
- `incomes`: optional `from`, `until` (isoDate). `paydayOverrides`: optional `date`; optional non-negative `amount`; optional `skipped: true`. `notes`: optional `doneAt`. `transactions`: optional `adjust: true`. `envelopes`: optional `pastBudgets` (array of `{until: isoDate, amount: non-negative cents}`).
- `metaValueSchemas.plan`: `planBy` enum, `startDate`/`startAt` nullable, `startingBalance` signed `cents` (the unsafe-amount rule applies), `rollover`, `buffer` (non-negative), `startSource`, optional `introPending`, optional `legacy`.
- `settingsSchema` keeps accepting `buffer` (old files); the v5 transform moves it.

**`backup.ts`:**
- Integrity rejects (`invalid-shape`): an income with `from > until`; an override with none of date, amount or skipped; `pastBudgets` not strictly sorted by `until`.
- Overlapping primary ranges are tolerated (the domain picks the latest `from`).
- `meta.periodClose` is still accepted and exported (round-trips) but never read.
- `setupOnly` passes incomes with `from`/`until` and envelopes with `pastBudgets`.

| File ↓ / App → | v4 app | v5 app |
|---|---|---|
| v1–v4 file | as today | migrates 1→5 with the device's transform; start rebuilt from the file's check-ins; `introPending` comes with it, so the intro card shows (R15) |
| v5 file | refused: `newer-schema` ("Update the app first") | round-trips deep-equal |
| v5 demo file | refused | setup tables only; the device keeps its `settings` and `plan`, so Today asks for a starting balance |

Why bump the version? A v4 app would silently drop `plan`, the new fields and `pastBudgets`, fall back to check-ins that are no longer written, and reject overrides without `date`. Refusing is the honest answer.

### 2.5 Write APIs (undoable through `mutate`, one undo step each)

| Repo | API | Notes |
|---|---|---|
| meta | `setPlan(patch, label)` | Writes only `meta.plan`, so undo never touches appearance settings (R10). Recomputes `startAt` when `startDate` changes. `updateSettings` stays non-undoable for appearance. |
| setup | `completeSetup(balance, today)` | Writes the income and `plan {startDate: today, startAt, startingBalance, startSource: 'user'}`, no check-in. Idempotent in one transaction. |
| incomes | `addIncome` (with `from`), `splitIncomeFrom(id, nominal, patch)`, `stopIncome(id, untilNominal)`, `removeIncome(id, today)` (stops after the last payday ≤ today when there are paydays since the start; otherwise deletes), `deleteIncomeEverywhere(id)` (confirmed), `setPaydayOverride(incomeId, original, {date?, amount?, skipped?})` (merges; deletes the row when empty), `convertEntriesToPay([...])` | Split labels start with "Edit", so the demo cap doesn't count them. Overrides with nominal ≥ split move to the new row; both halves keep `primary` (R16). |
| bills | `stopBillFrom(id, date)` | `splitSeriesFrom` with no remainder; soft-deletes the bill when no dates are left. |
| debts | `logDebtPayment(debtId, amount, date, minimum?)` | Always writes a debt transaction with its real date. With `minimum`, also marks that occurrence paid (`paidAmount = amount`) and sets the tx's `billOccurrenceId`. `editDebtPayment`, `deleteDebtPayment` (a linked minimum goes back to due in the same step). |
| bills (tick) | `markPaid` on a debt minimum | Label "Mark bill paid": free in the demo; counted as a payment at its due date. |
| funds | `addToFund` (any date), `spendFromFund(fund, amount, date, note)` (R23), `markSavingsMoved(fund, amount, date)` (label "Mark moved to …") | All are fund transactions (txKind saving). |
| envelopes | `setEnvelopeBudget(id, amount, periodStart)`, `scaleEnvelopeBudgets(from, to, periodStart)` | Both write `pastBudgets` so history keeps its budgets. |
| corrections | `addCorrection(amount, date, note)` | `adjust: true`, label "Add correction". |
| notes | `setNoteDone(id, done)`; `saveNote` keeps `doneAt`; `savePeriodNote(P, text)` re-keys a note found under another start (R24) | |
| catchUp | `applyFreshStart({ paid, archive, start?, correction? })` | `start` sets the plan start; `correction` writes one correction. No check-in. |
| intro | `applyIntroStart(which)`, `confirmPayMatches(ids)`, `setIncomeFrom(id, from)`, `finishIntro()` | |
| checkIns | `listCheckIns`, `latestCheckIn` only | Writers removed. |

**Demo cap:** labels starting "Edit" or "Mark" never count (R20). Every other add counts as before.

### 2.6 Demo seed (`db/seed/demo.ts`)

- No check-ins. Settings `{ envelopesEnabled: true }`; plan `{ planBy: 'month', rollover: true, startDate: first day of last month, buffer: 5000, startSource: 'user' }`.
- `startingBalance` is solved so last month carries €150–250 and this month's S is clearly positive.
- Budgets become monthly: `scaleBudget(budget, 26, 12)`. History before the start still fills Look back (cash basis).
- The buffer trick is removed. The extra card payment stays a debt transaction.
- **Test (R20):** build the seed for every day of 2026 and 2027, in both modes: S > 0, hero > 0, no tight card, a carried line from the second month.

> **Interview angle:** "How do you evolve stored data safely?" Version every database and file. Write migrations as pure functions that run the same way on device upgrade and on import. Inject the clock and time zone. Snapshot before upgrading and keep a way to download it. Old readers refuse newer files instead of guessing.

---

## 3. What is removed or repurposed

| Thing | What happens |
|---|---|
| `domain/reconcile.ts` | Deleted (a frozen copy lives in `domain/legacy/v4Today.ts` for the migration only). `isSpend` becomes `txKind`. `checkInPlan` becomes `catchUp.settlePastBills`. |
| Check-ins | Table stays, read-only: backups, migration, intro, Reports' legacy list, garden points. `addCheckIn`, `reconcileCheckIn`, `writeCheckIn`, `deleteCheckIn`, `useLatestCheckIn`, `CheckInSheet.tsx` are deleted. "Balance from 2 days ago · Update" goes. |
| Re-anchoring | Replaced by editing the start in Money basics, the optional correction, and "Start fresh" in catch-up. One shared `StartBalanceSheet`. |
| Catch-up fresh start | No balance question. (1) Marks past manual bills paid with "Mark all paid" (bookkeeping, S unchanged; autopay ones already read as paid). (2) Archives expired 48h items. (3) Optional "Fix a drift" (correction) or "Start fresh from today with €X". |
| Payday check-in and stale-balance actions | Removed; replaced by `period-closed` and `payday` (backup moments). |
| Quick-add "Already in your bank balance?" | Removed. `inBalance` is never written. |
| Math sheet "Next pay: not counted yet" | Removed. |
| Look back carry-over | `carryOver()`, `PeriodClose`, `recordCarryOver`, `features/review/carry.ts` removed. Rows get `carriedIn` and `leftover` from the ledger. |
| **Look back and Reports rule (R12)** | **Before `startDate`: cash basis** (paid bills by entry date, paydays dated ≤ today, logged entries; dates before a bill's `addedOn` left out). **From `startDate`: accrual.** The current row uses the same accrual as Today, labelled "planned to 30 Nov", with leftover null. `reportAgreement.test` pins it in both modes. |
| Look back totals | `periodTotals {income, bills, spending, corrections, net}` plus a separate `{saved, debtPaid}`. Savings and debt never enter `net`. `historyStart` = min(startDate, first check-in, first transaction). |
| Reports balances | `planBalanceStart = budgetBalance(from)`, `planBalanceEnd = budgetBalance(to + 1)`, labelled "Plan balance (savings and debt kept apart)", null before the start. The legacy check-ins table prints only when rows fall in the range. Summary: Money in, Bills, Spending, Corrections, Left over, then Savings and Debt blocks. |
| `domain/plan.ts` `periodIncome` | Deleted; the file now holds `PlanSettings`. |
| `BackupMomentSheet` `carried` | Becomes `closed: {label, leftover}`. |
| `nextAction` | `stale-balance`, `payday-checkin`, `balanceAgeDays`, `paydaySinceCheckIn` go. |
| `AppBadge` | Window starts at max(startDate, today − 92). |
| Garden | Check-in points frozen; new outcomes added. |
| Insights | `CategoryId` becomes `'everyday' \| 'bills'`. Savings, debt and corrections leave `spendByCategory`, `spendOutsideEnvelopes` and the donut. "Actual" for bills = entries dated ≤ today, not skipped (R4). |
| `ComingUp`'s own expansion and the calendar's | Replaced by CORE's `domain/dayItems.ts` (R14). |

---

## 4. Screen by screen, for the 8 requests

**Navigation:** bottom bar **Today · Plan · Calendar · Goals · More** (Simple mode: Today · Calendar · More). Goals sub-navigation **Overview · Savings · Debt** (`/goals`, `/goals/savings`, `/goals/debt`). `/bills?…` redirects to `/calendar?…`. URL contract: `/calendar?day=YYYY-MM-DD` opens that Day sheet.

**Shared day list (CORE, `domain/dayItems.ts`):**
```ts
type DayItem =
  | { kind: 'payday'; line: PaydayLine }                  // amount after overrides; skipped flagged
  | { kind: 'bill'; entry: BillEntry; status: EffectiveStatus }
  | { kind: 'debt-min'; entry: BillEntry; status: EffectiveStatus; debtId: Id }
  | { kind: 'saving-plan'; fundId: Id; amount: Cents }    // on primary paydays until the plan is met
  | { kind: 'note'; note: Note }
  | { kind: 'tx'; tx: Transaction; txKind: TxKind }
export function itemsBetween(range: DateRange, input: LedgerInput, today: ISODate): DayItem[]
export function comingUp(items: DayItem[], today: ISODate, opts = { max: 5, horizonDays: 45 }): DayItem[]
```

### 4.1 Item 1: Today

1. **Greeting and "Just today"** (unchanged).
2. **Hero card:** "You can spend today", then `leftToday`. `<p data-testid="period-total">`: "**€2,486.70 safe to spend in November** · 21 days left" (payday mode: "€486.70 until payday · Wed 25 Nov"). At most one helper line: the guard line when a guard is returned, otherwise "€2,000 of this arrives Wed 25 Nov." Then "See the math". Short: "€38 short this month" in neutral ink, with one suggestion.
3. **Plan-change announcement (R2):** any write that changes S shows a toast and updates a polite live region: "Safe to spend in November €2,486.70 → €2,586.70" (CORE helper `features/shared/planDelta.ts`).
4. **One action card**, first match wins: `payday-unknown` → `model-intro` (until finished) → `overdue-bill` (manual plain bills and debt minimums; "It's already in your plan. This keeps your calendar tidy.") → `tight-before-pay` (guard.short; "See why" opens the math sheet's "Before your pay" block) → `period-closed`/`payday` (3 days, "Back up") → `savings-move` ("Done, I moved it" calls `markSavingsMoved`) → `month-hint` (once, first 7 days; for pay after the 7th: "You're paid on the 25th. Planning by pay period may fit you better.") → `demo-try`, `backup`, `impulse`, `setup-bills`, `log-today`, `all-done`. No card ever asks for a bank balance.
5. **Quick-add**, "Can this fit?", "All entries" (unchanged).
6. **"Savings and debt" tiles**, captioned "Kept apart from your spending money", each a 44 px link: Saved across every fund · Still owed · Debt minimums each month ("2 of 3 paid in November") · Goals in progress.
7. **Envelopes this month (R17):** the top 3 envelopes with a budget, paired planned/actual bars on one scale ("Groceries €84.50 of €300"), linking to Plan. Updates as soon as "12 coffee @groceries" is logged.
8. **Coming up** from `comingUp(...)`, header link "Open calendar". Plain bills and debt minimums: a real checkbox ("Car insurance, €120, due Wed 5 Nov, mark paid") with undo; autopay ones already ticked. Note: "Ticking doesn't change your number. It's already counted." Paydays: "+€2,000 · arrives", no checkbox; tap opens `/calendar?day=`. Savings plan: checkbox "Move €40 to Holiday". Notes: checkbox sets `doneAt`. Future-dated entries: no checkbox.
9. **Goals in motion:** top 3 unfinished life goals, status pill cycling with undo, target date, mini progress when linked. Header link "Open goals".
10. **Note for this month, garden glance.**

Desktop: left column 1–5, sticky right column 6–9. Just today: only 2–4. Simple mode hides 6, 7 and 9.

### 4.2 Item 2: Adding on the Calendar

Grid markers use shape and colour: Income ↑, Bill ■, Debt payment (path), Saving (sprout), Expense •, Note (pen). Each day's accessible name lists its items. The summary card shows "Left to pay this month" (plain bills, effective status) and "Debt payments this month €580, tracked in Debt".

**Day sheet** (`?day=`): "On this day" lists every item by type as `EntryRow`s with Edit and Delete. Sticky "Add to this day"; on an empty day the chooser opens at once. Step 1: six tiles in a 2×3 radio group (CORE `RadioTiles`, arrow keys): **Expense · Income · Bill · Saving · Debt payment · Note**. Step 2: a short form, amount first, with Back.

| Type | Stored as | Counts in S? |
|---|---|---|
| Expense (today or earlier) | Transaction, amount < 0, optional envelope chips | Yes |
| Expense, "Paid from savings: Holiday" (R23) | `spendFromFund` (fund withdrawal with the note) | **No** |
| Planned cost (Expense tile on a future day) | One-off bill on that date, optional envelope | Yes (bills) |
| Income, once | Transaction, amount > 0 (future shows "expected") | Yes |
| Income, repeating | New non-primary `IncomeSource`, anchored on the day, `from` = that day | Yes |
| "This pay is different" (on a payday) | `setPaydayOverride` (amount, move or skip) | Yes |
| Bill | BillForm (repeat, autopay, envelope), with an "It's a debt payment" link | Yes |
| Saving, once / each payday | `addToFund` (in or out; future = Scheduled) / `fund.perPeriod` | **No** |
| Debt payment | `logDebtPayment`; amount prefilled with the minimum; "This is my November minimum" ticked when a due minimum is within the month; "Every month" edits the minimum and due day | **No** |
| Note | Day note | No |

**Quick-add matcher (R18, `domain/quickAdd.ts`):** after parsing, `matchScheduled(entry, itemsBetween(today − 5, today + 5))` offers one-tap alternatives when the name matches (or the amount is within 5%): "That's Rent (mark paid)", "That's a Visa payment", "That's a Holiday move", "That's my Pay (already counted)". The default stays "Log as spending".

### 4.3 Item 3: Savings and Debt as their own sections

**Savings (`/goals/savings`):** strip (Saved so far · Combined target · Overall % · Put in this month). Fund cards: progress ring, "€2,400 of €6,000 · 40%", pace line, challenge line; + Add money · Edit · Delete (named confirmation with history). History: every move in and out, spends from the fund, Scheduled ones marked, each with Edit and Delete. Header note: "Savings never change your safe to spend. Log a move when you make it in your bank."

**Debt (`/goals/debt`):** strip (Still owed (estimate) · Minimums each month · Paid this month · Average interest). Focus order: highest interest first / smallest balance first. Debt cards: name, Focus badge, owed, APR, "€150 on the 8th", % paid bar, "Clear by Mar 2029"; + Log payment · Edit · Delete. History: payments and paid minimums with Edit and Delete. The edit sheet: "Balance on 1 Nov €3,200. Payments you log after that come off automatically." Payoff chart and table stay.

**Overview** keeps life goals, no-spend days, the 48h list and the garden. Plan side panels mirror these per period (§4.8).

### 4.4 Item 4: Envelope cards and actual vs planned (Plan)

Each card: dot and name, **+ Add spend · Rename · Delete** (Rename and Delete behind "More" on phones). **"Budget for November"** (`InlineMoneyInput`), saving on blur or Enter via `setEnvelopeBudget`, toast "Groceries budget €300 → €350 · Undo". A two-tone progress bar (CORE `TwoToneProgress`): spent solid, coming lighter; "€84.50 spent · €215.50 left", "€15 past the plan" (never red), or "No budget set · €21.30 spent" at budget 0. This period's entries newest first as `EntryRow`s; linked bills tagged "bill". Past periods: budget read-only (from `pastBudgets`), entries editable.

Period notes: `periodNoteFor(P, notes)` returns the note whose `periodStart` is in `[P.start, P.end)`, preferring `P.start`; saving re-keys to `P.start` in the same undo step (R24).

### 4.5 Item 5: Edit and delete on every log

One primitive, **`EntryRow`**: label, sub-line (date and type), amount, and two 44 px buttons named "Edit Burger spot" and "Delete Burger spot". Tapping the row opens Edit through the shared `EntrySheet`.

Delete rules: single entries soft-delete with "Deleted … · Undo" and 30 days in Recently deleted. Recurring bills: "Just this one (skip)" / **"Stop from here on" (default)** / "Delete everywhere, it was a mistake" (confirmed). Incomes: **"Stop after the last payday" (default)** / "Delete everywhere" (confirmed) (R5). Paydays: "Skip this payday". A debt payment linked to a minimum puts the minimum back to due. Funds and debts with history: named confirmation.

Applies to: Transactions log, envelope cards, Day sheet, Bills list, fund history, debt history, Coming up (tap opens it), corrections, notes and goals.

### 4.6 Item 6: Money basics (`/more/basics`) and Setup

1. **Plan by:** Calendar month / Pay period. Before switching, a preview: "November: €2,486.70 safe to spend → this pay period: €486.70". After the switch, optional "Adjust budgets to monthly (€300 → €650)", undoable.
2. **Starting balance:** amount with an "I'm overdrawn" switch, and "Tracking since" (≤ today). Live preview "Today would be €21.00 a day". Undoable. "What you had on that date. Steady counts everything from there."
3. **Roll over what's left:** a switch, explained with the user's numbers ("October ended with €120 left. On: November starts with €120. Off: November starts with just your pay."), plus "If a month runs past the plan, the next starts lighter" and the late-pay hint.
4. **Check against your bank (R8, optional):** "Steady thinks your account holds about €1,712 (savings and debt moves taken off)." "My bank shows…" works out the difference, or "Roughly how much went unlogged?" takes it directly. Preview: "Add a −€120 correction today? Safe to spend €X → €Y." Writes one correction.
5. **Currency:** the existing picker and rule.
6. **Keep a cushion:** `plan.buffer`, undoable.

**Setup** stays at 4 steps; last heading unchanged ("What's in your account right now?"); field label **"Starting balance"**, hint "Steady counts from here. Change it any time in Money basics." Writes the plan start for today.

### 4.7 Item 7: Safe to spend = income − bills − expenses

Hero line, Plan strip, math sheet and bar read the same `PeriodPlan`. The math sheet shows the lines, then "÷ 21 days = €118.41 a day". When a guard exists, a "Before your pay on Fri 25 Dec" block: money in the account now (estimate), bills and debt minimums before then, December's budgets, "= about €18.99 a day". The A2 footer is always there.

### 4.8 Item 8: Charts (Plan)

1. **`PeriodSwitcher`** "‹ November 2026 ›": from the start of history to 12 periods ahead ("planned"), "Back to now", live region. Periods before tracking: cash-basis flows with "Before you started tracking".
2. **Strip (2×2):** Money in · Bills · Spending · Safe to spend. Under it: "Carried in from October €120" or "Starting balance €900 on 3 Nov · Edit".
3. **Left to spend:** "€2,486.70 safe to spend", stacked bar (CORE `StackedBar`): Started lighter, Bills, Spent (solid), Corrections, Still in envelopes (hatched), Cushion (dotted), Safe (outlined); labels on wide segments and a legend list with amount and %. **Beside it (below on phones): "Separate from your spending money"** — Savings this month ("€40 put in of €40 planned · €9,000 saved · + Add money") and Debt this month ("€50 paid · €95 due 15 Nov · €25,400 still owed · + Log payment").
4. **Budget vs actual:** rows = envelopes with a budget plus **Bills** (unlinked plain bills; planned = all in the period, actual = dated ≤ today, not skipped). Never savings, debt or corrections. Phones: horizontal paired bars on one `niceMax` scale (CORE `PairedBars`). Desktop: vertical pairs on one baseline, scrolling sideways past 10 rows. Each bar is a button with a tip; "Show as a table". Past periods use `pastBudgets`.
5. **Spending distribution donut:** actual spending and plain bills only, $ and % per slice, at most 6 slices plus "Everything else (n)", hairline separators, envelope colours, total in the centre.
6. **Envelope cards** (§4.4).
7. **Money in this month:** rows opening the payday's Day sheet, "+ Add income".
8. **Note for this month, "Can this fit?"** (folded).

**Help (`/more/help`):** "How each section works" cards (Today, Plan, Calendar, Goals: Savings and Debt, Envelopes, Look back and Reports, Money basics, More) and FAQ: how safe to spend is worked out; why savings and debt don't lower it (and why the number can be above the bank balance, and how "Check against your bank" helps); what roll over does; month or pay period; "Where did Update balance go?"; what a correction is.

---

## 5. Build plan

**Git:** branch `v2/core` from `master`. After CORE merges, worktrees `v2/lane-a` … `v2/lane-d` from the core commit, merged back in the order in §5.3. Commit at each milestone. **Every deploy needs the owner's explicit OK.**

**R0 (before CORE, its own small commit):** the v4 update toast gains "Back up first" (saves a backup, then refreshes). It helps every future schema change. Deploy it only with the owner's OK, ideally a few days before v5.

### 5.1 CORE (sequential; must merge first)

When CORE is done, the app compiles, Today shows the new number, every existing e2e spec passes **after the edits listed in C6**, and every lane has frozen contracts.

**C1. Domain**
- New: `period.ts`, `ledger.ts` (txKind, flows, owedAtStart, budgetBalance with a memoized sorted daily-flow index and prefix sums, cash, carriedIn, leftover, envelope usage, `budgetFor`, `planFor(period, input): PeriodPlan`), `pace.ts`, `legacyStart.ts`, `legacy/v4Today.ts` (frozen copy), `dayItems.ts` (`itemsBetween`, `comingUp`, `effectiveStatus`), `plan.ts` (PlanSettings).
- Rewritten: `safeToSpend.ts` (lines, `simpleLines`, `leftToSpendBar`), `today.ts` (`no-start`, `no-payday`, `ready {plan, runway, guard, nextPayday, accountEstimate}`), `runway.ts` (txKind; `canFit` with checkpoints).
- Changed: `paySchedule.ts` (from/until, optional override date, `primaryAt`), `bills.ts` (`paydayEntriesBetween` applies amount, skipped, from and until; slot), `savings.ts` (asOf, `periodSavings`), `debt.ts` (`debtPayments`, `owedNow`, `periodDebt`), `insights.ts` (A2 categories, actual rule), `review.ts` (`periodRows`, cash before the start), `report.ts`, `yearSummary.ts`, `transactionLog.ts`, `catchUp.ts` (`settlePastBills`), `nextAction.ts` (remove the two kinds and their fields only), `garden.ts` (txKind), `money.ts` (`largestRemainder`), `settings.ts`.
- Deleted: `reconcile.ts`.

**Contracts** (frozen after CORE):

```ts
interface PeriodPlan {
  period: Period; window: DateRange | null; carriedIn: Cents | null; carriedKind: 'start' | 'rollover' | 'none'
  income: { total: Cents; paydays: PaydayLine[]; logged: Transaction[] }
  corrections: { total: Cents; rows: Transaction[] }
  bills: { total: Cents; entries: BillEntry[]; owedAtStart: BillEntry[] }
  expenses: { total: Cents; rows: Transaction[] }
  envelopes: EnvelopeUsage[]; reserved: Cents; buffer: Cents
  safe: Cents | null; status: 'ok' | 'short'; lines: BreakdownLine[]; leftover: Cents | null
  savings: PeriodSavings; debt: PeriodDebt
}
interface Guard { perDay: Cents; until: ISODate; short: boolean; lines: BreakdownLine[] }
```
Plus `DayItem`/`itemsBetween`, the URL `?day=`, and `data-testid="period-total"`.

**C2. Data:** `types.ts`, `settings.ts`, `schema.ts` v5, `migrations.ts` [5] (factory), `snapshot.ts` (60-day migration snapshots, `exportSnapshotAsBackup`), `backupSchema.ts`, `backup.ts` integrity, `repos/meta.ts` (`setPlan`, `plan` exported, `notices` internal), every repo API in §2.5, `db/demo.ts` ("Mark" labels), delete `repos/review.ts` and the check-in writers, `hooks.ts` (`usePlan`).

**C3. Shared app layer:** `features/shared/usePlanModel.ts` (all rows and settings, memoized `LedgerInput`, `today: TodayPlan`, `planFor(period)`), `features/today/useTodayModel.ts` on top of it, `features/shared/{EntrySheet,StartBalanceSheet,planDelta}.tsx`; UI primitives `ui/{EntryRow,PeriodSwitcher,InlineMoneyInput,RadioTiles,StackedBar,TwoToneProgress,PairedBars,StatusPill}.tsx` and `ui/index.ts`; `app/useDeleteWithUndo.ts`; `features/bills/format.ts` (`periodLabel`) and `useBillsData.ts` (`periodAt`); `app/App.tsx` routes (`/calendar`, `/bills` redirect, `/goals/savings`, `/goals/debt`, `/more/basics`) and `app/tabs.ts`; a minimal `features/settings/MoneyBasicsScreen.tsx` (start amount and date, plan by, roll over); `QuickAddProvider.openSheet(prefill?: {envelopeId?, date?})`.

**C4. Every consumer compiles and is correct (minimal changes).** From `grep` of the replaced APIs: `db/hooks.ts`, `app/AppBadge.tsx`, `features/bills/{BillsScreen,PaydaysView,useBillsData}`, `features/catchup/FreshStart.tsx`, `features/goals/{FundsSection,useGarden}`, `features/plan/{EnvelopeEntriesSheet,EnvelopesSection,PastPeriod,PlanScreen}`, `features/quickadd/QuickAddProvider.tsx` (prompt removed), `features/reports/{presets,reportPdf,useReportInput}`, `features/review/{PrintReport,ReviewScreen,useReviewData,InsightsCharts,InsightsSection,InsightsTable,insightRows}`, `features/today/{CanFitSheet,MathSheet,TodayScreen,useTodayModel}` (hero lines, `period-total`, guard line, no-start state), `features/transactions/TransactionsScreen.tsx`, `features/backup/BackupMomentSheet.tsx`, `features/setup/SetupScreen.tsx` (label). Delete `CheckInSheet.tsx`.

**C5. Demo seed** (§2.6), including the every-day positivity test.

**C6. E2E**
- `e2e/helpers.ts`: `answerSetup` fills "Starting balance"; new `fixClock(page, iso)` and `planTotal(page)` (reads `period-total`); `heroCents` unchanged.
- Assertions CORE breaks, changed inside CORE (R13):
  - `midnight.spec`: month mode from 2 to 3 Nov reads "29 days left" then "28 days left"; drop "18/17 days to payday" and "balance from yesterday".
  - `log.spec` and `mobile.spec`: "Use envelopes" is already on, so the helper only turns it on when off; `mobile.spec` "Note for this payday" becomes "Note for this month".
  - `a11y.spec`: `/calendar` with heading "Calendar"; nav link "Calendar".
  - `bills.spec`: nav link "Calendar".
  - `demo.spec`: Insights table rows without "Debt"; "You carried … into this payday" becomes the Look back carried-in line.
- New `e2e/money.spec.ts`, clock at 2026-11-03T10:00+01:00: setup with payday 25 Nov, monthly €2,000, start €900 → planTotal €2,900; "12 coffee" lowers the hero by exactly €12; a €50 bill on 20 Nov lowers planTotal by €50; a pay edit "from this period on" to €2,100 raises planTotal by €100 and the hero changes; Money basics switch to payday mode shows the preview and then €850; at 1 Dec, a carried line with roll over on and none with it off, and no tight card either way.
- Named owners after CORE: `today.spec`/`first-run.spec` → Lane A; `mobile.spec` → Lane B; `bills.spec`/`log.spec`/`calendar.spec` → Lane C; `backup.spec`/`reports.spec`/`goals.spec`/`settings.spec` → Lane D; `a11y.spec`, `demo.spec`, `offline.spec`, `midnight.spec`, `money.spec` → integrator.

**CORE tests (green before any lane starts):**
- Properties (extend `arbWorld` with planBy, startDate ≤ today, signed B, roll over, funds, debts, debt bills, overrides with amount or skipped, from/until, primary chains, corrections, pastBudgets, autopay, future-dated rows): I1–I11, and a month → biweekly → month budget scaling round trip within one unit.
- Tables: §1.9 in both modes (guard values, pay-edit deltas, roll-over-off December), every case in §1.7, owedAtStart cases (one-off before the start counts; recurring before it was added doesn't; paid after `startAt` still counts; autopay never counts).
- Migration and backup (fake-indexeddb): a new `fixtures/v4.ts` (two check-ins on the first day and a later one, same-day transactions created before and after, an `inBalance` row, a pending older row, a bill paid at the check-in, an autopay bill auto-marked, a debt bill with an envelope, a secondary income, a hand-logged pay entry, a buffer). M1–M6. Device upgrade v1→5 equals importing a v1 file. A v5 file into the v4 validator gives `newer-schema`. Rejections: `from > until`, startingBalance 12.5, startDate 2026-02-30, an empty override, unsorted `pastBudgets`. v5 deep-equal round trip. A v5 demo file restores setup only, keeping from/until and pastBudgets. Importing a v4 file sets `introPending`.
- Repos: `completeSetup` writes no check-in and is idempotent; `splitIncomeFrom` moves overrides and keeps both halves primary; `removeIncome` stops after the last payday (closed leftovers unchanged); `setPaydayOverride` merges and clears; `logDebtPayment` with and without `minimum`, and delete restores the minimum; `stopBillFrom`; `applyFreshStart` with and without `start`/`correction`; **undo of `setPlan` after a theme change keeps the theme**; demo cap ignores "Edit…" and "Mark…".
- Components: MathSheet lines add up in both views; Today shows "safe to spend in November"; the setup label.
- Perf: 3 years of rows, `planFor` under 50 ms.
- Gate: `npx prettier --write src e2e && npm test && npm run build && npm run lint && npm run build:demo`, then `npm run e2e -- --project=chromium` and the demo project.

**Frozen after CORE** (a lane that needs a change writes it in its PR description for the integrator; **new additive files in `src/ui/` are allowed through the integrator**):
- `src/domain/{types,settings,plan,period,ledger,safeToSpend,pace,today,runway,legacyStart,dayItems,paySchedule,bills,recurrence,savings,debt,insights,review,report,yearSummary,money}.ts` and `src/domain/legacy/**`
- `src/db/**`, `src/features/shared/**`, `features/today/{useTodayModel.ts,MathSheet.tsx}`, `features/bills/{format.ts,useBillsData.ts}`, existing `src/ui/**`, `src/app/{App,tabs,routes}.tsx`, `e2e/helpers.ts`

### 5.2 Parallel lanes

**Lane A: Today (items 1 and 7; action card, catch-up, garden)**

Owns: `features/today/*` (except the frozen two), new `TodayTiles.tsx`, `EnvelopeGlance.tsx`, `GoalsInMotion.tsx`, `ModelIntroSheet.tsx`, `ComingUp.tsx`, `ActionCard.tsx`, `CanFitSheet.tsx`; `features/catchup/*`; `features/backup/BackupMomentSheet.tsx`; `features/goals/useGarden.ts`; `domain/{nextAction,catchUp,garden}.ts`; `e2e/today.spec.ts` (new), `e2e/first-run.spec.ts`.

Acceptance: tiles match fixture values; ticking a bill or debt minimum in Coming up leaves `planTotal` unchanged and undo restores it; autopay entries show ticked; paydays have no checkbox; a note checkbox sets `doneAt`; savings "Done" writes a fund move (free in the demo) and leaves S unchanged; the goal pill cycles with undo; the envelope glance moves on "12 coffee @groceries"; Just today and Simple mode hide the right parts; a `nextAction` priority table covers every kind; the intro card persists until "Done", its before/after reasons add up, and each choice is one undo step; the guard line shows exactly when a guard exists; catch-up offers the correction; garden points monotonic; axe clean on Today in light and dark.

**Lane B: Plan and charts (items 4 and 8; Plan side panels for item 3)**

Owns: `features/plan/*` (new `EnvelopeCard.tsx` replaces `EnvelopesSection.tsx` and `EnvelopeEntriesSheet.tsx`; `PastPeriod.tsx` becomes the period view); new `features/plan/charts/{LeftToSpendBar,BudgetVsActual,SpendingDonut,SidePanels}.tsx`; `features/review/{InsightsCharts,InsightsSection,InsightsTable,insightRows}`; `features/notes/PaydayNote.tsx`; `domain/{chartScale,categories}.ts`; `e2e/plan.spec.ts` (new), `e2e/mobile.spec.ts`.

Acceptance: bar segments add up (including a negative carry) — component test; an expense tagged Groceries raises its actual bar and donut slice by exactly that amount and lowers "left" (e2e); a budget edit has undo, doesn't change leftover, and the previous period still shows the old budget; budget 0 reads "No budget set"; Savings and Debt never appear as segments; no wrapped rows, one baseline (390 px and 1280 px); at most 6 slices plus the rest; the table matches the bars; the switcher spans history to 12 ahead with pre-tracking periods labelled; the period note survives a mode switch; axe clean on Plan.

**Lane C: Calendar, logs and quick-add (items 2 and 5)**

Owns: `features/bills/*` (except the frozen two; new `DayAddChooser.tsx`, `DayAddForms.tsx`; markers, `OccurrenceSheet`, `PaydaysView`, `IncomeForm` edit scopes and delete scopes, `BillForm` without the envelope picker on debt bills, the delete scope dialog); `domain/calendar.ts`; `features/quickadd/*`, `domain/quickAdd.ts` (matcher); `features/transactions/*`, `domain/transactionLog.ts` (totals split into In/Out, Savings moves, Debt payments, Corrections); `features/notes/NoteEditor.tsx`; `features/deleted/*`; `e2e/bills.spec.ts`, `e2e/log.spec.ts`, `e2e/calendar.spec.ts` (new).

Acceptance: each add type writes the row in §4.2; Expense, Income and Bill move `planTotal` exactly; Saving, Debt payment and "Paid from savings" leave it unchanged while the Savings and Debt totals change (e2e); a future-day expense becomes a one-off bill; pay edit "from this period on" shows "€X → €Y" and changes planTotal by δ × paydays in W, "this payday only" changes one payday, a skipped payday is excluded; deleting an income defaults to stopping and leaves Look back's closed rows unchanged; every log row has Edit and Delete with undo; deleting a recurring bill defaults to "Stop from here on"; the quick-add matcher offers "That's Rent (mark paid)" for "rent 950" and marking it changes nothing in S; `?day=` deep link works; the demo cap counts new adds but not edits or ticks; axe clean on the Calendar and the chooser.

**Lane D: Savings, Debt, Money basics, Setup, Help, Look back, Reports, Backup (items 3 and 6)**

Owns: `features/goals/*` (except `useGarden.ts`; sub-navigation, `FundsSection`, `FundSheet`, new `FundHistory.tsx`, life goals); `features/debts/*` (new `DebtHistory.tsx`, focus order, owedNow, "Looks paid off", the payment form with "This is my November minimum"); `features/settings/*` (`MoneyBasicsScreen` polish: live preview, mode-switch preview, budget scaling offer, cushion, currency, late-pay hint, "Check against your bank"); `features/setup/*`; `features/more/*`; `features/review/*` (except Lane B's four); `features/reports/*`; `features/backup/BackupScreen.tsx` (snapshot download); new pure helpers only in new files (e.g. `domain/debtHistory.ts`); `e2e/goals.spec.ts`, `e2e/settings.spec.ts` (new), `e2e/reports.spec.ts`, `e2e/backup.spec.ts`.

Acceptance: fund and debt histories list every move or payment with Edit and Delete; logging €50 on 9 Nov lowers "still owed" from 9 Nov and leaves the 15 Nov minimum due; changing the start amount or date moves Today at once and undo restores it (theme untouched); the mode switch previews S; turning roll over off removes the carried line in the next period; a correction moves S by its amount and shows in the math sheet and log; the currency rule is unchanged; Look back chains carried-in and leftover (I5) with cash-basis rows before the start; `reportAgreement.test` passes in both modes; the PDF shows plan balances and the legacy check-ins table only when there are rows; "Download the copy from before the update" produces a valid v4 file; Help has the FAQ entries; axe clean on Goals (three tabs), Money basics, Look back, Reports and Backup.

### 5.3 Merge and verification

1. **Merge order:** CORE, then D, then B, then C, then A (write paths first, Today's integration last). After each merge, rebase the remaining lanes and rerun `npm test` plus the Chromium e2e suite.
2. **Integration pass:** Help copy from all lanes; demo seed polish; Money basics, Savings, Debt, the Plan charts and the Day add sheet in `e2e/a11y.spec.ts` (light and dark); `demo.spec.ts` (hero > 0, month labels, tiles visible).
3. **Docs:** README (replace the "Reconciliation" decision with "Accrual money model", "Savings and debt kept apart (A2)", "Rollover as a closed form", "Advisory pace guard on cash"; update the features table and rounding list), DEV.md (v5 schema and migration notes, snapshot retention), PLAN.md §4.1 rewritten, new screenshots.
4. **Full gate:** prettier, typecheck, lint, `npm test`, `npm run build`, `npm run build:demo` (with `check-demo.mjs`), `npm run e2e` on Chromium **and** WebKit plus the demo project.
5. **Migration rehearsal on real data (R1):** export a v4 backup from the owner's phone, restore it into a local v5 preview, and explain the new S line by line against the old S using `legacy.reasons`. Check both starting points and the "That was my pay" list by hand against §2.3. Confirm the pre-migration snapshot exists and downloads.
6. **Release order:** R0 first (owner's OK), then the full app, then the demo (a v5 demo setup file is refused by a full app still on v4). Ask the owner for an explicit OK before each `npm run deploy` and `npm run deploy:demo`.

---

## 6. Risks

| # | Risk | Mitigation |
|---|---|---|
| 1 | Month mode with late-month pay: the hero (€118 a day) can exceed what lasts until pay (€19 a day). | Guard line under the hero, `tight-before-pay` card, month-hint suggesting pay periods for late pay, roll over on by default. The switch `PACE_GUARD_BINDS` makes the guard bind if the owner prefers (§7 Q1). |
| 2 | A2 with roll over: savings and debt money stays in the plan's leftover, so the plan can sit above the bank balance. | The guard works on cash; the account estimate and "Check against your bank" correction; Help and the math-sheet footer say it plainly. |
| 3 | The owner's number jumps at migration. | Latest check-in by default, before/after with named reasons, a persistent intro card, the first-check-in alternative, 60-day snapshot and its download, a line-by-line rehearsal on the real export. |
| 4 | Accrual counts expected pay; late or missing pay makes the number too high. | "Skip this payday" / "Different amount" from Coming up and the Calendar; the "arrives" line. |
| 5 | Money counted twice (pay logged and scheduled; "rent 950" logged and a Rent bill; "visa 95" as spending). | Quick-add matcher; intro conversion of old pay entries. |
| 6 | Drift from unlogged spending builds up forever with roll over on. | Corrections (one dated row, history kept); offered in catch-up and Money basics, never nagged. |
| 7 | Payday-mode history for schedules edited in place before v5. | Same limitation as today; the primary chain fixes it from v5 on. |
| 8 | Weekend-shifted paydays make `budgetBalance` differ between modes for a few days around a boundary. | Documented in I5/§1.7 case 20; table tests for 1 Nov and 31 Oct 2026. |
| 9 | Debt "still owed" ignores interest. | Labelled "estimate", explained in the edit sheet. |
| 10 | Schema bump: a v4 app refuses v5 backups; demo files from v5 are refused by a not-yet-updated full app. | `newer-schema` message, R0's "Back up first", release order full app before demo. |
| 11 | Time zones. | `startAt` stored once; tests in two zones. `addedOn` stays device-local (unchanged from today). |
| 12 | CORE is large and lanes could drift. | Frozen list, contract types, strict gate, shared `itemsBetween` and UI primitives, named spec owners. |
| 13 | Ledger performance over years. | Memoized sorted daily-flow index and prefix sums; perf test (3 years, < 50 ms). |
| 14 | The demo cap misses or over-counts new writes. | "Edit"/"Mark" label convention, covered by CORE repo tests. |
| 15 | Envelope budget not prorated for a mid-period start. | Conservative (returned at period end); the math sheet explains it. |
| 16 | Month-boundary tests are flaky. | Every money e2e fixes the clock with an explicit `+01:00` offset; the demo positivity test covers every day of two years. |

> **Interview angle:** "Cash vs accrual?" Cash basis counts money when it moves; accrual counts it when it is owed or earned. Steady v2 budgets on accrual inside each period (so ticks never jolt the number) and checks the pace on a cash estimate (so the advice matches the bank). Two views of the same rows, each used for what it is good at.

---

## 7. Questions for the owner (defaults ship if unanswered)

1. **Should the pace guard limit the hero?** Default: no (advice line and card only), because locked decision A requires a pay edit to move the number. Flip `PACE_GUARD_BINDS` to make it bind.
2. **With roll over off, should a shortfall still carry?** Default per locked A: carried-in is 0. The alternative is to carry `min(0, budgetBalance)` so an overspent plan starts the next period lighter even with roll over off. The guard already warns on cash either way.
3. **R0 release** (update toast "Back up first") before v5: needs a deploy OK.

---

## 8. Review disposition

**Accepted** (where it landed):

| # | Finding | Change |
|---|---|---|
| R1 | First check-in start inflates the number | Latest check-in default; first as an option; `legacy` snapshot with reasons; pre-ticked pay matches; persistent intro card; M2 replaced by per-type checks; real-data rehearsal (§2.3, §5.3) |
| R2 | Binding guard can ignore pay edits | Guard advisory by default; plan-change announcement; I10; money.spec pay-edit case (decision 1, §4.1) |
| R3 | Roll over off makes the guard cry wolf | Guard on cash; mode-switch preview; December roll-over-off table test (§1.4, §1.9, §4.6) |
| R4 | Nothing marks autopay paid any more | `effectiveStatus`; "actual" = dated ≤ today; I9 (decision 25) |
| R5 | Deleting an income rewrites closed periods | `removeIncome` stops after the last payday; confirmed "Delete everywhere"; I6 extended (decision 26) |
| R6 | ±7-day debt routing loses dates | Always a dated debt tx; explicit "This is my November minimum" link; txKind debt wins; no double count (decision 5, §1.6) |
| R7 | Guard ignores debt minimums | Unpaid minimums in `M_cash` and the "Before your pay" block (§1.4) |
| R8 | Drift can only be fixed by moving the start | `Transaction.adjust` corrections; "Check against your bank" (§2.1, §4.6) |
| R9 | Weekend shift puts pay in the wrong month | Nominal-month slot in month mode; tests for 1 Nov and 31 Oct 2026 (decision 24) |
| R10 | Undo of money settings reverts the theme | Own `meta.plan` key; undo test (decision 3) |
| R11 | Numbers depend on the time zone | `startAt`; two-zone tests (decision 27) |
| R12 | Look back/Reports before the start undefined | Cash before the start, accrual after, "planned to" current row (§3) |
| R13 | CORE breaks existing e2e specs | Every broken assertion listed and fixed in C6, plus `log.spec` which the review missed; named owners |
| R14 | Lanes duplicate logic and lack primitives | CORE `dayItems.ts` and UI primitives; full compile list in C4; additive ui files via the integrator |
| R15 | Intro card hidden after restoring an old backup | `introPending`/`startSource` in exported `plan` |
| R16 | Payday periods ambiguous after splits | Primary chain with disjoint ranges (decision 29) |
| R17 | Item 4 asks for the home page | Envelope glance on Today (decision 28) |
| R18 | Quick-add double counts | Matcher (§4.2) |
| R19 | Deferring dated budgets forces v6 | `pastBudgets` in v5 (decision 7) |
| R20 | Demo can show €0; ticks use entries | Every-day seed test; "Mark" labels free (§2.5, §2.6) |
| R21 | Weak rollback and release order | 60-day migration snapshot, download, R0, full app before demo |
| R22 | Budget 0 reads "past the plan" | "No budget set"; equivalence property |
| R23 | Spending from savings lowers S | "Paid from savings" as a fund withdrawal |
| R24 | Period notes vanish after a mode switch | `periodNoteFor` and re-key on save |
| R25 | Bar undefined for a negative carry | "Started lighter" segment; signed cases in I1 |

**Rejected or narrowed, with reasons:**

- **R7, "and savings plans too":** narrowed. The guard subtracts savings moves already made or dated in the future, but not per-payday **plans**. A plan is a choice the user may skip; counting it would make the advice line punish a goal that hasn't happened. Debt minimums are obligations, so they count.
- **R21, "keep demo setup exports at v4 when they use no v5-only fields":** rejected. It needs down-conversion code for a window that lasts until the buyer's full app reloads once. Deploying the full app before the demo and the existing `newer-schema` message ("Update the app first") cover it.
- **R3, "ask the owner whether earlier unpaid bills should carry with roll over off":** kept as owner question Q2 rather than a change. Locked decision A defines carried-in as 0 when roll over is off, and the cash-based guard already reflects the real shortfall.
- **R8, "About how much went unlogged?" as the only input:** narrowed to "My bank shows…" (works out the difference) with the rough-amount input as the second way. People know their bank balance better than their unlogged total. It stays optional and never nags, so it doesn't bring back the "update your balance" step the owner removed.
- **R2, "make the S line the main number":** not taken. The per-day hero is Steady's core strength ("one clear number"), and with the guard advisory a pay edit already moves it. S sits directly under the hero and is announced on every change.
