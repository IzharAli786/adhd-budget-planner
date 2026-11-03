// Debt payoff simulation (PLAN §4.3). Snowball and avalanche are the same monthly loop with
// a different comparator for where the extra money goes (the strategy pattern).
// Integer cents throughout; interest is the one rounding point (Math.round, PLAN §3.1).
// Cost: O(months × debts · log debts), months capped at maxMonths.
import { effectiveStatus, type BillEntry } from './bills'
import type { Cents } from './money'
import { occurrenceId, type DateRange, type Debt, type Id, type ISODate, type Transaction } from './types'

export type Strategy = 'snowball' | 'avalanche'
export const STRATEGIES: readonly Strategy[] = ['snowball', 'avalanche']

export interface DebtInput {
  id: Id
  balance: Cents
  aprBps: number
  minPayment: Cents
}

export interface Payoff {
  id: Id
  /** 1-based month in which the balance reached zero. */
  month: number
}

export interface SimulationOk {
  ok: true
  strategy: Strategy
  /** Months until every balance is zero, or maxMonths if it never gets there. */
  months: number
  /** False when maxMonths (or the size guard) ran out first, e.g. negative amortization. */
  paidOff: boolean
  /**
   * Where the money above the minimums goes in month 1, or null when there is none. Not
   * payoffOrder[0]: a small debt can finish first on its minimum alone.
   */
  focus: Id | null
  totalInterest: Cents
  payoffOrder: Payoff[]
  /** schedule[m][i] = balance of debts[i] after month m; schedule[0] is the start. */
  schedule: Cents[][]
}

export interface SimulationError {
  ok: false
  error: 'budget_below_minimums'
  /** The smallest budget that works. */
  minimums: Cents
}

export type Simulation = SimulationOk | SimulationError

export const monthlyInterest = (balance: Cents, aprBps: number): Cents =>
  Math.round((balance * aprBps) / 10000 / 12)

export const sumMinimums = (debts: readonly DebtInput[]): Cents =>
  debts.reduce((s, d) => s + (d.balance > 0 ? d.minPayment : 0), 0)

type Live = { i: number; balance: Cents; aprBps: number }

// balance × aprBps must stay an exact integer (aprBps ≤ 100 000). A balance this big
// (about 900 million in major units) only happens when interest outruns the budget for
// decades, so stopping there loses nothing and keeps every number safe to show.
export const BALANCE_GUARD = Math.floor(Number.MAX_SAFE_INTEGER / 100_000)

// Ties fall through to the input order (i), so the result never depends on sort internals.
const ORDER: Record<Strategy, (a: Live, b: Live) => number> = {
  snowball: (a, b) => a.balance - b.balance || b.aprBps - a.aprBps || a.i - b.i,
  avalanche: (a, b) => b.aprBps - a.aprBps || a.balance - b.balance || a.i - b.i,
}

export function simulate(
  debts: readonly DebtInput[],
  monthlyBudget: Cents,
  strategy: Strategy,
  maxMonths = 600,
): Simulation {
  // A debt already at zero has no minimum to pay, so it doesn't raise the bar.
  const minimums = sumMinimums(debts)
  if (monthlyBudget < minimums) return { ok: false, error: 'budget_below_minimums', minimums }

  const balances = debts.map((d) => Math.max(0, d.balance))
  const schedule: Cents[][] = [[...balances]]
  const payoffOrder: Payoff[] = []
  let totalInterest = 0
  let month = 0
  let focus: Id | null = null
  const settle = (i: number) => {
    if (balances[i] === 0) payoffOrder.push({ id: debts[i]!.id, month })
  }

  while (month < maxMonths && balances.some((b) => b > 0)) {
    month++
    debts.forEach((d, i) => {
      if (balances[i]! <= 0) return
      const interest = monthlyInterest(balances[i]!, d.aprBps)
      balances[i]! += interest
      totalInterest += interest
    })
    let pool = monthlyBudget
    debts.forEach((d, i) => {
      if (balances[i]! <= 0) return
      const pay = Math.min(d.minPayment, balances[i]!)
      balances[i]! -= pay
      pool -= pay
      settle(i)
    })
    const order = debts
      .map((d, i) => ({ i, balance: balances[i]!, aprBps: d.aprBps }))
      .filter((d) => d.balance > 0)
      .sort(ORDER[strategy])
    for (const { i } of order) {
      if (pool <= 0) break
      if (month === 1 && focus === null) focus = debts[i]!.id
      const extra = Math.min(pool, balances[i]!)
      balances[i]! -= extra
      pool -= extra
      settle(i)
    }
    schedule.push([...balances])
    if (balances.some((b) => b > BALANCE_GUARD)) break
  }

  return {
    ok: true,
    strategy,
    months: month,
    paidOff: balances.every((b) => b === 0),
    focus,
    totalInterest,
    payoffOrder,
    schedule,
  }
}

export interface Comparison {
  snowball: SimulationOk
  avalanche: SimulationOk
  /** Interest avalanche saves over snowball (negative if snowball happens to cost less). */
  interestSaved: Cents
  /** Months snowball takes beyond avalanche. */
  monthsDiff: number
}

export function compare(
  debts: readonly DebtInput[],
  monthlyBudget: Cents,
  maxMonths = 600,
): Comparison | SimulationError {
  const snowball = simulate(debts, monthlyBudget, 'snowball', maxMonths)
  const avalanche = simulate(debts, monthlyBudget, 'avalanche', maxMonths)
  if (!snowball.ok) return snowball
  if (!avalanche.ok) return avalanche
  return {
    snowball,
    avalanche,
    // Whole cents: a fraction would print as "saves €0.00".
    interestSaved: Math.round(snowball.totalInterest - avalanche.totalInterest),
    monthsDiff: snowball.months - avalanche.months,
  }
}

/**
 * Debts whose first month of interest is at least their minimum: paying only the minimum
 * never shrinks them (PLAN §4.3 warning).
 */
export function negativeAmortization<T extends DebtInput>(debts: readonly T[]): T[] {
  return debts.filter((d) => d.balance > 0 && monthlyInterest(d.balance, d.aprBps) >= d.minPayment)
}

/** Share of the starting balance paid off, 0..1. Clamped: a balance can grow past it. */
export function paidShare(balance: Cents, originalBalance: Cents): number {
  if (originalBalance <= 0) return balance <= 0 ? 1 : 0
  return Math.min(1, Math.max(0, 1 - balance / originalBalance))
}

/** Sum of balances per month, the series the payoff chart draws. */
export const totalsOverTime = (sim: SimulationOk): Cents[] =>
  sim.schedule.map((row) => row.reduce((s, b) => s + b, 0))

/** A suggested starting budget: the minimums plus a small, doable extra. */
export const defaultBudget = (debts: readonly DebtInput[], extra: Cents): Cents =>
  sumMinimums(debts) + extra

// --- The Debt section's own numbers (PLAN-v2 §1.6, A2) ----------------------------------
// Debt payments never touch safe to spend. Each payment is stored once: a logged payment is
// a dated debt transaction; a minimum ticked paid with no linked transaction counts at its
// own date (R6, decision 5).

export interface DebtPayment {
  debtId: Id
  date: ISODate
  /** Positive: money paid towards the debt. */
  amount: Cents
  source: 'tx' | 'minimum'
  txId?: Id
  /** The minimum it paid: the linked one for a tx, the entry itself for 'minimum'. */
  occurrenceId?: string
}

const isDebtTx = (t: Transaction) =>
  t.deletedAt === undefined && t.fundId === undefined && t.debtId !== undefined

/**
 * Every payment towards debts, oldest first. `debtEntries` are the debt bills' entries
 * (any range); an autopay minimum dated on or before today counts as paid (R4).
 */
export function debtPayments(
  txs: readonly Transaction[],
  debtEntries: readonly BillEntry[],
  today: ISODate,
): DebtPayment[] {
  const out: DebtPayment[] = []
  const linked = new Set<string>()
  for (const t of txs) {
    if (!isDebtTx(t)) continue
    if (t.billOccurrenceId !== undefined) linked.add(t.billOccurrenceId)
    out.push({
      debtId: t.debtId!,
      date: t.date,
      amount: -t.amount,
      source: 'tx',
      txId: t.id,
      ...(t.billOccurrenceId !== undefined ? { occurrenceId: t.billOccurrenceId } : {}),
    })
  }
  for (const e of debtEntries) {
    if (e.debtId === undefined || effectiveStatus(e, today) !== 'paid') continue
    const id = occurrenceId(e.billId, e.originalDate)
    if (linked.has(id)) continue
    out.push({ debtId: e.debtId, date: e.date, amount: e.amount, source: 'minimum', occurrenceId: id })
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

/** Still owed: the balance minus payments after it was set. An estimate (interest ignored). */
export function owedNow(
  d: Pick<Debt, 'id' | 'balance' | 'balanceAsOf'>,
  payments: readonly DebtPayment[],
  today: ISODate,
): Cents {
  let paid = 0
  for (const p of payments)
    if (p.debtId === d.id && p.date > d.balanceAsOf && p.date <= today) paid += p.amount
  return Math.max(0, d.balance - paid)
}

export interface PeriodDebt {
  /** Every debt minimum in the period, paid or not (skipped ones left out). */
  due: Cents
  /** Payments dated in the period, up to today. */
  paid: Cents
  /** Minimums still due, dated after today in the period. */
  scheduled: Cents
  entries: BillEntry[]
  payments: DebtPayment[]
}

export function periodDebt(
  period: DateRange,
  debtEntries: readonly BillEntry[],
  payments: readonly DebtPayment[],
  today: ISODate,
): PeriodDebt {
  const inP = (d: ISODate) => d >= period.start && d < period.end
  const entries = debtEntries.filter((e) => e.debtId !== undefined && inP(e.date))
  const own = payments.filter((p) => inP(p.date))
  let due = 0
  let scheduled = 0
  for (const e of entries) {
    if (e.status === 'skipped') continue
    due += e.amount
    if (e.date > today && effectiveStatus(e, today) === 'due') scheduled += e.amount
  }
  const paid = own.filter((p) => p.date <= today).reduce((a, p) => a + p.amount, 0)
  return { due, paid, scheduled, entries, payments: own }
}
