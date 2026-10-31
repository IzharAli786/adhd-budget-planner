import type { Cents, Id, ISODate, SavingsFund, Transaction } from '../../domain/types'
import { softRepo } from './softRepo'
import { db } from '../schema'
import { alive, nowInstant } from './util'

const repo = softRepo<SavingsFund>('funds', 'savings fund')
const txRepo = softRepo<Transaction>('transactions', 'entry')

export const getFund = repo.get
export const listFunds = repo.list
export const listDeletedFunds = repo.listDeleted
export const addFund = (input: Omit<SavingsFund, 'id'>) => repo.add(input)
export const updateFund = repo.update
export const deleteFund = repo.remove
export const restoreFund = repo.restore

/**
 * Moves money into a fund: a transaction with fundId (PLAN §3.3), negative because it
 * leaves the spending balance. A negative `amount` takes money back out.
 */
export function addToFund(fund: Pick<SavingsFund, 'id' | 'name'>, amount: Cents, date: ISODate) {
  return txRepo.add(
    { date, amount: -amount, note: fund.name, fundId: fund.id, createdAt: nowInstant() },
    amount >= 0 ? `Add to ${fund.name}` : `Take from ${fund.name}`,
  )
}

/** Live moves in and out of one fund, via the fundId index. */
export const fundTransactions = async (fundId: Id) =>
  alive(await db.transactions.where('fundId').equals(fundId).toArray())
