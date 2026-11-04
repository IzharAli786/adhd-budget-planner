import { lastDayOfMonth, parseISODate } from '../../domain/dates'
import type { DayOfMonth, ISODate } from '../../domain/types'

export type EntryKind = 'expense' | 'refund' | 'income' | 'bill' | 'saving' | 'debt'

export const ENTRY_KINDS: readonly { value: EntryKind; label: string; hint: string }[] = [
  { value: 'expense', label: 'Expense', hint: 'Money spent. Counts against safe to spend.' },
  { value: 'income', label: 'Income', hint: 'Money in. Adds to safe to spend.' },
  { value: 'bill', label: 'Bill', hint: 'A bill to pay on this day, once or repeating.' },
  {
    value: 'saving',
    label: 'Savings',
    hint: 'Moved into a fund. Tracked on its own, never lowers safe to spend.',
  },
  {
    value: 'debt',
    label: 'Debt payment',
    hint: 'Paid off a debt. Lowers what you owe, never lowers safe to spend.',
  },
]

/**
 * Money back into one envelope (a return, a refund). Offered only on an envelope's own
 * "+ Add spend" sheet, so it's always a deliberate choice: "Got money" is never a refund.
 */
export const REFUND_KIND = {
  value: 'refund',
  label: 'Refund',
  hint: 'Money back into this envelope, like a return. Lowers what it has spent and adds to safe to spend.',
} as const satisfies { value: EntryKind; label: string; hint: string }

/** The day to repeat on: "last" when the date is the month's last day (31 Jan → 28 Feb). */
export function dayOfMonthOf(date: ISODate): DayOfMonth {
  const { year, month, day } = parseISODate(date)
  return day === lastDayOfMonth(year, month) && day > 28 ? 'last' : day
}
