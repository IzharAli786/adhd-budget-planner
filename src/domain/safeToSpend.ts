// Safe to spend, pay-based (PLAN-v2 §1). One exact formula, returned as the lines that make
// it up so "See the math" renders the very numbers that produced the total.
//
//   safeToSpend = carriedIn + income − bills − expenses − cushion
//
// - carriedIn: the starting balance in the first period you ever use the planner; after
//   that, last period's leftover when "roll over" is on, otherwise 0.
// - income: paydays from the pay schedule plus income logged by hand, dated in the period.
// - bills: every non-debt bill dated in the period, paid or still pending (accrual: ticking
//   a bill paid never moves the number; it was already counted).
// - expenses: spending logged in the period, net of refunds.
//
// Savings moves and debt payments (and debt minimum bills) live in their own sections and
// never touch this number, income, or spending totals (locked decision A2).
import { budgetFor } from './categories'
import { billEntriesBetween, paydayEntriesBetween, type BillEntry, type PaydayEntry } from './bills'
import { addMonths, daysBetween, makeDate, maxDate, parseISODate } from './dates'
import type { Cents } from './money'
import type {
  Bill,
  BillOccurrence,
  Envelope,
  Id,
  IncomeSource,
  ISODate,
  PaydayOverride,
  Transaction,
} from './types'

export const ESTIMATE_NOTE = 'Estimate based on what you entered.'
export const WALLED_OFF_NOTE =
  'Savings and debt payments are tracked on their own and never change this number.'

// --- Classifying entries -----------------------------------------------------------------

export type TxKind = 'income' | 'expense' | 'refund' | 'saving' | 'debt' | 'billPayment'

export function txKind(
  t: Pick<Transaction, 'fundId' | 'debtId' | 'billOccurrenceId' | 'amount' | 'envelopeId'>,
): TxKind {
  if (t.fundId !== undefined) return 'saving'
  if (t.debtId !== undefined) return 'debt'
  // A legacy payment row for a bill: the bill entry itself is what counts.
  if (t.billOccurrenceId !== undefined) return 'billPayment'
  if (t.amount < 0) return 'expense'
  return t.envelopeId !== undefined ? 'refund' : 'income'
}

const isSpendKind = (k: TxKind) => k === 'expense' || k === 'refund'

// --- Periods -----------------------------------------------------------------------------

export type PlanBy = 'month' | 'payday'

export interface DateSpan {
  start: ISODate
  /** Exclusive. */
  end: ISODate
}

/** The calendar month containing `date`. */
export function monthSpan(date: ISODate): DateSpan {
  const { year, month } = parseISODate(date)
  const start = makeDate(year, month, 1)
  return { start, end: addMonths(start, 1) }
}

// --- The ledger --------------------------------------------------------------------------

export interface MoneyStart {
  /** The first day tracked. Money before it is inside `balance`. */
  date: ISODate
  /** Signed: what you had at the start of `date`. */
  balance: Cents
}

export interface LedgerInput {
  today: ISODate
  period: DateSpan
  start: MoneyStart
  rollover: boolean
  incomes: readonly IncomeSource[]
  paydayOverrides: readonly PaydayOverride[]
  bills: readonly Bill[]
  occurrences: readonly BillOccurrence[]
  transactions: readonly Transaction[]
  envelopes?: readonly Envelope[]
  envelopesEnabled?: boolean
  buffer?: Cents
}

export interface BreakdownItem {
  label: string
  amount: Cents
  date?: ISODate
  /** A bill already ticked paid, a payday already arrived. */
  done?: boolean
}

export type LineId = 'carried' | 'income' | 'bills' | 'expenses' | 'buffer' | 'total'

export interface BreakdownLine {
  id: LineId
  label: string
  /** Signed: what this line adds to (or takes from) the total. */
  amount: Cents
  date?: ISODate
  items?: BreakdownItem[]
}

export interface EnvelopeUsage {
  id: Id
  name: string
  color: string
  /** Planned for this period. */
  budget: Cents
  /** Actual so far: spending dated up to today plus linked bills already paid. */
  spent: Cents
  /** Still coming this period: future-dated spending and linked bills not yet paid. */
  linkedDue: Cents
  /** What is left of the budget: max(0, budget − spent − linkedDue). Not held back from safe to spend. */
  reserved: Cents
  /** How far past the budget it went, 0 if not (or if no budget is set). */
  over: Cents
}

export interface Flows {
  paydays: PaydayEntry[]
  loggedIncome: Transaction[]
  /** Non-debt bill entries, not skipped. */
  billEntries: BillEntry[]
  /** Expense and refund rows. */
  spending: Transaction[]
  income: Cents
  bills: Cents
  expenses: Cents
}

export interface SafeToSpend {
  total: Cents
  /** Every term of the formula, in order. They sum to `total`. */
  lines: BreakdownLine[]
  estimateNote: string
  /** A negative total reads "€38 short", never a red minus sign. */
  status: 'ok' | 'short'
  period: DateSpan
  /** The part of the period that is tracked: [max(start, startDate), end). */
  window: DateSpan
  /** The whole period ends before tracking started: actuals only, no carry. */
  beforeTracking: boolean
  carriedIn: Cents
  /** The first tracked period: carriedIn is the starting balance. */
  isStartPeriod: boolean
  income: Cents
  bills: Cents
  billsPaid: Cents
  billsPending: Cents
  expenses: Cents
  buffer: Cents
  /** Unpaid bills in the period (still to pay), by date. */
  dueEntries: BillEntry[]
  flows: Flows
  /** Money moved into savings (net) in the period. Shown, never subtracted. */
  savingsMoved: Cents
  /** Debt paid in the period: payments logged plus minimums ticked paid. Shown, never subtracted. */
  debtPaid: Cents
  /** One row per live envelope, in input order; empty while envelopes are off. */
  envelopes: EnvelopeUsage[]
  /**
   * Where the money went so far, for the "Spending distribution" donut: each envelope's
   * actual, plus bills that belong to no envelope. Without envelopes: bills and spending.
   */
  distribution: { id: string; name: string; color?: string; amount: Cents }[]
  /** Expenses dated today (refunds excluded), for the day's allowance. */
  spentToday: Cents
}

// `+ 0` turns −0 into 0, so an empty negated sum never prints as "−€0.00".
const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) + 0
/** −Σ without −0: 0 − 0 is +0, while −(0) is −0. */
const nsum = (xs: readonly number[]) => 0 - sum(xs)
const live = <T extends { deletedAt?: string }>(rows: readonly T[]) =>
  rows.filter((r) => r.deletedAt === undefined)
const within = (d: ISODate, s: DateSpan) => d >= s.start && d < s.end

/** Income, bills and spending dated in [from, to). Paydays count by the date they land. */
export function flowsBetween(
  input: Pick<
    LedgerInput,
    'incomes' | 'paydayOverrides' | 'bills' | 'occurrences' | 'transactions'
  >,
  span: DateSpan,
): Flows {
  if (span.end <= span.start)
    return {
      paydays: [],
      loggedIncome: [],
      billEntries: [],
      spending: [],
      income: 0,
      bills: 0,
      expenses: 0,
    }
  const txs = live(input.transactions).filter((t) => within(t.date, span))
  const paydays = paydayEntriesBetween(input.incomes, input.paydayOverrides, span.start, span.end)
  const loggedIncome = txs.filter((t) => txKind(t) === 'income')
  const billEntries = billEntriesBetween(
    input.bills,
    input.occurrences,
    span.start,
    span.end,
  ).filter((e) => e.debtId === undefined && e.status !== 'skipped')
  const spending = txs.filter((t) => isSpendKind(txKind(t)))
  return {
    paydays,
    loggedIncome,
    billEntries,
    spending,
    income: sum(paydays.map((p) => p.amount)) + sum(loggedIncome.map((t) => t.amount)),
    bills: sum(billEntries.map((e) => e.amount)),
    expenses: nsum(spending.map((t) => t.amount)),
  }
}

const net = (f: Flows) => f.income - f.bills - f.expenses

/**
 * What the plan says you had at the start of `date`: the starting balance plus every
 * tracked period's income minus bills and spending since. Used for roll over.
 */
export function balanceAt(input: LedgerInput, date: ISODate): Cents {
  if (date <= input.start.date) return input.start.balance
  return input.start.balance + net(flowsBetween(input, { start: input.start.date, end: date }))
}

export function safeToSpend(input: LedgerInput): SafeToSpend {
  const { today, period, start } = input
  const buffer = Math.max(0, input.buffer ?? 0)
  const beforeTracking = period.end <= start.date
  const isStartPeriod = !beforeTracking && period.start <= start.date
  const window: DateSpan = beforeTracking
    ? period
    : { start: maxDate(period.start, start.date), end: period.end }
  const carriedIn = beforeTracking
    ? 0
    : isStartPeriod
      ? start.balance
      : input.rollover
        ? balanceAt(input, period.start)
        : 0

  const flows = flowsBetween(input, window)
  const billsPaid = sum(flows.billEntries.filter((e) => e.status === 'paid').map((e) => e.amount))
  const dueEntries = flows.billEntries.filter((e) => e.status === 'due')
  const total = carriedIn + flows.income - flows.bills - flows.expenses - buffer

  // Kept apart: shown in the footnote and in their own sections.
  const periodTxs = live(input.transactions).filter((t) => within(t.date, window))
  const savingsMoved = nsum(periodTxs.filter((t) => txKind(t) === 'saving').map((t) => t.amount))
  const debtBills = billEntriesBetween(input.bills, input.occurrences, window.start, window.end)
  const debtPaid =
    nsum(periodTxs.filter((t) => txKind(t) === 'debt').map((t) => t.amount)) +
    sum(debtBills.filter((e) => e.debtId !== undefined && e.status === 'paid').map((e) => e.amount))

  const envelopes = input.envelopesEnabled ? live(input.envelopes ?? []) : []
  const usage = envelopesUsage(input, envelopes)
  const liveEnvelope = new Set(envelopes.map((e) => e.id))
  const envelopeOfBill = new Map(input.bills.map((b) => [b.id, b.envelopeId]))
  // The chart's slices all cover the whole period, like the envelope actuals (a budget
  // belongs to its month), so bills outside any envelope use the same range.
  const periodBills = billEntriesBetween(
    input.bills,
    input.occurrences,
    period.start,
    period.end,
  ).filter((e) => e.debtId === undefined && e.status !== 'skipped')
  const billsSoFar = periodBills.filter((e) => e.status === 'paid' || e.date <= today)
  const looseBills = sum(
    billsSoFar
      .filter((e) => {
        const env = envelopeOfBill.get(e.billId)
        return env === undefined || !liveEnvelope.has(env)
      })
      .map((e) => e.amount),
  )
  const distribution = (
    usage.length > 0
      ? [
          ...usage.map((u) => ({ id: u.id, name: u.name, color: u.color, amount: u.spent })),
          { id: 'bills', name: 'Other bills', amount: looseBills },
        ]
      : [
          { id: 'bills', name: 'Bills', amount: sum(billsSoFar.map((e) => e.amount)) },
          {
            id: 'spending',
            name: 'Spending',
            amount: Math.max(
              0,
              nsum(
                live(input.transactions)
                  .filter((t) => within(t.date, period) && t.date <= today)
                  .filter((t) => isSpendKind(txKind(t)))
                  .map((t) => t.amount),
              ),
            ),
          },
        ]
  )
    .filter((d) => d.amount > 0)
    .sort((a, b) => b.amount - a.amount)

  const lines: BreakdownLine[] = []
  if (isStartPeriod || carriedIn !== 0)
    lines.push({
      id: 'carried',
      label: isStartPeriod ? 'Starting balance' : 'Carried over',
      amount: carriedIn,
      date: isStartPeriod ? start.date : period.start,
    })
  lines.push({
    id: 'income',
    label: 'Money in',
    amount: flows.income,
    items: [
      ...flows.paydays.map((p) => ({
        label: p.name,
        amount: p.amount,
        date: p.date,
        done: p.date <= today,
      })),
      ...flows.loggedIncome.map((t) => ({
        label: t.note || 'Income',
        amount: t.amount,
        date: t.date,
        done: true,
      })),
    ].sort(byDate),
  })
  lines.push({
    id: 'bills',
    label: 'Bills',
    amount: -flows.bills,
    items: flows.billEntries.map((e) => ({
      label: e.name,
      amount: -e.amount,
      date: e.date,
      done: e.status === 'paid',
    })),
  })
  lines.push({
    id: 'expenses',
    label: 'Spending',
    amount: -flows.expenses,
    items:
      usage.length > 0
        ? usage
            .map((u) => ({ label: u.name, amount: -spendIn(input, u.id, envelopes, window) }))
            .filter((i) => i.amount !== 0)
        : flows.spending
            .slice()
            .sort(byDate)
            .map((t) => ({ label: t.note || 'Spent', amount: t.amount, date: t.date })),
  })
  if (buffer > 0) lines.push({ id: 'buffer', label: 'Cushion', amount: -buffer })

  return {
    total,
    lines,
    estimateNote: ESTIMATE_NOTE,
    status: total < 0 ? 'short' : 'ok',
    period,
    window,
    beforeTracking,
    carriedIn,
    isStartPeriod,
    income: flows.income,
    bills: flows.bills,
    billsPaid,
    billsPending: flows.bills - billsPaid,
    expenses: flows.expenses,
    buffer,
    dueEntries,
    flows,
    savingsMoved,
    debtPaid,
    envelopes: usage,
    distribution,
    spentToday: nsum(
      flows.spending
        .filter((t) => t.date === today && txKind(t) === 'expense')
        .map((t) => t.amount),
    ),
  }
}

const byDate = <T extends { date?: ISODate }>(a: T, b: T) =>
  (a.date ?? '') < (b.date ?? '') ? -1 : (a.date ?? '') > (b.date ?? '') ? 1 : 0

/** Where a spending row belongs: its envelope if live, otherwise the default one (refunds only if tagged). */
export function envelopeHome(
  t: Pick<Transaction, 'envelopeId' | 'amount'>,
  envelopes: readonly Pick<Envelope, 'id' | 'isDefault'>[],
): Id | undefined {
  const known = t.envelopeId !== undefined && envelopes.some((e) => e.id === t.envelopeId)
  if (known) return t.envelopeId
  if (t.amount > 0) return undefined
  return envelopes.find((e) => e.isDefault)?.id ?? envelopes[0]?.id
}

function spendIn(
  input: LedgerInput,
  envelopeId: Id,
  envelopes: readonly Envelope[],
  span: DateSpan,
): Cents {
  return nsum(
    live(input.transactions)
      .filter(
        (t) =>
          within(t.date, span) &&
          isSpendKind(txKind(t)) &&
          envelopeHome(t, envelopes) === envelopeId,
      )
      .map((t) => t.amount),
  )
}

/**
 * Budget vs actual per envelope over the WHOLE period (a budget belongs to a period).
 * Spending tagged to the envelope (untagged spending goes to the default one) plus bills
 * linked to it. Debt bills never count. Nothing here changes safe to spend.
 */
export function envelopesUsage(
  input: LedgerInput,
  envelopes: readonly Envelope[],
): EnvelopeUsage[] {
  if (envelopes.length === 0) return []
  const { period, today } = input
  const billEnvelope = new Map(input.bills.map((b) => [b.id, b.envelopeId]))
  const entries = billEntriesBetween(
    input.bills,
    input.occurrences,
    period.start,
    period.end,
  ).filter((e) => e.debtId === undefined && e.status !== 'skipped')
  const txs = live(input.transactions).filter(
    (t) => within(t.date, period) && isSpendKind(txKind(t)),
  )
  return envelopes.map((env) => {
    const mine = txs.filter((t) => envelopeHome(t, envelopes) === env.id)
    const linked = entries.filter((e) => billEnvelope.get(e.billId) === env.id)
    const rawSpent =
      nsum(mine.filter((t) => t.date <= today).map((t) => t.amount)) +
      sum(linked.filter((e) => e.status === 'paid' || e.date <= today).map((e) => e.amount))
    const rawDue =
      nsum(mine.filter((t) => t.date > today).map((t) => t.amount)) +
      sum(linked.filter((e) => e.status === 'due' && e.date > today).map((e) => e.amount))
    // A refund can't make an envelope's spending negative: it brings the envelope back to
    // zero at most (the whole refund still adds to safe to spend through the expenses line).
    const spent = Math.max(0, rawSpent)
    const linkedDue = Math.max(0, rawDue + Math.min(0, rawSpent))
    const used = spent + linkedDue
    const budget = budgetFor(env, period.start)
    return {
      id: env.id,
      name: env.name,
      color: env.color,
      budget,
      spent,
      linkedDue,
      reserved: Math.max(0, budget - used),
      over: budget > 0 ? Math.max(0, used - budget) : 0,
    }
  })
}

/** Days from today to the period's end, today included. At least 1. */
export const daysLeftIn = (period: DateSpan, today: ISODate) =>
  Math.max(1, daysBetween(today, period.end))

/**
 * The simple view's lines, built by summing the full lines: Money for the period, Bills,
 * Spending and cushion, Safe to spend. They always add up.
 */
export function simpleLines(result: Pick<SafeToSpend, 'lines' | 'total'>): BreakdownLine[] {
  const pick = (ids: readonly LineId[]) =>
    sum(result.lines.filter((l) => ids.includes(l.id)).map((l) => l.amount))
  return [
    { id: 'income', label: 'Money for this period', amount: pick(['carried', 'income']) },
    { id: 'bills', label: 'Bills', amount: pick(['bills']) },
    { id: 'expenses', label: 'Spending and cushion', amount: pick(['expenses', 'buffer']) },
    { id: 'total', label: 'Safe to spend', amount: result.total },
  ]
}
