// FROZEN copy of the v4 engine (PLAN-v2 §2.3): reconcile, safeToSpend, runway and
// planToday exactly as they were before the pay-based model, so the v5 migration can show
// "before" next to "after" on the update day (legacySnapshot). Do not change the maths
// here; delete the folder one release after v5.
import { billEntriesBetween, type BillEntry } from '../bills'
import { addDays, daysBetween, minDate } from '../dates'
import type { Cents } from '../money'
import { currentPeriod, previousPayday, primaryIncome, type PayPeriod } from '../paySchedule'
import type {
  BalanceCheckIn,
  Bill,
  BillOccurrence,
  Envelope,
  Id,
  IncomeSource,
  ISODate,
  PaydayOverride,
  SavingsFund,
  Transaction,
} from '../types'

// --- reconcile.ts -------------------------------------------------------------------------

export type CheckInLike = Pick<BalanceCheckIn, 'at' | 'date' | 'balance'>

/**
 * A transaction moves the balance only if it was entered after the check-in and the user
 * didn't say it was already in the bank balance. createdAt, not date: a coffee logged
 * tonight for this morning happened after a check-in made at noon only if it was ENTERED
 * after it; if not, we ask (see askIfInBalance).
 */
export function isCounted(tx: Transaction, checkIn: Pick<CheckInLike, 'at'>): boolean {
  return tx.deletedAt === undefined && !tx.inBalance && tx.createdAt > checkIn.at
}

export function countedTransactions(
  txs: readonly Transaction[],
  checkIn: Pick<CheckInLike, 'at'>,
): Transaction[] {
  return txs.filter((t) => isCounted(t, checkIn))
}

/** A backdated entry (dated before the last check-in) may already be in the balance. */
export function askIfInBalance(date: ISODate, checkIn: Pick<CheckInLike, 'date'> | undefined) {
  return checkIn !== undefined && date < checkIn.date
}

/** Money spent from the balance: outgoing, and not a move into savings or a bill payment. */
export function isSpend(tx: Pick<Transaction, 'amount' | 'fundId' | 'billOccurrenceId'>): boolean {
  return tx.amount < 0 && tx.fundId === undefined && tx.billOccurrenceId === undefined
}

export interface PaidSince {
  billId: Id
  originalDate: ISODate
  name: string
  amount: Cents
}

/**
 * Bills marked paid after the check-in. Marking paid drops a bill from "bills due", so
 * unless the payment also leaves the balance, safe-to-spend would jump by the bill's
 * amount the moment you tick it. Bills paid at or before the check-in (including the
 * autopay ones the check-in itself marks) are already in the typed balance. A bill paid
 * through a logged transaction is counted by that transaction instead.
 *
 * Occurrences dated before the bill entered the app (`addedOn`) are history: they never
 * counted as due, so ticking one paid for the record must not take it off the balance.
 */
export function paidSinceCheckIn(
  occurrences: readonly BillOccurrence[],
  bills: readonly Bill[],
  counted: readonly Transaction[],
  checkIn: Pick<CheckInLike, 'at'>,
  addedOn?: ReadonlyMap<Id, ISODate>,
): PaidSince[] {
  const byId = new Map(bills.map((b) => [b.id, b]))
  const viaTx = new Set(counted.map((t) => t.billOccurrenceId).filter(Boolean))
  const out: PaidSince[] = []
  for (const o of occurrences) {
    if (o.status !== 'paid' || o.paidAt === undefined || o.paidAt <= checkIn.at) continue
    if (viaTx.has(o.id)) continue
    const added = addedOn?.get(o.billId)
    if (added !== undefined && (o.movedTo ?? o.originalDate) < added) continue
    const bill = byId.get(o.billId)
    out.push({
      billId: o.billId,
      originalDate: o.originalDate,
      name: bill?.name ?? '',
      amount: o.paidAmount ?? o.amountOverride ?? bill?.amount ?? 0,
    })
  }
  return out.sort((a, b) => (a.originalDate < b.originalDate ? -1 : 1))
}

/**
 * How far back unpaid bills still count as due: the payday before the check-in, or the
 * check-in itself, whichever is earlier (PLAN §4.1). Tied to the check-in, not to today,
 * so it stays put as days pass: if it slid forward on payday, an unpaid bill would drop
 * out and safe-to-spend would rise with no money coming in.
 */
export function lookbackStart(checkInDate: ISODate, paydayBeforeCheckIn: ISODate | null): ISODate {
  return paydayBeforeCheckIn ? minDate(checkInDate, paydayBeforeCheckIn) : checkInDate
}

/** Did a payday happen after the last check-in? Then the balance misses the pay. */
export function paydaySinceCheckIn(periodStart: ISODate, checkInDate: ISODate): boolean {
  return periodStart > checkInDate
}

export interface CheckInPlan {
  /** Autopay bills dated on or before the check-in: marked paid automatically. */
  autoPaid: BillEntry[]
  /** Manual bills dated on or before the check-in: "Did these come out yet?" */
  ask: BillEntry[]
}

/**
 * What a check-in on `date` reconciles. `due` are the unpaid entries safe-to-spend
 * currently counts (see safeToSpend's dueEntries). The new balance already reflects the
 * autopay ones, so marking them paid keeps them from being taken off a second time.
 */
export function checkInPlan(due: readonly BillEntry[], date: ISODate): CheckInPlan {
  const plan: CheckInPlan = { autoPaid: [], ask: [] }
  for (const e of due) {
    if (e.status !== 'due' || e.date > date) continue
    if (e.autopay) plan.autoPaid.push(e)
    else plan.ask.push(e)
  }
  return plan
}

// --- safeToSpend.ts -----------------------------------------------------------------------

export const ESTIMATE_NOTE = 'Estimate based on what you entered.'

export interface SafeToSpendInput {
  today: ISODate
  /** The current period: [start, end), end being the next payday. */
  period: { start: ISODate; end: ISODate }
  checkIn: CheckInLike
  /** Unpaid bills dated from here on still count (reconcile.lookbackStart). */
  lookback: ISODate
  transactions: readonly Transaction[]
  bills: readonly Bill[]
  occurrences: readonly BillOccurrence[]
  funds?: readonly SavingsFund[]
  envelopes?: readonly Envelope[]
  envelopesEnabled?: boolean
  buffer?: Cents
  /** Day each bill entered the app; earlier occurrences are history, not overdue. */
  addedOn?: ReadonlyMap<Id, ISODate>
}

export interface BreakdownItem {
  label: string
  amount: Cents
  date?: ISODate
}

export type LineId =
  | 'balance'
  | 'since'
  | 'paidSince'
  | 'bills'
  | 'savings'
  | 'envelopes'
  | 'buffer'
  | 'setAside'
  | 'total'

export interface BreakdownLine {
  id: LineId
  label: string
  /** Signed: what this line adds to (or takes from) the total. */
  amount: Cents
  date?: ISODate
  items?: BreakdownItem[]
}

export interface SafeToSpend {
  total: Cents
  /** Every term of the formula, in order. They sum to `total`. */
  lines: BreakdownLine[]
  balanceAgeDays: number
  estimateNote: string
  /** A negative total reads "€38 short", never a red minus sign. */
  status: 'ok' | 'short'
  currentBalance: Cents
  billsDue: Cents
  savingsPlanned: Cents
  envelopeReserved: Cents
  buffer: Cents
  /** The unpaid entries inside billsDue (overdue first, then by date). */
  dueEntries: BillEntry[]
  /** Transactions that moved the balance since the check-in. */
  counted: Transaction[]
  /** One row per live envelope, in input order; empty while envelopes are off. */
  envelopes: EnvelopeUsage[]
}

export interface EnvelopeUsage {
  id: Id
  name: string
  budget: Cents
  /** Spending this period plus linked bills already paid this period. */
  spent: Cents
  /** Linked bills still due before payday (they sit in billsDue). */
  linkedDue: Cents
  /** max(0, budget − spent − linkedDue), capped at the budget: the envelopeReserved term. */
  reserved: Cents
  /** How far past the budget it went, 0 if not. Shown as calm text, never red. */
  over: Cents
}

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0)
const inPeriod = (date: ISODate, start: ISODate, today: ISODate) => date >= start && date <= today

export function safeToSpend(input: SafeToSpendInput): SafeToSpend {
  const { today, period, checkIn, lookback, transactions, bills, occurrences } = input
  const funds = (input.funds ?? []).filter((f) => f.deletedAt === undefined)
  const envelopes = input.envelopesEnabled
    ? (input.envelopes ?? []).filter((e) => e.deletedAt === undefined)
    : []
  const buffer = Math.max(0, input.buffer ?? 0)
  const live = transactions.filter((t) => t.deletedAt === undefined)

  // Balance
  const counted = countedTransactions(live, checkIn)
  const since = sum(counted.map((t) => t.amount))
  const paid = paidSinceCheckIn(occurrences, bills, counted, checkIn, input.addedOn)
  const paidTotal = sum(paid.map((p) => p.amount))
  const currentBalance = checkIn.balance + since - paidTotal

  // Bills before payday, overdue included.
  const addedOn = input.addedOn
  const dueEntries = billEntriesBetween(bills, occurrences, lookback, period.end).filter(
    (e) => e.status === 'due' && (addedOn?.get(e.billId) ?? e.date) <= e.date,
  )
  const billsDue = sum(dueEntries.map((e) => e.amount))

  // Savings still to put away this period.
  const savingsItems: BreakdownItem[] = funds.map((f) => {
    const contributed = -sum(
      live
        .filter((t) => t.fundId === f.id && inPeriod(t.date, period.start, today))
        .map((t) => t.amount),
    )
    // Clamped to [0, perPeriod]: a withdrawal is money coming in, not a bigger target.
    return { label: f.name, amount: Math.min(f.perPeriod, Math.max(0, f.perPeriod - contributed)) }
  })
  const savingsPlanned = sum(savingsItems.map((i) => i.amount))

  const envelopeUsage = envelopesUsage({ ...input, envelopes, live, dueEntries })
  const envelopeItems: BreakdownItem[] = envelopeUsage.map((u) => ({
    label: u.name,
    amount: u.reserved,
  }))
  const envelopeReserved = sum(envelopeItems.map((i) => i.amount))

  const total = currentBalance - billsDue - savingsPlanned - envelopeReserved - buffer

  const lines: BreakdownLine[] = [
    {
      id: 'balance',
      label: 'Balance when you checked in',
      amount: checkIn.balance,
      date: checkIn.date,
    },
  ]
  if (counted.length > 0)
    lines.push({
      id: 'since',
      label: 'Logged since',
      amount: since,
      items: counted
        .slice()
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
        .map((t) => ({
          label: t.note || (t.amount < 0 ? 'Spent' : 'Added'),
          amount: t.amount,
          date: t.date,
        })),
    })
  if (paid.length > 0)
    lines.push({
      id: 'paidSince',
      label: 'Bills paid since',
      amount: -paidTotal,
      items: paid.map((p) => ({ label: p.name, amount: -p.amount, date: p.originalDate })),
    })
  lines.push({
    id: 'bills',
    label: 'Bills before payday',
    amount: -billsDue,
    items: dueEntries.map((e) => ({ label: e.name, amount: -e.amount, date: e.date })),
  })
  if (funds.length > 0)
    lines.push({
      id: 'savings',
      label: 'Savings this period',
      amount: -savingsPlanned,
      items: savingsItems.map((i) => ({ ...i, amount: -i.amount })),
    })
  if (envelopes.length > 0)
    lines.push({
      id: 'envelopes',
      label: 'Left in envelopes',
      amount: -envelopeReserved,
      items: envelopeItems.map((i) => ({ ...i, amount: -i.amount })),
    })
  if (buffer > 0) lines.push({ id: 'buffer', label: 'Buffer', amount: -buffer })

  return {
    total,
    lines,
    balanceAgeDays: Math.max(0, daysBetween(checkIn.date, today)),
    estimateNote: ESTIMATE_NOTE,
    status: total < 0 ? 'short' : 'ok',
    currentBalance,
    billsDue,
    savingsPlanned,
    envelopeReserved,
    buffer,
    dueEntries,
    counted,
    envelopes: envelopeUsage,
  }
}

/**
 * Envelopes (PLAN §4.1): what is still budgeted this period but not yet used. A bill
 * linked to an envelope uses it up like spending does, so the bill is counted once:
 * while unpaid it sits in billsDue and shrinks the reserve; once paid it counts as spent
 * instead. Overdue linked bills from an earlier period belonged to that period's budget.
 * Untagged spending (or spending tagged with a deleted envelope) uses the default one;
 * untagged income does not.
 */
function envelopesUsage({
  today,
  period,
  bills,
  occurrences,
  envelopes,
  live,
  dueEntries,
}: Pick<SafeToSpendInput, 'today' | 'period' | 'bills' | 'occurrences'> & {
  envelopes: readonly Envelope[]
  live: readonly Transaction[]
  dueEntries: readonly BillEntry[]
}): EnvelopeUsage[] {
  if (envelopes.length === 0) return []
  const billEnvelope = new Map(bills.map((b) => [b.id, b.envelopeId]))
  const known = new Set(envelopes.map((e) => e.id))
  const fallback = envelopes.find((e) => e.isDefault)?.id
  const envelopeOf = (id: Id | undefined) => (id !== undefined && known.has(id) ? id : fallback)
  const paidInPeriod = billEntriesBetween(bills, occurrences, period.start, period.end).filter(
    (e) => e.status === 'paid',
  )
  return envelopes.map((env) => {
    const linkedTo = (e: BillEntry) =>
      e.date >= period.start && billEnvelope.get(e.billId) === env.id
    const spent =
      -sum(
        live
          .filter(
            (t) =>
              t.fundId === undefined &&
              t.billOccurrenceId === undefined &&
              inPeriod(t.date, period.start, today) &&
              // Money in counts only when tagged (a refund back into Food). Untagged
              // income like a salary is not Everyday's money; counting it would refill
              // the reserve and make later spending come off safe-to-spend twice.
              (t.amount < 0 || (t.envelopeId !== undefined && known.has(t.envelopeId))) &&
              envelopeOf(t.envelopeId) === env.id,
          )
          .map((t) => t.amount),
      ) + sum(paidInPeriod.filter(linkedTo).map((e) => e.amount))
    const linkedDue = sum(dueEntries.filter(linkedTo).map((e) => e.amount))
    // Clamped to [0, budget]: refunds can't push the reserve above the budget. (Flooring
    // `spent` instead would make paying a linked bill move the total.)
    const reserved = Math.min(env.budget, Math.max(0, env.budget - spent - linkedDue))
    return {
      id: env.id,
      name: env.name,
      budget: env.budget,
      spent,
      linkedDue,
      reserved,
      over: Math.max(0, spent + linkedDue - env.budget),
    }
  })
}

const SET_ASIDE: readonly LineId[] = ['savings', 'envelopes', 'buffer']
const BALANCE: readonly LineId[] = ['balance', 'since', 'paidSince']

/**
 * Simple mode's four lines (PLAN §4.1): Balance, Bills before payday, Set aside, Safe to
 * spend. Built by summing the full lines, never recomputed, so they always add up.
 */
export function simpleLines(result: Pick<SafeToSpend, 'lines' | 'total'>): BreakdownLine[] {
  const pick = (ids: readonly LineId[]) =>
    sum(result.lines.filter((l) => ids.includes(l.id)).map((l) => l.amount))
  return [
    { id: 'balance', label: 'Balance', amount: pick(BALANCE) },
    { id: 'bills', label: 'Bills before payday', amount: pick(['bills']) },
    { id: 'setAside', label: 'Set aside (savings, envelopes, buffer)', amount: pick(SET_ASIDE) },
    { id: 'total', label: 'Safe to spend', amount: result.total },
  ]
}

// --- runway.ts ----------------------------------------------------------------------------

export interface Runway {
  perDay: Cents
  /** perDay minus today's spending. Can go below zero ("€4 over today"). */
  leftToday: Cents
  spentToday: Cents
  startOfDaySafe: Cents
  /** Days from today to payday, today included. Always at least 1. */
  daysLeft: number
  /** At last week's pace, does the money last until payday? */
  onTrack: boolean
}

export interface RunwayInput {
  safeToSpend: Cents
  /** What was spent today and already taken out of safeToSpend (counted transactions). */
  spentToday: Cents
  daysLeft: number
  /** Spending over the 7 days before today. */
  spentLast7Days: Cents
  /**
   * Safe-to-spend with today's spending taken back out. Defaults to safeToSpend +
   * spentToday, which only holds when every euro spent lowered safe-to-spend by a euro.
   * With envelopes on, spending inside an envelope's room leaves safe-to-spend alone, so
   * planToday recomputes the start of the day instead of guessing it.
   */
  startOfDaySafe?: Cents
}

export function runway({
  safeToSpend,
  spentToday,
  daysLeft,
  spentLast7Days,
  startOfDaySafe = safeToSpend + spentToday,
}: RunwayInput): Runway {
  const days = Math.max(1, Math.floor(daysLeft))
  // Rounding point (PLAN §3.1): floor, so seven days of perDay never exceed the total.
  const perDay = startOfDaySafe > 0 ? Math.floor(startOfDaySafe / days) : 0
  // safe − (spent7 / 7) × (days − 1) ≥ 0, multiplied through by 7 so nothing rounds.
  const onTrack = safeToSpend * 7 - spentLast7Days * (days - 1) >= 0
  return {
    perDay,
    leftToday: perDay - spentToday,
    spentToday,
    startOfDaySafe,
    daysLeft: days,
    onTrack,
  }
}

/** Spending dated today among the transactions that moved the balance. */
export function spentOn(counted: readonly Transaction[], date: ISODate): Cents {
  return -counted.filter((t) => t.date === date && isSpend(t)).reduce((a, t) => a + t.amount, 0)
}

/** All spending in the 7 days before today (counted or not: this is about habits). */
export function spentLast7Days(txs: readonly Transaction[], today: ISODate): Cents {
  const from = addDays(today, -7)
  return -txs
    .filter((t) => t.deletedAt === undefined && isSpend(t) && t.date >= from && t.date < today)
    .reduce((a, t) => a + t.amount, 0)
}


// --- today.ts -----------------------------------------------------------------------------

export interface TodayInput {
  today: ISODate
  incomes: readonly IncomeSource[]
  paydayOverrides: readonly PaydayOverride[]
  bills: readonly Bill[]
  occurrences: readonly BillOccurrence[]
  transactions: readonly Transaction[]
  checkIn: CheckInLike | undefined
  funds?: readonly SavingsFund[]
  envelopes?: readonly Envelope[]
  envelopesEnabled?: boolean
  buffer?: number
  addedOn?: ReadonlyMap<Id, ISODate>
}

export type TodayPlan =
  | { kind: 'no-income' }
  | { kind: 'no-payday' }
  /** Has a period but no balance yet. `due` feeds the first check-in. */
  | { kind: 'no-balance'; period: PayPeriod; due: BillEntry[] }
  | {
      kind: 'ready'
      period: PayPeriod
      lookback: ISODate
      safe: SafeToSpend
      runway: Runway
      paydaySinceCheckIn: boolean
    }

export function planToday(input: TodayInput): TodayPlan {
  const { today, incomes, paydayOverrides, checkIn } = input
  const income = primaryIncome(incomes)
  if (!income) return { kind: 'no-income' }
  const period = currentPeriod(income, today, paydayOverrides)
  if (!period) return { kind: 'no-payday' }

  // Before the first check-in, "since the last check-in" means since this period began.
  const anchor: CheckInLike = checkIn ?? { at: '', date: today, balance: 0 }
  const lookback = lookbackStart(
    anchor.date,
    checkIn ? previousPayday(income, checkIn.date, paydayOverrides) : period.start,
  )
  const safeWith = (transactions: readonly Transaction[]) =>
    safeToSpend({
      today,
      period,
      checkIn: anchor,
      lookback,
      transactions,
      bills: input.bills,
      occurrences: input.occurrences,
      funds: input.funds,
      envelopes: input.envelopes,
      envelopesEnabled: input.envelopesEnabled,
      buffer: input.buffer,
      addedOn: input.addedOn,
    })
  const safe = safeWith(input.transactions)
  if (!checkIn) return { kind: 'no-balance', period, due: safe.dueEntries }

  // The day's allowance is fixed at the start of the day (PLAN §4.2): safe-to-spend as it
  // was before today's spending. Recomputed rather than "safe + spentToday", because with
  // envelopes on, money spent inside an envelope's room never lowered safe-to-spend.
  const spentTodayRows = new Set(safe.counted.filter((t) => t.date === today && isSpend(t)))
  const startOfDaySafe =
    spentTodayRows.size === 0
      ? safe.total
      : safeWith(input.transactions.filter((t) => !spentTodayRows.has(t))).total

  return {
    kind: 'ready',
    period,
    lookback,
    safe,
    runway: runway({
      safeToSpend: safe.total,
      spentToday: spentOn(safe.counted, today),
      daysLeft: period.daysLeft,
      spentLast7Days: spentLast7Days(input.transactions, today),
      startOfDaySafe,
    }),
    paydaySinceCheckIn: paydaySinceCheckIn(period.start, checkIn.date),
  }
}

/** Unpaid manual bills dated before today, for the "Did Rent go out?" card. */
export function overdueManual(due: readonly BillEntry[], today: ISODate): BillEntry[] {
  return due.filter((e) => !e.autopay && e.date < today)
}
