// The shared day list (PLAN-v2 §4, R14): every dated thing on a day, in one shape, so
// Coming up and the Calendar can never disagree about what happens when.
import { effectiveStatus, type BillEntry, type EffectiveStatus, type PaydayLine } from './bills'
import { addDays } from './dates'
import {
  entriesBetween,
  paydaysBetweenDates,
  transactionsBetween,
  txKind,
  type LedgerInput,
  type TxKind,
} from './ledger'
import type { Cents } from './money'
import { fundSaved } from './savings'
import type { DateRange, Id, ISODate, Note, Transaction } from './types'

export { effectiveStatus, type EffectiveStatus }

/** Every item has the day it sits on; `kind` says what it is. */
export type DayItem = { date: ISODate } & (
  | { kind: 'payday'; line: PaydayLine } // amount after overrides; skipped flagged
  | { kind: 'bill'; entry: BillEntry; status: EffectiveStatus }
  | { kind: 'debt-min'; entry: BillEntry; status: EffectiveStatus; debtId: Id }
  | { kind: 'saving-plan'; fundId: Id; name: string; amount: Cents } // on primary paydays until met
  | { kind: 'note'; note: Note }
  | { kind: 'tx'; tx: Transaction; txKind: TxKind }
)

const ORDER: Record<DayItem['kind'], number> = {
  payday: 0,
  bill: 1,
  'debt-min': 2,
  'saving-plan': 3,
  tx: 4,
  note: 5,
}

/**
 * Everything dated in [range.start, range.end): paydays (skipped ones flagged), bills and
 * debt minimums with their effective status, savings plans on primary paydays from today
 * on, day notes and logged entries. Sorted by date, then kind.
 */
export function itemsBetween(range: DateRange, input: LedgerInput, today: ISODate): DayItem[] {
  if (range.start >= range.end) return []
  const out: DayItem[] = []
  const paydays = paydaysBetweenDates(input, range.start, range.end)
  for (const line of paydays) out.push({ kind: 'payday', date: line.date, line })
  for (const entry of entriesBetween(input, range.start, range.end)) {
    const status = effectiveStatus(entry, today)
    if (entry.debtId !== undefined)
      out.push({ kind: 'debt-min', date: entry.date, entry, status, debtId: entry.debtId })
    else out.push({ kind: 'bill', date: entry.date, entry, status })
  }
  // A plan is a suggestion for paydays still ahead; what was really moved shows as a 'tx'.
  // Each one asks for the rest of the target at most, so a fund nearly there asks less.
  const txs = input.transactions
  const left = new Map<Id, number>()
  for (const f of input.funds ?? []) {
    if (f.deletedAt !== undefined || f.perPeriod <= 0) continue
    left.set(f.id, f.target === undefined ? Infinity : f.target - fundSaved(f, txs, today))
  }
  for (const p of paydays) {
    if (!p.primary || p.skipped || p.date < today) continue
    for (const f of input.funds ?? []) {
      const rest = left.get(f.id)
      if (rest === undefined || rest <= 0) continue
      const amount = Math.min(f.perPeriod, rest)
      left.set(f.id, rest - amount)
      out.push({ kind: 'saving-plan', date: p.date, fundId: f.id, name: f.name, amount })
    }
  }
  for (const note of input.notes ?? [])
    if (note.date !== undefined && note.date >= range.start && note.date < range.end)
      out.push({ kind: 'note', date: note.date, note })
  for (const tx of transactionsBetween(input, range.start, range.end))
    out.push({ kind: 'tx', date: tx.date, tx, txKind: txKind(tx) })
  return out.sort((a, b) =>
    a.date !== b.date ? (a.date < b.date ? -1 : 1) : ORDER[a.kind] - ORDER[b.kind],
  )
}

export interface ComingUpOptions {
  max: number
  horizonDays: number
}

/** Something that still needs a tick or is still ahead. */
function isOpen(item: DayItem, today: ISODate): boolean {
  switch (item.kind) {
    case 'payday':
      return !item.line.skipped && item.date >= today
    case 'bill':
    case 'debt-min':
      // Unpaid since the start (overdue included); paid or autopay ones only from today on.
      return item.status === 'due' || (item.status === 'paid' && item.date >= today)
    case 'saving-plan':
      return item.date >= today
    case 'note':
      return item.note.doneAt === undefined && item.date >= today
    case 'tx':
      // Future-dated entries only: today's are already logged.
      return item.date > today
  }
}

/**
 * Coming up on Today (decision 13): unpaid bills and minimums since the start first, then
 * the next items within the horizon, at most `max` in all. Pass items from the start of
 * tracking to today + horizon (itemsBetween).
 */
export function comingUp(
  items: readonly DayItem[],
  today: ISODate,
  opts: ComingUpOptions = { max: 5, horizonDays: 45 },
): DayItem[] {
  const horizon = addDays(today, opts.horizonDays)
  const open = items.filter((i) => i.date <= horizon && isOpen(i, today))
  const overdue = open.filter((i) => i.date < today)
  const ahead = open.filter((i) => i.date >= today)
  return [...overdue, ...ahead].slice(0, opts.max)
}
