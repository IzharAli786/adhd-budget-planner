// The payday moment's carry-over (Look back). Stored in meta.periodClose so the review
// shows the number the user saw then, even if older entries are edited later.
import { primaryIncome, currentPeriod } from '../../domain/paySchedule'
import { carryOver, type Carry, type PeriodCloseLog } from '../../domain/review'
import type { ISODate } from '../../domain/types'
import { db } from '../schema'
import { mutate } from '../undo'
import { alive, nowInstant } from './util'

/**
 * Works out what was carried into the current pay period from its latest balance and
 * saves it. Null (and nothing saved) when there is no payday or no balance in this period
 * yet. Not undoable: it is bookkeeping, like the other meta writes.
 */
export async function recordCarryOver(today: ISODate): Promise<Carry | null> {
  const [incomes, paydayOverrides, bills, occurrences, transactions, checkIns] = await Promise.all([
    db.incomes.toArray(),
    db.paydayOverrides.toArray(),
    db.bills.toArray(),
    db.billOccurrences.toArray(),
    db.transactions.toArray(),
    db.checkIns.toArray(),
  ])
  const income = primaryIncome(incomes)
  const period = income && currentPeriod(income, today, paydayOverrides)
  if (!period) return null
  const carry = carryOver(
    { today, incomes, paydayOverrides, bills: alive(bills), occurrences, transactions, checkIns },
    period.start,
    period.end,
  )
  if (carry?.source !== 'check-in') return null
  await mutate(null, ['meta'], async (w) => {
    const log = ((await w.get('meta', 'periodClose'))?.value ?? {}) as PeriodCloseLog
    await w.put('meta', {
      key: 'periodClose',
      value: { ...log, [period.start]: { carried: carry.amount, at: nowInstant() } },
    })
  })
  return carry
}
