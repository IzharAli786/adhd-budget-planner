import type { SavingsFund } from '../../domain/types'
import { softRepo } from './softRepo'

const repo = softRepo<SavingsFund>('funds', 'savings fund')

export const getFund = repo.get
export const listFunds = repo.list
export const listDeletedFunds = repo.listDeleted
export const addFund = (input: Omit<SavingsFund, 'id'>) => repo.add(input)
export const updateFund = repo.update
export const deleteFund = repo.remove
export const restoreFund = repo.restore
