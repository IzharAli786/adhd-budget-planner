import type { ISODate, Transaction } from '../../domain/types'
import { db } from '../schema'
import { softRepo } from './softRepo'
import { alive, nowInstant } from './util'

const repo = softRepo<Transaction>('transactions', 'entry')

export const getTransaction = repo.get
export const updateTransaction = repo.update
export const deleteTransaction = repo.remove
export const restoreTransaction = repo.restore
export const listDeletedTransactions = repo.listDeleted

export function addTransaction(input: Omit<Transaction, 'id' | 'createdAt'>) {
  return repo.add(
    { ...input, createdAt: nowInstant() },
    input.amount < 0 ? 'Add expense' : 'Add income',
  )
}

/** Live transactions with from <= date <= to, oldest first. Uses the date index. */
export async function listTransactions(from?: ISODate, to?: ISODate) {
  const rows =
    from === undefined && to === undefined
      ? await db.transactions.orderBy('date').toArray()
      : await db.transactions
          .where('date')
          .between(from ?? '0000-01-01', to ?? '9999-12-31', true, true)
          .toArray()
  return alive(rows)
}

/** Most recent notes, for the quick-add chips. */
export async function recentTransactions(limit = 20) {
  return db.transactions
    .orderBy('createdAt')
    .reverse()
    .filter((t) => t.deletedAt === undefined)
    .limit(limit)
    .toArray()
}
