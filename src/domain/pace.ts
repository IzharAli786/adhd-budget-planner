// The pace guard (PLAN-v2 §1.4, decision 1; R2, R3, R7). Safe to spend divides the
// period's money evenly, but in month mode with late-month pay the per-day number can be
// more than what lasts until the next pay. The guard checks that on a CASH estimate: last
// period's money counts even with roll over off, and savings moves, debt payments and
// unpaid debt minimums come off. It never changes S.
//
// Advice only by default (owner question Q1): a binding guard whose checkpoint is the
// payday inside the period would cancel a pay edit, and locked decision A says a pay edit
// moves the number at once. Flip the switch to make it bind.
import { addDays, daysBetween } from './dates'
import {
  budgetFor,
  cashAt,
  cashPointsBetween,
  entriesBetween,
  owedAtStart,
  paydaysBetweenDates,
  periodContext,
  type CashKind,
  type LedgerInput,
} from './ledger'
import type { Cents } from './money'
import { chainPaydays, nextPeriod, type Period } from './period'
import { effectiveStatus } from './bills'
import type { BreakdownLine, LineId } from './safeToSpend'
import type { ISODate } from './types'

export const PACE_GUARD_BINDS = false

/** One "will the money last until here?" point: what's left for the days before it. */
export interface Checkpoint {
  until: ISODate
  /** M_cash(until): the estimate left after everything due before it. Can be negative. */
  money: Cents
  /** Days from today to `until`. */
  days: number
  /** They add up to `money`: the math sheet's "Before your pay" block. */
  lines: BreakdownLine[]
}

export interface Guard {
  perDay: Cents
  until: ISODate
  /** The estimate runs out before `until`: the tight-before-pay card. */
  short: boolean
  lines: BreakdownLine[]
}

/** A0: the account at the start of today, plus today's money except today's spending. */
function startOfDayCash(input: LedgerInput): Cents {
  const today = input.today
  let a0 = cashAt(today, input) ?? 0
  for (const c of cashPointsBetween(input, today, addDays(today, 1)))
    if (!(c.kind === 'expenses' && c.amount < 0)) a0 += c.amount
  return a0
}

const GUARD_LABELS: Record<CashKind, string> = {
  income: 'Money coming in before then',
  corrections: 'Corrections',
  bills: 'Bills before then',
  expenses: 'Spending already planned',
  savings: 'Savings moves',
  debt: 'Debt payments and minimums',
}

/**
 * The checkpoints for the current period P (§1.4): every payday in (today, P.end], P.end
 * itself in payday mode, and in month mode the first primary payday on or after P.end,
 * because the money after the month's last pay has to last until the next one.
 * `reserved` is the start-of-day reserve (today's spending taken back out), so logging
 * today moves the guard euro for euro, like the hero (I7).
 */
export function paceCheckpoints(
  input: LedgerInput,
  period: Period,
  reserved: Cents,
): Checkpoint[] {
  const { plan, today } = input
  const start = plan.startDate
  if (start === null) return []
  const dates = new Set<ISODate>()
  for (const p of paydaysBetweenDates(input, addDays(today, 1), addDays(period.end, 1)))
    if (!p.skipped) dates.add(p.date)
  if (plan.planBy === 'payday') dates.add(period.end)
  else {
    const ctx = periodContext(input)
    const h = chainPaydays(ctx, period.end, addDays(period.end, 400)).find((p) => !p.skipped)
    if (h) dates.add(h.date)
  }
  const a0 = startOfDayCash(input)
  const buffer = Math.max(0, plan.buffer)
  const envelopes = input.envelopesEnabled
    ? (input.envelopes ?? []).filter((e) => e.deletedAt === undefined)
    : []
  const out: Checkpoint[] = []
  for (const e of [...dates].sort()) {
    if (e <= today) continue
    const flows: Record<CashKind, Cents> = {
      income: 0,
      corrections: 0,
      bills: 0,
      expenses: 0,
      savings: 0,
      debt: 0,
    }
    for (const c of cashPointsBetween(input, addDays(today, 1), e)) flows[c.kind] += c.amount
    // Unpaid minimums are obligations even when overdue (R7); paid ones are cash flows.
    let unpaidMinimums = 0
    for (const m of entriesBetween(input, start, e))
      if (m.debtId !== undefined && effectiveStatus(m, today) === 'due') unpaidMinimums += m.amount
    let nextBudgets = 0
    if (envelopes.length > 0) {
      const ctx = periodContext(input)
      for (let q = nextPeriod(period, ctx); q && q.start < e; q = nextPeriod(q, ctx))
        for (const env of envelopes) nextBudgets += budgetFor(env, q)
    }
    const lines: BreakdownLine[] = [
      { id: 'cash', label: 'In your account now (estimate)', amount: a0 },
    ]
    const add = (id: LineId, label: string, amount: Cents, always = false) => {
      if (amount !== 0 || always) lines.push({ id, label, amount })
    }
    add('income', GUARD_LABELS.income, flows.income, true)
    add('corrections', GUARD_LABELS.corrections, flows.corrections)
    add('bills', GUARD_LABELS.bills, flows.bills, true)
    add('expenses', GUARD_LABELS.expenses, flows.expenses)
    add('savings', GUARD_LABELS.savings, flows.savings)
    add('debt', GUARD_LABELS.debt, flows.debt - unpaidMinimums)
    add('envelopes', 'Still budgeted in envelopes', -(reserved + nextBudgets))
    add('buffer', 'Cushion', -buffer)
    const money = lines.reduce((a, l) => a + l.amount, 0)
    out.push({ until: e, money, days: daysBetween(today, e), lines })
  }
  return out
}

/** floor(max(0, money) / days): what a day can take and still reach the checkpoint. */
export const checkpointPerDay = (c: Pick<Checkpoint, 'money' | 'days'>) =>
  Math.floor(Math.max(0, c.money) / Math.max(1, c.days))

/**
 * The guard, when it has something to say: the tightest checkpoint, returned when its
 * per-day amount is below `perDay` or the estimate runs short before it. A short
 * checkpoint wins (the earliest one); otherwise the smallest per-day, earliest on ties.
 */
export function guardFrom(checkpoints: readonly Checkpoint[], perDay: Cents): Guard | null {
  const short = checkpoints.find((c) => c.money < 0)
  let pick = short
  if (!pick)
    for (const c of checkpoints)
      if (pick === undefined || checkpointPerDay(c) < checkpointPerDay(pick)) pick = c
  if (!pick) return null
  const g = checkpointPerDay(pick)
  if (!short && g >= perDay) return null
  return { perDay: g, until: pick.until, short: short !== undefined, lines: pick.lines }
}

/**
 * What the account should hold now (Money basics, catch-up): the cash estimate at the end
 * of today, plus plain bills on or before today that are still unpaid (they haven't left
 * the bank yet). Savings moves and debt payments taken off.
 */
export function accountEstimate(input: LedgerInput): Cents | null {
  const { plan, today } = input
  if (plan.startDate === null) return null
  let est = cashAt(addDays(today, 1), input) ?? 0
  for (const e of entriesBetween(input, plan.startDate, addDays(today, 1)))
    if (e.debtId === undefined && e.status !== 'skipped' && effectiveStatus(e, today) === 'due')
      est += e.amount
  for (const e of owedAtStart(input)) if (e.status === 'due') est += e.amount
  return est
}
