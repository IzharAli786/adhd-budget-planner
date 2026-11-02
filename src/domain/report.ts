// Reports (More > Reports): everything that happened between two dates, as one plain,
// serialisable object the PDF renderer (and the on-screen preview) reads. Pure.
//
// The money numbers are Look back's (review.ts flowsIn) for the same days, so a report
// for October says exactly what Look back's October row says. Lists (bills, funds,
// debts, where it went) use the same span flowsIn counts: from the start of the history,
// so a table never lists a bill the totals above it leave out.
//
// Dates here are INCLUSIVE on both ends (a person picks "1 Oct to 31 Oct"); the domain
// ranges underneath are [start, end), so `end` is the day after `to`.
import { addedOnMap, billEntriesBetween, paydayEntriesBetween, type BillEntry } from './bills'
import { addDays, addMonths, daysBetween, isValidISODate, maxDate, minDate } from './dates'
import { debtsInRange } from './yearSummary'
import {
  isDebtPayment,
  spendByCategory,
  spendByEnvelope,
  spendOutsideEnvelopes,
  type CategoryId,
  type DateRange,
} from './insights'
import type { Cents } from './money'
import { isSpend } from './reconcile'
import { flowsIn, historyStart, payPeriodRanges, type ReviewInput } from './review'
import type {
  Bill,
  Debt,
  Envelope,
  ImpulseItem,
  Instant,
  ISODate,
  LifeGoal,
  NoSpendDay,
  Note,
  SavingsFund,
  Transaction,
} from './types'

export interface ReportInput extends ReviewInput {
  /** Every envelope, fund and debt, deleted ones too: an old entry still names them. */
  envelopes: readonly Envelope[]
  envelopesEnabled: boolean
  funds: readonly SavingsFund[]
  debts: readonly Debt[]
  /** Every bill, deleted ones too, so an old bill payment still says which bill it was. */
  allBills?: readonly Bill[]
  notes: readonly Note[]
  noSpend: readonly NoSpendDay[]
  impulse: readonly ImpulseItem[]
  lifeGoals: readonly LifeGoal[]
  currency: string
  decimals: number
  locale: string
  displayName?: string
  /** The day the report is made (shown on it). */
  generatedOn: ISODate
  /** The device's calendar day for an instant (decisions, goals done). Default: its UTC day. */
  localDate?: (at: Instant) => ISODate
}

export interface ReportMeta {
  from: ISODate
  to: ISODate
  /** Days in the range, both ends counted. */
  days: number
  currency: string
  decimals: number
  locale: string
  generatedOn: ISODate
  displayName?: string
}

export interface BalancePoint {
  date: ISODate
  balance: Cents
}

export interface ReportSummary {
  /** Paydays (as Look back counts them) plus other money logged as coming in. */
  moneyIn: Cents
  /** spending + billsPaid + debtPaid; a bill and the entry that paid it count once. */
  moneyOut: Cents
  /** Everyday spending only. */
  spending: Cents
  /** Bills marked paid, debt minimums excluded (they are in debtPaid). */
  billsPaid: Cents
  debtPaid: Cents
  savedToFunds: Cents
  takenFromFunds: Cents
  /** moneyIn − moneyOut − (savedToFunds − takenFromFunds): Look back's "Left over". */
  leftOver: Cents
  /** The latest check-in on or before `from`; null when there is none (never invented). */
  startBalance: BalancePoint | null
  /** The latest check-in on or before `to`. */
  endBalance: BalancePoint | null
}

export interface CategoryRow {
  name: string
  /** An envelope's palette key ('sage'), 'accent', or a chart series ('chart-2'). */
  colorToken?: string
  amount: Cents
  /** Whole percent of the total; the rows add up to exactly 100. */
  share: number
}

export interface ReportPayday {
  date: ISODate
  name: string
  amount: Cents
}

export interface ReportBill {
  date: ISODate
  name: string
  amount: Cents
  autopay: boolean
  envelope?: string
  /** A debt's minimum: the summary counts it under debt paid, not bills. */
  debt?: string
}

export interface ReportBills {
  paid: ReportBill[]
  skipped: ReportBill[]
  /** Dated in the range, neither paid nor skipped. */
  dueUnpaid: ReportBill[]
  totals: { paid: Cents; skipped: Cents; dueUnpaid: Cents }
}

export type TransactionKind =
  'Spending' | 'Income' | 'Into savings' | 'From savings' | 'Debt payment' | 'Bill payment'

export interface ReportTransaction {
  date: ISODate
  kind: TransactionKind
  /** Envelope, fund, debt or bill name ('' when there is none). Deleted ones keep theirs. */
  category: string
  note: string
  /** Signed: + in, − out. */
  amount: Cents
}

export interface ReportFund {
  name: string
  movedIn: Cents
  movedOut: Cents
  /** Opening amount plus every move up to `to`. */
  savedAtEnd: Cents
  target?: Cents
  /** Whole percent of the target reached by `to` (0-100); null without a target. */
  percent: number | null
}

export interface ReportDebt {
  name: string
  paidInRange: Cents
  balanceNow: Cents
  aprPercent: number
  minimum: Cents
}

export interface ReportNote {
  kind: 'day' | 'period'
  /** The day, or the first day of the pay period. */
  date: ISODate
  /** Period notes: the period's last day. */
  until?: ISODate
  text: string
}

export interface ReportImpulse {
  /** "Saved by waiting": what was let go. */
  skippedTotal: Cents
  skippedCount: number
  boughtCount: number
  items: { name: string; amount: Cents; decision: 'bought' | 'skipped'; date: ISODate }[]
}

export interface Report {
  meta: ReportMeta
  summary: ReportSummary
  paydays: ReportPayday[]
  byCategory: CategoryRow[]
  /** 'envelope' when envelopes are on, else four plain kinds (as Insights). */
  categoryMode: 'envelope' | 'kind'
  bills: ReportBills
  transactions: ReportTransaction[]
  funds: ReportFund[]
  debts: ReportDebt[]
  checkIns: BalancePoint[]
  notes: ReportNote[]
  noSpendDays: { count: number; dates: ISODate[] }
  impulse: ReportImpulse
  lifeGoalsDone: { title: string; date: ISODate; why?: string }[]
  /** Nothing at all happened in the range. The report still renders (with zeros). */
  isEmpty: boolean
}

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0)
const live = <T extends { deletedAt?: string }>(rows: readonly T[]) =>
  rows.filter((r) => r.deletedAt === undefined)
const byDate = (a: { date: ISODate }, b: { date: ISODate }) =>
  a.date < b.date ? -1 : a.date > b.date ? 1 : 0

/** Kinds keep one series colour each, as in Insights (features/review/insightRows). */
const KIND_SERIES: Record<CategoryId, number> = { everyday: 1, bills: 2, savings: 3, debt: 4 }

/**
 * Whole percents that add up to exactly 100 (largest remainder): each row gets its
 * floor, then the rows that lost the most to rounding get the leftover points. Plain
 * rounding can give 99 or 101, which a reader notices.
 */
export function largestRemainder(amounts: readonly number[], total = 100): number[] {
  const all = sum(amounts)
  if (all <= 0) return amounts.map(() => 0)
  const exact = amounts.map((a) => (a / all) * total)
  const out = exact.map(Math.floor)
  let left = total - sum(out)
  const order = exact
    .map((x, i) => ({ i, r: x - Math.floor(x) }))
    .sort((a, b) => b.r - a.r || a.i - b.i)
  for (const { i } of order) {
    if (left <= 0) break
    out[i]! += 1
    left--
  }
  return out
}

/** Where the money went: the Insights rows for the range, biggest first, zeros left out. */
function categories(input: ReportInput, range: DateRange) {
  const envelopes = live(input.envelopes)
  const { transactions: txs, occurrences, bills } = input
  let rows: { name: string; colorToken?: string; amount: Cents }[]
  if (input.envelopesEnabled && envelopes.length > 0) {
    rows = [
      ...spendByEnvelope(txs, occurrences, bills, envelopes, range).map((r) => ({
        name: r.name,
        colorToken:
          r.envelopeId === null
            ? 'chart-6'
            : (envelopes.find((e) => e.id === r.envelopeId)?.color ?? 'accent'),
        amount: r.actual,
      })),
      ...spendOutsideEnvelopes(txs, occurrences, bills, envelopes, range).map((r) => ({
        name: r.name,
        colorToken: `chart-${KIND_SERIES[r.id]}`,
        amount: r.actual,
      })),
    ]
  } else {
    rows = spendByCategory(txs, occurrences, bills, live(input.funds), range).map((r) => ({
      name: r.name,
      colorToken: `chart-${KIND_SERIES[r.id]}`,
      amount: r.actual,
    }))
  }
  const positive = rows
    .filter((r) => r.amount > 0)
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name))
  const shares = largestRemainder(positive.map((r) => r.amount))
  return positive.map((r, i): CategoryRow => ({ ...r, share: shares[i]! }))
}

function latestOnOrBefore(checkIns: ReportInput['checkIns'], date: ISODate): BalancePoint | null {
  let best: ReportInput['checkIns'][number] | undefined
  for (const c of checkIns) {
    if (c.date > date) continue
    // A later check-in on the same day corrects the earlier one (as in carryOver).
    if (!best || c.date > best.date || (c.date === best.date && c.at > best.at)) best = c
  }
  return best ? { date: best.date, balance: best.balance } : null
}

function transactionKind(t: Transaction): TransactionKind {
  if (t.fundId !== undefined) return t.amount < 0 ? 'Into savings' : 'From savings'
  if (t.billOccurrenceId !== undefined) return 'Bill payment'
  if (isDebtPayment(t)) return 'Debt payment'
  return t.amount < 0 ? 'Spending' : 'Income'
}

/**
 * The report for `from` to `to`, both days included. Throws a RangeError for a date that
 * isn't 'YYYY-MM-DD' or a start after the end: the screen never offers either.
 */
export function buildReport(input: ReportInput, from: ISODate, to: ISODate): Report {
  if (!isValidISODate(from) || !isValidISODate(to)) throw new RangeError('Invalid report date')
  if (from > to) throw new RangeError('The report starts after it ends')

  const localDate = input.localDate ?? ((at: Instant) => at.slice(0, 10))
  const inRange = (d: ISODate) => d >= from && d <= to
  const end = addDays(to, 1)
  const since = input.since ?? historyStart(input)
  // What Look back counts: nothing before Steady was used.
  const counted: DateRange = { start: maxDate(from, since), end }
  const hasCounted = counted.start < counted.end

  const envelopeName = new Map(input.envelopes.map((e) => [e.id, e.name]))
  const fundName = new Map(input.funds.map((f) => [f.id, f.name]))
  const debtName = new Map(input.debts.map((d) => [d.id, d.name]))
  const billById = new Map([...(input.allBills ?? []), ...input.bills].map((b) => [b.id, b]))

  // --- Summary (Look back's numbers) ---
  const flows = flowsIn(input, { start: from, end })
  const txs = live(input.transactions)
  const countedTxs = hasCounted
    ? txs.filter((t) => t.date >= counted.start && t.date < counted.end)
    : []
  const fundMoves = countedTxs.filter((t) => t.fundId !== undefined)
  const savedToFunds = 0 - sum(fundMoves.filter((t) => t.amount < 0).map((t) => t.amount))
  const takenFromFunds = sum(fundMoves.filter((t) => t.amount > 0).map((t) => t.amount))

  const summary: ReportSummary = {
    moneyIn: flows.incomeIn,
    moneyOut: flows.moneyOut,
    spending: flows.spending,
    billsPaid: flows.billsPaid,
    debtPaid: flows.debtPaid,
    savedToFunds,
    takenFromFunds,
    leftOver: flows.net,
    startBalance: latestOnOrBefore(input.checkIns, from),
    endBalance: latestOnOrBefore(input.checkIns, to),
  }

  // --- Paydays counted as money in (past ones, from the history on) ---
  const payEnd = minDate(end, addDays(input.today, 1))
  const paydays: ReportPayday[] =
    hasCounted && counted.start < payEnd
      ? paydayEntriesBetween(input.incomes, input.paydayOverrides, counted.start, payEnd).map(
          (p) => ({ date: p.date, name: p.name, amount: p.amount }),
        )
      : []

  // --- Where it went ---
  const byCategory = hasCounted ? categories(input, counted) : []

  // --- Bills ---
  const addedOn = addedOnMap(input.bills, localDate)
  const entries = hasCounted
    ? billEntriesBetween(input.bills, input.occurrences, counted.start, counted.end)
    : []
  const toBill = (e: BillEntry): ReportBill => {
    const bill = billById.get(e.billId)
    const envelope = bill?.envelopeId !== undefined ? envelopeName.get(bill.envelopeId) : undefined
    const debt = e.debtId !== undefined ? debtName.get(e.debtId) : undefined
    return {
      date: e.date,
      name: e.name,
      amount: e.amount,
      autopay: e.autopay,
      ...(envelope !== undefined ? { envelope } : {}),
      ...(debt !== undefined ? { debt } : {}),
    }
  }
  const paid = entries.filter((e) => e.status === 'paid').map(toBill)
  const skipped = entries.filter((e) => e.status === 'skipped').map(toBill)
  // An occurrence dated before its bill was added is history, not something still owed.
  const dueUnpaid = entries
    .filter((e) => {
      if (e.status !== 'due') return false
      const added = addedOn.get(e.billId)
      return added === undefined || e.date >= added
    })
    .map(toBill)
  const totalOf = (rows: ReportBill[]) => sum(rows.map((r) => r.amount))
  const bills: ReportBills = {
    paid,
    skipped,
    dueUnpaid,
    totals: { paid: totalOf(paid), skipped: totalOf(skipped), dueUnpaid: totalOf(dueUnpaid) },
  }

  // --- Every transaction in the range ---
  const inRangeTxs = txs
    .filter((t) => inRange(t.date))
    .sort((a, b) =>
      a.date !== b.date
        ? a.date < b.date
          ? -1
          : 1
        : a.createdAt < b.createdAt
          ? -1
          : a.createdAt > b.createdAt
            ? 1
            : 0,
    )
  const transactions: ReportTransaction[] = inRangeTxs.map((t) => {
    const kind = transactionKind(t)
    let category = ''
    if (t.fundId !== undefined) category = fundName.get(t.fundId) ?? ''
    else if (t.billOccurrenceId !== undefined)
      category = billById.get(t.billOccurrenceId.split('|')[0]!)?.name ?? ''
    else if (t.debtId !== undefined) category = debtName.get(t.debtId) ?? ''
    else if (t.envelopeId !== undefined) category = envelopeName.get(t.envelopeId) ?? ''
    return { date: t.date, kind, category, note: t.note, amount: t.amount }
  })

  // --- Savings funds: live ones, plus a deleted one that moved money in the range ---
  const funds: ReportFund[] = input.funds
    .filter((f) => f.deletedAt === undefined || fundMoves.some((t) => t.fundId === f.id))
    .map((f) => {
      const moves = fundMoves.filter((t) => t.fundId === f.id)
      const savedAtEnd =
        f.openingSaved -
        sum(txs.filter((t) => t.fundId === f.id && t.date < end).map((t) => t.amount))
      return {
        name: f.name,
        movedIn: 0 - sum(moves.filter((t) => t.amount < 0).map((t) => t.amount)),
        movedOut: sum(moves.filter((t) => t.amount > 0).map((t) => t.amount)),
        savedAtEnd,
        ...(f.target !== undefined ? { target: f.target } : {}),
        percent:
          f.target && f.target > 0
            ? Math.round(Math.min(1, Math.max(0, savedAtEnd / f.target)) * 100)
            : null,
      }
    })

  // --- Debts (the same rows as Look back's debt card) ---
  // A debt deleted since keeps its row when it was paid in the range, so the table adds
  // up to "Debt paid" above it (debtsInRange itself lists live debts only).
  const paidDebtIds = new Set([
    ...countedTxs.filter(isDebtPayment).map((t) => t.debtId),
    ...entries.filter((e) => e.status === 'paid').map((e) => e.debtId),
  ])
  const reportDebts = input.debts
    .filter((d) => d.deletedAt === undefined || paidDebtIds.has(d.id))
    .map((d): Debt => (d.deletedAt === undefined ? d : { ...d, deletedAt: undefined }))
  const debtRows = hasCounted
    ? debtsInRange(
        reportDebts,
        input.bills,
        input.occurrences,
        input.transactions,
        counted,
        input.today,
      ).rows
    : []
  const debtById = new Map(input.debts.map((d) => [d.id, d]))
  const debts: ReportDebt[] = debtRows.map((r) => ({
    name: r.name,
    paidInRange: r.paidInRange,
    balanceNow: r.owed,
    aprPercent: r.aprBps / 100,
    minimum: debtById.get(r.id)?.minPayment ?? 0,
  }))

  // --- Check-ins, notes, no-spend days, the 48-hour list, life goals ---
  const checkIns = input.checkIns
    .filter((c) => inRange(c.date))
    .sort((a, b) => byDate(a, b) || (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
    .map((c) => ({ date: c.date, balance: c.balance }))

  const periodEnd = (start: ISODate) =>
    payPeriodRanges(input, { start, end: addDays(start, 1) })[0]?.end ?? addMonths(start, 1)
  const notes: ReportNote[] = []
  for (const n of input.notes) {
    const text = n.text.trim()
    if (!text) continue
    if (n.date !== undefined && inRange(n.date)) notes.push({ kind: 'day', date: n.date, text })
    else if (n.periodStart !== undefined && n.periodStart <= to) {
      const until = addDays(periodEnd(n.periodStart), -1)
      if (until >= from) notes.push({ kind: 'period', date: n.periodStart, until, text })
    }
  }
  notes.sort((a, b) => byDate(a, b) || (a.kind === b.kind ? 0 : a.kind === 'period' ? -1 : 1))

  // Only days that really had no spending: a mark left on a day with a coffee logged
  // later would be a claim the report can't back.
  const spentOn = new Set(txs.filter((t) => inRange(t.date) && isSpend(t)).map((t) => t.date))
  const noSpendDates = [
    ...new Set(input.noSpend.map((d) => d.date).filter((d) => inRange(d) && !spentOn.has(d))),
  ].sort()

  const decided = input.impulse
    .filter(
      (i): i is ImpulseItem & { decision: 'bought' | 'skipped'; decidedAt: Instant } =>
        (i.decision === 'bought' || i.decision === 'skipped') &&
        i.decidedAt !== undefined &&
        inRange(localDate(i.decidedAt)),
    )
    .map((i) => ({
      name: i.name,
      amount: i.amount,
      decision: i.decision,
      date: localDate(i.decidedAt),
    }))
    .sort(byDate)
  const skippedItems = decided.filter((i) => i.decision === 'skipped')
  const impulse: ReportImpulse = {
    skippedTotal: sum(skippedItems.map((i) => i.amount)),
    skippedCount: skippedItems.length,
    boughtCount: decided.length - skippedItems.length,
    items: decided,
  }

  const lifeGoalsDone = input.lifeGoals
    .filter((g) => g.status === 'done' && g.doneAt !== undefined && inRange(localDate(g.doneAt)))
    .map((g) => ({
      title: g.title,
      date: localDate(g.doneAt!),
      ...(g.why?.trim() ? { why: g.why.trim() } : {}),
    }))
    .sort(byDate)

  const isEmpty =
    transactions.length === 0 &&
    paydays.length === 0 &&
    paid.length + skipped.length + dueUnpaid.length === 0 &&
    checkIns.length === 0 &&
    notes.length === 0 &&
    noSpendDates.length === 0 &&
    decided.length === 0 &&
    lifeGoalsDone.length === 0 &&
    summary.moneyIn === 0 &&
    summary.moneyOut === 0

  return {
    meta: {
      from,
      to,
      days: daysBetween(from, to) + 1,
      currency: input.currency,
      decimals: input.decimals,
      locale: input.locale,
      generatedOn: input.generatedOn,
      ...(input.displayName?.trim() ? { displayName: input.displayName.trim() } : {}),
    },
    summary,
    paydays,
    byCategory,
    categoryMode: input.envelopesEnabled && live(input.envelopes).length > 0 ? 'envelope' : 'kind',
    bills,
    transactions,
    funds,
    debts,
    checkIns,
    notes,
    noSpendDays: { count: noSpendDates.length, dates: noSpendDates },
    impulse,
    lifeGoalsDone,
    isEmpty,
  }
}

/** Counts the preview card shows (and the e2e checks against). */
export const reportCounts = (r: Report) => ({
  transactions: r.transactions.length,
  billsPaid: r.bills.paid.length,
  bills: r.bills.paid.length + r.bills.skipped.length + r.bills.dueUnpaid.length,
})

/** steady-report-2026-10-01_to_2026-10-31.pdf */
export const reportFileName = (from: ISODate, to: ISODate) => `steady-report-${from}_to_${to}.pdf`
