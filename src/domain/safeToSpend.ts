// Safe to spend as lines (PLAN-v2 §1.5). The math sheet, the simple view and the bar are
// all built FROM these lines, never recomputed, so they can't disagree with the number.
//
//   S = carriedIn + income + corrections − bills − expenses − reserved − buffer
//
// Savings and debt payments appear in none of the lines (A2). Labels are plain and
// period-neutral; the screen adds "for November" / "this pay period".
import { effectiveStatus, type BillEntry, type EffectiveStatus, type PaydayLine } from './bills'
import type { EnvelopeUsage, PeriodPlan } from './ledger'
import { largestRemainder, type Cents } from './money'
import type { ISODate, Transaction } from './types'

export interface BreakdownItem {
  label: string
  /** Signed, like the line it belongs to. */
  amount: Cents
  date?: ISODate
  /** Bills: the effective status (autopay on or before today reads paid). Paydays:
   *  'skipped' when skipped (amount then 0). */
  status?: EffectiveStatus
  /** A bill still owed from before tracking started (owedAtStart). */
  beforeStart?: true
}

export type LineId =
  // The full view, in order.
  | 'carried'
  | 'income'
  | 'corrections'
  | 'bills'
  | 'expenses'
  | 'envelopes'
  | 'buffer'
  // The simple view.
  | 'money'
  | 'setAside'
  | 'total'
  // The guard's "Before your pay" block (pace.ts).
  | 'cash'
  | 'savings'
  | 'debt'

export interface BreakdownLine {
  id: LineId
  label: string
  /** Signed: what this line adds to (or takes from) the total. */
  amount: Cents
  date?: ISODate
  items?: BreakdownItem[]
}

export const LINE_LABELS = {
  start: 'Starting balance',
  carried: 'Carried in',
  income: 'Money in',
  corrections: 'Corrections',
  bills: 'Bills',
  expenses: 'Spending',
  envelopes: 'Still budgeted in envelopes',
  buffer: 'Cushion',
  noEnvelope: 'Not in an envelope',
} as const

export interface LineParts {
  carriedIn: Cents
  carriedKind: 'start' | 'rollover' | 'none'
  /** Starting balance: the start date; carried: the period's start. */
  carriedDate: ISODate
  rollover: boolean
  paydays: readonly PaydayLine[]
  logged: readonly Transaction[]
  corrections: readonly Transaction[]
  entries: readonly BillEntry[]
  owedAtStart: readonly BillEntry[]
  /** Spending grouped for the items, positive = money out; sums to the expenses total. */
  expenseGroups: readonly { label: string; amount: Cents; date?: ISODate }[]
  expenses: Cents
  envelopes: readonly EnvelopeUsage[]
  showEnvelopes: boolean
  buffer: Cents
  today: ISODate
}

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0)

export function buildLines(p: LineParts): BreakdownLine[] {
  const lines: BreakdownLine[] = []
  // Left out when 0 and roll over is off: "Carried in €0" would only raise a question.
  if (p.carriedIn !== 0 || p.rollover)
    lines.push({
      id: 'carried',
      label: p.carriedKind === 'start' ? LINE_LABELS.start : LINE_LABELS.carried,
      amount: p.carriedIn,
      date: p.carriedDate,
    })
  const incomeItems: BreakdownItem[] = [
    ...p.paydays.map(
      (d): BreakdownItem => ({
        label: d.name,
        amount: d.skipped ? 0 : d.amount,
        date: d.date,
        ...(d.skipped ? { status: 'skipped' as const } : {}),
      }),
    ),
    ...p.logged.map((t) => ({ label: t.note || LINE_LABELS.income, amount: t.amount, date: t.date })),
  ].sort(byDate)
  lines.push({
    id: 'income',
    label: LINE_LABELS.income,
    amount: sum(incomeItems.map((i) => i.amount)),
    items: incomeItems,
  })
  if (p.corrections.length > 0)
    lines.push({
      id: 'corrections',
      label: LINE_LABELS.corrections,
      amount: sum(p.corrections.map((t) => t.amount)),
      items: p.corrections.map((t) => ({
        label: t.note || LINE_LABELS.corrections,
        amount: t.amount,
        date: t.date,
      })),
    })
  const billItems: BreakdownItem[] = [
    ...p.owedAtStart.map(
      (e): BreakdownItem => ({
        label: e.name,
        amount: -e.amount,
        date: e.date,
        status: effectiveStatus(e, p.today),
        beforeStart: true,
      }),
    ),
    ...p.entries.map((e) => ({
      label: e.name,
      amount: -e.amount,
      date: e.date,
      status: effectiveStatus(e, p.today),
    })),
  ]
  lines.push({
    id: 'bills',
    label: LINE_LABELS.bills,
    amount: sum(billItems.map((i) => i.amount)),
    items: billItems,
  })
  lines.push({
    id: 'expenses',
    label: LINE_LABELS.expenses,
    amount: -p.expenses,
    items: p.expenseGroups.map((g) => ({
      label: g.label,
      amount: -g.amount,
      ...(g.date ? { date: g.date } : {}),
    })),
  })
  if (p.showEnvelopes)
    lines.push({
      id: 'envelopes',
      label: LINE_LABELS.envelopes,
      amount: -sum(p.envelopes.map((e) => e.reserved)),
      items: p.envelopes.map((e) => ({ label: e.name, amount: -e.reserved })),
    })
  if (p.buffer > 0) lines.push({ id: 'buffer', label: LINE_LABELS.buffer, amount: -p.buffer })
  return lines
}

const byDate = (a: { date?: ISODate }, b: { date?: ISODate }) =>
  (a.date ?? '') < (b.date ?? '') ? -1 : (a.date ?? '') > (b.date ?? '') ? 1 : 0

const MONEY: readonly LineId[] = ['carried', 'income', 'corrections']
const SET_ASIDE: readonly LineId[] = ['expenses', 'envelopes', 'buffer']

/**
 * The simple view (§1.5): Money for the period · Bills · Spending and set aside · Safe to
 * spend. Built by summing the full lines, never recomputed, so they always add up.
 */
export function simpleLines(plan: Pick<PeriodPlan, 'lines' | 'safe'>): BreakdownLine[] {
  const pick = (ids: readonly LineId[]) =>
    sum(plan.lines.filter((l) => ids.includes(l.id)).map((l) => l.amount))
  return [
    { id: 'money', label: 'Money for this period', amount: pick(MONEY) },
    { id: 'bills', label: LINE_LABELS.bills, amount: pick(['bills']) },
    { id: 'setAside', label: 'Spending and set aside', amount: pick(SET_ASIDE) },
    { id: 'total', label: 'Safe to spend', amount: plan.safe ?? 0 },
  ]
}

// --- The "Left to spend" bar (§1.5, R25) ---------------------------------------------------

export type BarSegmentId =
  | 'lighter'
  | 'bills'
  | 'spent'
  | 'corrections'
  | 'envelopes'
  | 'buffer'
  | 'safe'

export interface BarSegment {
  id: BarSegmentId
  label: string
  /** Positive. Zero-width segments are left out. */
  amount: Cents
  /** Whole percent of the bar; the segments add up to exactly 100. */
  percent: number
}

export interface LeftToSpendBar {
  segments: BarSegment[]
  /** What the bar spans: the inflows, or the outflows when short. */
  total: Cents
  inflows: Cents
  /** How far past the plan (S < 0), as a positive number; 0 when not short. */
  short: Cents
}

const BAR_LABELS: Record<BarSegmentId, string> = {
  lighter: 'Started lighter',
  bills: 'Bills',
  spent: 'Spent',
  corrections: 'Corrections',
  envelopes: 'Still in envelopes',
  buffer: 'Cushion',
  safe: 'Safe to spend',
}

/**
 * Inflows = max(0, carried) + income + max(0, corrections) (+ net refunds when refunds
 * beat spending). A negative carry is its own "Started lighter" segment and a negative
 * correction its own "Corrections" segment, so every segment is positive. When S ≥ 0 the
 * segments add up to the inflows; when short, the safe segment is 0 and they add up to
 * the outflows (inflows + the shortfall). Savings and debt are never segments (A2).
 */
export function leftToSpendBar(
  plan: Pick<PeriodPlan, 'carriedIn' | 'income' | 'corrections' | 'bills' | 'expenses'> &
    Pick<PeriodPlan, 'reserved' | 'buffer' | 'safe'>,
): LeftToSpendBar {
  const carried = plan.carriedIn ?? 0
  const corrections = plan.corrections.total
  const expenses = plan.expenses.total
  const inflows =
    Math.max(0, carried) +
    plan.income.total +
    Math.max(0, corrections) +
    Math.max(0, -expenses)
  const safe = plan.safe ?? 0
  const raw: [BarSegmentId, Cents][] = [
    ['lighter', Math.max(0, -carried)],
    ['bills', plan.bills.total],
    ['spent', Math.max(0, expenses)],
    ['corrections', Math.max(0, -corrections)],
    ['envelopes', plan.reserved],
    ['buffer', plan.buffer],
    ['safe', Math.max(0, safe)],
  ]
  const kept = raw.filter(([, amount]) => amount > 0)
  const percents = largestRemainder(kept.map(([, a]) => a))
  return {
    segments: kept.map(([id, amount], i) => ({
      id,
      label: BAR_LABELS[id],
      amount,
      percent: percents[i]!,
    })),
    total: sum(kept.map(([, a]) => a)),
    inflows,
    short: Math.max(0, -safe),
  }
}
