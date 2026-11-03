// The pay-based money model (PLAN-v2 §1.2, §1.4). Accrual: every flow counts in the
// period its date falls in, whether paid, due, received or expected, so ticking a bill or
// pay arriving never moves the number. Savings and debt never count (A2).
//
//   flows[a,b)       = income + corrections − plain bills − expenses, dated in [a, b)
//   budgetBalance(d) = B − owedAtStart + flows[startDate, d)
//   carriedIn(P)     = B (first period) | budgetBalance(P.start) (roll over) | 0
//   leftover(P)      = carriedIn + income − bills − expenses + corrections   (over the window)
//   S(P)             = leftover − still budgeted in envelopes − cushion
//
// Interview angle: carrying "last period's leftover" recursively costs O(periods²) over a
// year of Look back rows. budgetBalance as B + a prefix sum over one sorted list of dated
// flows makes every row a binary search: the range-sum-query trick.
import {
  billEntriesBetween,
  paydayEntriesBetween,
  type BillEntry,
  type PaydayLine,
} from './bills'
import { addDays, maxDate, minDate } from './dates'
import { debtPayments, periodDebt, type DebtPayment, type PeriodDebt } from './debt'
import type { Cents } from './money'
import type { Period, PeriodContext } from './period'
import type { PlanSettings } from './plan'
import { buildLines, LINE_LABELS, type BreakdownLine } from './safeToSpend'
import { periodSavings, type PeriodSavings } from './savings'
import type {
  Bill,
  BillOccurrence,
  DateRange,
  Debt,
  Envelope,
  Id,
  IncomeSource,
  ISODate,
  Note,
  PaydayOverride,
  SavingsFund,
  Transaction,
} from './types'

// --- Classifying entries (§1.2) -----------------------------------------------------------

export type TxKind =
  | 'income'
  | 'expense'
  | 'refund'
  | 'saving'
  | 'debt'
  | 'billPayment'
  | 'adjustment'

/** The one place that decides what a transaction is. Order matters (R6, R8). */
export function txKind(
  t: Pick<Transaction, 'fundId' | 'debtId' | 'billOccurrenceId' | 'adjust' | 'amount' | 'envelopeId'>,
): TxKind {
  if (t.fundId !== undefined) return 'saving' // either sign; never in the ledger (A2)
  if (t.debtId !== undefined) return 'debt' // wins over billOccurrenceId (R6)
  if (t.billOccurrenceId !== undefined) return 'billPayment' // legacy; the occurrence counts
  if (t.adjust === true) return 'adjustment' // drift correction (R8)
  if (t.amount < 0) return 'expense'
  return t.envelopeId !== undefined ? 'refund' : 'income'
}

export const isDebtBill = (b: Pick<Bill, 'debtId'>) => b.debtId !== undefined

/** Everyday money: what the income and spending totals are made of. */
export const isEveryday = (k: TxKind) => k === 'income' || k === 'expense' || k === 'refund'

// --- Input ---------------------------------------------------------------------------------

export type PlanMoney = Pick<
  PlanSettings,
  'planBy' | 'startDate' | 'startAt' | 'startingBalance' | 'rollover' | 'buffer'
>

/** Everything the money model reads. Rows may include soft-deleted ones; they're ignored. */
export interface LedgerInput {
  today: ISODate
  plan: PlanMoney
  incomes: readonly IncomeSource[]
  paydayOverrides: readonly PaydayOverride[]
  bills: readonly Bill[]
  occurrences: readonly BillOccurrence[]
  transactions: readonly Transaction[]
  envelopes?: readonly Envelope[]
  envelopesEnabled?: boolean
  funds?: readonly SavingsFund[]
  debts?: readonly Debt[]
  notes?: readonly Note[]
  /** Day each repeating bill entered the app (bills.addedOnMap). Earlier dates are history. */
  addedOn?: ReadonlyMap<Id, ISODate>
}

export const periodContext = (input: LedgerInput): PeriodContext => ({
  planBy: input.plan.planBy,
  incomes: input.incomes,
  overrides: input.paydayOverrides,
})

// --- The memoized index --------------------------------------------------------------------

/** Sorted dated amounts with prefix sums: Σ before any date in O(log n). */
class Series {
  private readonly dates: ISODate[] = []
  private readonly prefix: number[] = [0]
  constructor(points: { date: ISODate; amount: Cents }[]) {
    points.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    for (const p of points) {
      this.dates.push(p.date)
      this.prefix.push(this.prefix.at(-1)! + p.amount)
    }
  }
  /** Σ amounts dated before d. */
  before(d: ISODate): Cents {
    return this.prefix[lowerBound(this.dates, d)]!
  }
}

/** First index whose date is ≥ d. */
function lowerBound(dates: readonly ISODate[], d: ISODate): number {
  let lo = 0
  let hi = dates.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (dates[mid]! < d) lo = mid + 1
    else hi = mid
  }
  return lo
}

function sliceByDate<T extends { date: ISODate }>(
  rows: readonly T[],
  dates: readonly ISODate[],
  from: ISODate,
  to: ISODate,
): T[] {
  return from >= to ? [] : rows.slice(lowerBound(dates, from), lowerBound(dates, to))
}

export type CashKind = 'income' | 'corrections' | 'bills' | 'expenses' | 'savings' | 'debt'
export interface CashPoint {
  date: ISODate
  amount: Cents
  kind: CashKind
}

interface Index {
  from: ISODate
  to: ISODate
  txs: Transaction[]
  txDates: ISODate[]
  /** Every bill's entries (plain and debt) in the coverage, by date. */
  entries: BillEntry[]
  entryDates: ISODate[]
  /** Every active income's paydays in the coverage, by effective date. */
  paydays: PaydayLine[]
  owed: BillEntry[]
  owedTotal: Cents
  accrual: Series
  cashPoints: CashPoint[]
  cashDates: ISODate[]
  cash: Series
  payments: DebtPayment[]
}

// One index per input object: callers memoize the input (usePlanModel), so the bill and
// payday expansion and the prefix sums are built once per change, not once per period.
const cache = new WeakMap<LedgerInput, Index>()

// Coverage around the start and today; a query outside it widens it (rare: Look back
// years ago, or a period switcher far ahead). EDGE keeps shifted paydays and moved bills
// near the ends inside.
const PAD_BEFORE = 62
const PAD_AFTER = 460
const EDGE = 40

function indexFor(input: LedgerInput, from?: ISODate, to?: ISODate): Index {
  const anchor = input.plan.startDate ?? input.today
  let wantFrom = addDays(minDate(anchor, input.today), -PAD_BEFORE)
  let wantTo = addDays(maxDate(anchor, input.today), PAD_AFTER)
  if (from !== undefined) wantFrom = minDate(wantFrom, from)
  if (to !== undefined) wantTo = maxDate(wantTo, to)
  let ix = cache.get(input)
  if (ix && ix.from <= addDays(wantFrom, -EDGE) && ix.to >= addDays(wantTo, EDGE)) return ix
  ix = buildIndex(
    input,
    addDays(ix ? minDate(ix.from, wantFrom) : wantFrom, -EDGE),
    addDays(ix ? maxDate(ix.to, wantTo) : wantTo, EDGE),
  )
  cache.set(input, ix)
  return ix
}

/** The index, made to cover [from, to). */
const covering = (input: LedgerInput, from: ISODate, to: ISODate) => indexFor(input, from, to)

function buildIndex(input: LedgerInput, from: ISODate, to: ISODate): Index {
  const { plan, today } = input
  const start = plan.startDate
  const txs = input.transactions
    .filter((t) => t.deletedAt === undefined)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  const entries = billEntriesBetween(input.bills, input.occurrences, from, to)
  const paydays = paydayEntriesBetween(input.incomes, input.paydayOverrides, from, to)
  const owed = start === null ? [] : owedAtStartOf(input, entries)
  const owedTotal = owed.reduce((a, e) => a + e.amount, 0)

  const accrual: { date: ISODate; amount: Cents }[] = []
  const cash: CashPoint[] = []
  const debtEntries = entries.filter((e) => e.debtId !== undefined)
  const payments = debtPayments(txs, debtEntries, today)
  if (start !== null) {
    for (const p of paydays) {
      if (p.skipped || p.date < start) continue
      accrual.push({ date: slot(p, input.plan), amount: p.amount })
      cash.push({ date: p.date, amount: p.amount, kind: 'income' })
    }
    for (const t of txs) {
      if (t.date < start) continue
      const k = txKind(t)
      if (k === 'billPayment') continue
      const cashKind: CashKind =
        k === 'income'
          ? 'income'
          : k === 'adjustment'
            ? 'corrections'
            : k === 'saving'
              ? 'savings'
              : k === 'debt'
                ? 'debt'
                : 'expenses'
      cash.push({ date: t.date, amount: t.amount, kind: cashKind })
      if (k !== 'saving' && k !== 'debt') accrual.push({ date: t.date, amount: t.amount })
    }
    for (const e of entries) {
      if (e.status === 'skipped' || e.date < start || e.debtId !== undefined) continue
      accrual.push({ date: e.date, amount: -e.amount })
      cash.push({ date: e.date, amount: -e.amount, kind: 'bills' })
    }
    // Paid minimums with no linked transaction leave the account on their date (§1.4).
    for (const p of payments)
      if (p.source === 'minimum' && p.date >= start)
        cash.push({ date: p.date, amount: -p.amount, kind: 'debt' })
  }
  cash.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  return {
    from,
    to,
    txs,
    txDates: txs.map((t) => t.date),
    entries,
    entryDates: entries.map((e) => e.date),
    paydays,
    owed,
    owedTotal,
    accrual: new Series(accrual),
    cashPoints: cash,
    cashDates: cash.map((c) => c.date),
    cash: new Series([...cash]),
    payments,
  }
}

/**
 * Where a payday counts (§1.1, decision 24): month mode by its NOMINAL date, so a pay due
 * Sun 1 Nov that lands Fri 30 Oct still counts in November; payday mode by its effective
 * date. Never before the start: the start's own period takes anything clipped.
 */
export function slot(p: Pick<PaydayLine, 'nominal' | 'date'>, plan: Pick<PlanMoney, 'planBy' | 'startDate'>) {
  const d = plan.planBy === 'month' ? p.nominal : p.date
  return plan.startDate !== null && d < plan.startDate ? plan.startDate : d
}

/**
 * Plain bills still owed when tracking started (§1.4): dated in the 31 days before the
 * start, not skipped, not autopay (the bank took those before B), not history (dated
 * before the bill was added), and unpaid or paid after the start's first instant (R11).
 */
function owedAtStartOf(input: LedgerInput, entries: readonly BillEntry[]): BillEntry[] {
  const start = input.plan.startDate!
  const from = addDays(start, -31)
  const startAt = input.plan.startAt ?? `${start}T00:00:00.000Z`
  return entries.filter((e) => {
    if (e.date < from || e.date >= start) return false
    if (e.debtId !== undefined || e.status === 'skipped' || e.autopay) return false
    const added = input.addedOn?.get(e.billId)
    if (added !== undefined && e.date < added) return false
    return e.status === 'due' || (e.override?.paidAt ?? '') >= startAt
  })
}

export function owedAtStart(input: LedgerInput): BillEntry[] {
  return [...indexFor(input).owed]
}

// --- Balances ------------------------------------------------------------------------------

/** What the plan holds at the start of day d (null before tracking starts). */
export function budgetBalance(d: ISODate, input: LedgerInput): Cents | null {
  const start = input.plan.startDate
  if (start === null || d < start) return null
  const ix = covering(input, start, d)
  return input.plan.startingBalance - ix.owedTotal + ix.accrual.before(d)
}

/**
 * What the account should hold at the start of day d (§1.4, the pace guard's basis): the
 * same rows on a cash basis, plus savings moves and debt payments. An estimate: Steady
 * never sees the bank.
 */
export function cashAt(d: ISODate, input: LedgerInput): Cents | null {
  const start = input.plan.startDate
  if (start === null) return null
  const ix = covering(input, start, d)
  return input.plan.startingBalance - ix.owedTotal + ix.cash.before(maxDate(d, start))
}

/** Cash flows dated in [from, to), in date order (pace.ts reads them by kind). */
export function cashPointsBetween(input: LedgerInput, from: ISODate, to: ISODate): CashPoint[] {
  const ix = covering(input, from, to)
  return sliceByDate(ix.cashPoints, ix.cashDates, from, to)
}

/** Every bill entry (plain and debt) dated in [from, to), skipped ones included. */
export function entriesBetween(input: LedgerInput, from: ISODate, to: ISODate): BillEntry[] {
  const ix = covering(input, from, to)
  return sliceByDate(ix.entries, ix.entryDates, from, to)
}

/** Every active income's payday with an effective date in [from, to), skipped flagged. */
export function paydaysBetweenDates(
  input: LedgerInput,
  from: ISODate,
  to: ISODate,
): PaydayLine[] {
  const ix = covering(input, from, to)
  return ix.paydays.filter((p) => p.date >= from && p.date < to)
}

/** Live transactions dated in [from, to), oldest first. */
export function transactionsBetween(
  input: LedgerInput,
  from: ISODate,
  to: ISODate,
): Transaction[] {
  const ix = indexFor(input)
  return sliceByDate(ix.txs, ix.txDates, from, to)
}

/** Every debt payment (§1.6), oldest first, from the oldest debt balance date on. */
export function allDebtPayments(input: LedgerInput): DebtPayment[] {
  let from = input.today
  for (const d of input.debts ?? []) if (d.balanceAsOf < from) from = d.balanceAsOf
  return covering(input, from, addDays(input.today, 1)).payments
}

// --- Envelopes (§1.4) ----------------------------------------------------------------------

export interface EnvelopeUsage {
  id: Id
  name: string
  color: string
  isDefault: boolean
  /** budgetFor(envelope, period). 0 reads "No budget set" (R22). */
  budget: Cents
  /** Spending (net of refunds) plus linked plain bills, over the WHOLE period. */
  committed: Cents
  /** The part of committed dated on or before today. */
  spent: Cents
  /** The part dated after today: drawn lighter, as "coming". */
  scheduled: Cents
  /** clamp(budget − committed, 0, budget): still budgeted, kept out of safe to spend. */
  reserved: Cents
  /** Past the plan; calm text, never red. Always 0 at budget 0. */
  over: Cents
}

/** The budget a period had (R19): the past entry with the smallest until ≥ P.start. */
export function budgetFor(
  e: Pick<Envelope, 'budget' | 'pastBudgets'>,
  p: Pick<Period, 'start'>,
): Cents {
  let best: { until: ISODate; amount: Cents } | undefined
  for (const b of e.pastBudgets ?? [])
    if (b.until >= p.start && (best === undefined || b.until < best.until)) best = b
  return best?.amount ?? e.budget
}

const liveEnvelopes = (input: LedgerInput) =>
  input.envelopesEnabled ? (input.envelopes ?? []).filter((e) => e.deletedAt === undefined) : []

/**
 * Which envelope a row uses (§1.4): spending goes to its envelope if live, else the
 * default one (R13); a refund only to a live envelope it names. Undefined = none.
 */
function homeOf(t: Transaction, k: TxKind, live: ReadonlySet<Id>, fallback: Id | undefined) {
  if (t.envelopeId !== undefined && live.has(t.envelopeId)) return t.envelopeId
  return k === 'expense' ? fallback : undefined
}

function envelopeUsage(
  p: Period,
  input: LedgerInput,
  ix: Index,
  exclude: ReadonlySet<Id> | undefined,
): EnvelopeUsage[] {
  const envs = liveEnvelopes(input)
  if (envs.length === 0) return []
  const live = new Set(envs.map((e) => e.id))
  const fallback = envs.find((e) => e.isDefault)?.id
  const committed = new Map<Id, Cents>()
  const spent = new Map<Id, Cents>()
  const add = (id: Id, amount: Cents, date: ISODate) => {
    committed.set(id, (committed.get(id) ?? 0) + amount)
    if (date <= input.today) spent.set(id, (spent.get(id) ?? 0) + amount)
  }
  for (const t of sliceByDate(ix.txs, ix.txDates, p.start, p.end)) {
    if (exclude?.has(t.id)) continue
    const k = txKind(t)
    if (k !== 'expense' && k !== 'refund') continue
    const home = homeOf(t, k, live, fallback)
    if (home !== undefined) add(home, -t.amount, t.date)
  }
  const billEnvelope = new Map(input.bills.map((b) => [b.id, b.envelopeId]))
  for (const e of sliceByDate(ix.entries, ix.entryDates, p.start, p.end)) {
    if (e.status === 'skipped' || e.debtId !== undefined) continue // debt bills never (A2)
    const id = billEnvelope.get(e.billId)
    if (id !== undefined && live.has(id)) add(id, e.amount, e.date)
  }
  return envs.map((env) => {
    const budget = budgetFor(env, p)
    const c = committed.get(env.id) ?? 0
    const s = spent.get(env.id) ?? 0
    return {
      id: env.id,
      name: env.name,
      color: env.color,
      isDefault: env.isDefault,
      budget,
      committed: c,
      spent: s,
      scheduled: c - s,
      reserved: Math.min(budget, Math.max(0, budget - c)),
      over: budget > 0 ? Math.max(0, c - budget) : 0,
    }
  })
}

/** Envelope usage for any period, tracked or not (Budget vs actual reads it). */
export function envelopesFor(p: Period, input: LedgerInput): EnvelopeUsage[] {
  return envelopeUsage(p, input, covering(input, p.start, p.end), undefined)
}

// --- The period plan (§1.4, §5.1 contract) -------------------------------------------------

export interface PeriodPlan {
  period: Period
  /** [max(P.start, startDate), P.end); null when the period is before tracking. */
  window: DateRange | null
  /** Null before tracking. */
  carriedIn: Cents | null
  /** 'start': the starting balance; 'rollover': last period's leftover; 'none': 0. */
  carriedKind: 'start' | 'rollover' | 'none'
  income: { total: Cents; paydays: PaydayLine[]; logged: Transaction[] }
  corrections: { total: Cents; rows: Transaction[] }
  /** Plain bills only. `entries` are dated in the window (skipped ones left out). */
  bills: { total: Cents; entries: BillEntry[]; owedAtStart: BillEntry[] }
  /** Net of refunds; future-dated rows count. */
  expenses: { total: Cents; rows: Transaction[] }
  envelopes: EnvelopeUsage[]
  reserved: Cents
  buffer: Cents
  /** Safe to spend for the period; null before tracking. */
  safe: Cents | null
  status: 'ok' | 'short'
  /** They add up to `safe`. Empty before tracking. */
  lines: BreakdownLine[]
  /** carriedIn + income + corrections − bills − expenses (no reserve, no cushion). */
  leftover: Cents | null
  savings: PeriodSavings
  debt: PeriodDebt
}

/** S, the lines and the Savings and Debt panels for one period. */
export function planFor(period: Period, input: LedgerInput): PeriodPlan {
  return planWith(period, input, undefined)
}

/**
 * planFor with some transactions left out. Today uses it for S0, safe to spend as it was
 * at the start of the day (today's spending taken back out).
 */
export function planWith(
  period: Period,
  input: LedgerInput,
  exclude: ReadonlySet<Id> | undefined,
): PeriodPlan {
  const { plan, today } = input
  const start = plan.startDate
  const ix = covering(input, minDate(period.start, start ?? period.start), period.end)
  const envelopes = envelopeUsage(period, input, ix, exclude)
  const reserved = envelopes.reduce((a, e) => a + e.reserved, 0)
  const buffer = Math.max(0, plan.buffer)
  const savings = periodSavings(
    period,
    input.funds ?? [],
    ix.txs,
    ix.paydays.filter((p) => p.primary && !p.skipped && inPeriodBySlot(p, period, plan)).length,
    today,
  )
  const debt = periodDebt(
    period,
    sliceByDate(ix.entries, ix.entryDates, period.start, period.end).filter(
      (e) => e.debtId !== undefined,
    ),
    ix.payments,
    today,
  )

  if (start === null || period.end <= start) {
    return {
      period,
      window: null,
      carriedIn: null,
      carriedKind: 'none',
      income: { total: 0, paydays: [], logged: [] },
      corrections: { total: 0, rows: [] },
      bills: { total: 0, entries: [], owedAtStart: [] },
      expenses: { total: 0, rows: [] },
      envelopes,
      reserved,
      buffer,
      safe: null,
      status: 'ok',
      lines: [],
      leftover: null,
      savings,
      debt,
    }
  }

  const w: DateRange = { start: maxDate(period.start, start), end: period.end }
  const paydays = ix.paydays
    .filter((p) => p.date >= start && inRange(slot(p, plan), w))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.name.localeCompare(b.name)))
  const rows = sliceByDate(ix.txs, ix.txDates, w.start, w.end).filter((t) => !exclude?.has(t.id))
  const logged: Transaction[] = []
  const corrections: Transaction[] = []
  const expenseRows: Transaction[] = []
  for (const t of rows) {
    const k = txKind(t)
    if (k === 'income') logged.push(t)
    else if (k === 'adjustment') corrections.push(t)
    else if (k === 'expense' || k === 'refund') expenseRows.push(t)
  }
  const entries = sliceByDate(ix.entries, ix.entryDates, w.start, w.end).filter(
    (e) => e.status !== 'skipped' && e.debtId === undefined,
  )
  const owed = w.start === start ? ix.owed : []

  const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0)
  const incomeTotal =
    sum(paydays.filter((p) => !p.skipped).map((p) => p.amount)) + sum(logged.map((t) => t.amount))
  const correctionsTotal = sum(corrections.map((t) => t.amount))
  const billsTotal = sum(entries.map((e) => e.amount)) + sum(owed.map((e) => e.amount))
  const expensesTotal = -sum(expenseRows.map((t) => t.amount))

  let carriedIn: Cents
  let carriedKind: PeriodPlan['carriedKind']
  if (period.start <= start) {
    carriedIn = plan.startingBalance
    carriedKind = 'start'
  } else if (plan.rollover) {
    carriedIn = plan.startingBalance - ix.owedTotal + ix.accrual.before(period.start)
    carriedKind = 'rollover'
  } else {
    // Locked decision A, §7 Q2: with roll over off, every later period starts from 0.
    carriedIn = 0
    carriedKind = 'none'
  }
  const leftover = carriedIn + incomeTotal + correctionsTotal - billsTotal - expensesTotal
  const safe = leftover - reserved - buffer

  const lines = buildLines({
    carriedIn,
    carriedKind,
    carriedDate: carriedKind === 'start' ? start : period.start,
    rollover: plan.rollover,
    paydays,
    logged,
    corrections,
    entries,
    owedAtStart: owed,
    expenseGroups: expenseGroups(expenseRows, envelopes),
    expenses: expensesTotal,
    envelopes,
    showEnvelopes: envelopes.length > 0,
    buffer,
    today,
  })

  return {
    period,
    window: w,
    carriedIn,
    carriedKind,
    income: { total: incomeTotal, paydays, logged },
    corrections: { total: correctionsTotal, rows: corrections },
    bills: { total: billsTotal, entries, owedAtStart: [...owed] },
    expenses: { total: expensesTotal, rows: expenseRows },
    envelopes,
    reserved,
    buffer,
    safe,
    status: safe < 0 ? 'short' : 'ok',
    lines,
    leftover,
    savings,
    debt,
  }
}

const inRange = (d: ISODate, r: DateRange) => d >= r.start && d < r.end

function inPeriodBySlot(p: PaydayLine, period: Period, plan: PlanMoney) {
  return inRange(plan.planBy === 'month' ? p.nominal : p.date, period)
}

/** The Spending line's items: per envelope when envelopes are on, otherwise per day. */
function expenseGroups(
  rows: readonly Transaction[],
  envelopes: readonly EnvelopeUsage[],
): { label: string; amount: Cents; date?: ISODate }[] {
  if (envelopes.length > 0) {
    const live = new Set(envelopes.map((e) => e.id))
    const fallback = envelopes.find((e) => e.isDefault)?.id
    const byHome = new Map<Id | undefined, Cents>()
    for (const t of rows) {
      const home = homeOf(t, txKind(t), live, fallback)
      byHome.set(home, (byHome.get(home) ?? 0) - t.amount)
    }
    const out = envelopes
      .filter((e) => byHome.has(e.id))
      .map((e) => ({ label: e.name, amount: byHome.get(e.id)! }))
    if (byHome.has(undefined))
      out.push({ label: LINE_LABELS.noEnvelope, amount: byHome.get(undefined)! })
    return out
  }
  const byDay = new Map<ISODate, Cents>()
  for (const t of rows) byDay.set(t.date, (byDay.get(t.date) ?? 0) - t.amount)
  return [...byDay].map(([date, amount]) => ({ label: LINE_LABELS.expenses, amount, date }))
}

// --- Look back and Reports helpers ---------------------------------------------------------

/** carriedIn(P) on its own (§1.4). */
export function carriedIn(period: Period, input: LedgerInput): Cents | null {
  return planFor(period, input).carriedIn
}

/** leftover(P) on its own (§1.4). */
export function leftover(period: Period, input: LedgerInput): Cents | null {
  return planFor(period, input).leftover
}

/** Is this occurrence paid through a linked debt transaction? (Not counted twice, R6.) */
export function linkedOccurrences(txs: readonly Transaction[]): Set<string> {
  const out = new Set<string>()
  for (const t of txs)
    if (t.deletedAt === undefined && t.debtId !== undefined && t.billOccurrenceId !== undefined)
      out.add(t.billOccurrenceId)
  return out
}

export interface FlowTotals {
  income: Cents
  corrections: Cents
  bills: Cents
  /** Net of refunds. */
  spending: Cents
}

/**
 * The accrual totals over any date range, clipped to the start (§1.4): paydays by slot,
 * logged income, corrections, plain bills by entry date (owedAtStart too when the range
 * holds the start), spending net of refunds. For a period's window they equal planFor's.
 */
export function accrualTotals(range: DateRange, input: LedgerInput): FlowTotals {
  const start = input.plan.startDate
  const out: FlowTotals = { income: 0, corrections: 0, bills: 0, spending: 0 }
  if (start === null) return out
  const r = { start: maxDate(range.start, start), end: range.end }
  if (r.start >= r.end) return out
  const ix = covering(input, r.start, r.end)
  for (const p of ix.paydays)
    if (!p.skipped && p.date >= start && inRange(slot(p, input.plan), r)) out.income += p.amount
  for (const t of sliceByDate(ix.txs, ix.txDates, r.start, r.end)) {
    const k = txKind(t)
    if (k === 'income') out.income += t.amount
    else if (k === 'adjustment') out.corrections += t.amount
    else if (k === 'expense' || k === 'refund') out.spending -= t.amount
  }
  for (const e of sliceByDate(ix.entries, ix.entryDates, r.start, r.end))
    if (e.status !== 'skipped' && e.debtId === undefined) out.bills += e.amount
  if (r.start === start) out.bills += ix.owedTotal
  return out
}
