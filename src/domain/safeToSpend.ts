// Safe-to-spend (PLAN §4.1). One exact formula, returned as the lines that make it up so
// "See the math" renders the very numbers that produced the total; the view can never
// show a breakdown that disagrees with the hero.
//
//   currentBalance   = checkIn.balance + counted transactions − bills paid since
//   safeToSpend      = currentBalance − billsDue − savingsPlanned − envelopeReserved − buffer
import { billEntriesBetween, type BillEntry } from './bills'
import { daysBetween } from './dates'
import type { Cents } from './money'
import { countedTransactions, paidSinceCheckIn, type CheckInLike } from './reconcile'
import type { Bill, BillOccurrence, Envelope, Id, ISODate, SavingsFund, Transaction } from './types'

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
