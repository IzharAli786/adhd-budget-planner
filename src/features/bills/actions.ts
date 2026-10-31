import { rebaseRule, sameRule } from '../../domain/bills'
import type { Cents } from '../../domain/money'
import type { Bill, ISODate, Recurrence } from '../../domain/types'
import { editBill, editBillFrom, setOccurrenceAmount } from '../../db/repos'

export type EditScope = 'one' | 'following' | 'all'

/** What the bill form produced. `rule: null` means the repeat fields were left alone. */
export interface BillChanges {
  name: string
  amount: Cents
  autopay: boolean
  rule: Recurrence | null
}

/** Did anything other than the amount change? Only an amount can differ for one bill. */
export function onlyAmountChanged(bill: Bill, changes: BillChanges): boolean {
  return (
    changes.name === bill.name &&
    changes.autopay === bill.autopay &&
    (changes.rule === null || sameRule(changes.rule, bill.rule))
  )
}

export function hasChanges(bill: Bill, changes: BillChanges): boolean {
  return !onlyAmountChanged(bill, changes) || changes.amount !== bill.amount
}

/**
 * Applies an edit of a repeating bill at the chosen scope (PLAN §3.5):
 * - one: an amount override on that occurrence; the series is untouched.
 * - following: RFC 5545 split at the occurrence's original date.
 * - all: edits the series. Paid occurrences keep their stored paid amount, so history
 *   never changes; occurrences with their own override keep it. A new rule that would
 *   hide paid bills applies from `today` (see editBill).
 */
export async function applyBillEdit(
  bill: Bill,
  changes: BillChanges,
  scope: EditScope,
  today: ISODate,
  originalDate?: ISODate,
): Promise<string> {
  const patch: Partial<Bill> = {
    name: changes.name,
    amount: changes.amount,
    autopay: changes.autopay,
  }
  if (scope === 'one' && originalDate) {
    await setOccurrenceAmount(bill.id, originalDate, changes.amount)
    return `Changed this ${changes.name} bill`
  }
  if (scope === 'following' && originalDate) {
    if (changes.rule) patch.rule = rebaseRule(changes.rule, originalDate)
    await editBillFrom(bill.id, originalDate, patch)
    return `${changes.name} changed from here on`
  }
  if (changes.rule) patch.rule = changes.rule
  await editBill(bill.id, patch, today)
  return `Saved ${changes.name}`
}
