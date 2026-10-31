// React bindings. useLiveQuery re-runs the query whenever a table it read changes, from
// this tab or another, so components never hold a stale copy of the data. Each hook
// returns undefined while the first read is in flight; render a skeleton for that.
import { useLiveQuery } from 'dexie-react-hooks'
import type { ISODate } from '../domain/types'
import * as repos from './repos'
import { lastUndo } from './undo'

export const useIncomes = () => useLiveQuery(repos.listIncomes)
export const usePaydayOverrides = () => useLiveQuery(() => repos.listPaydayOverrides())
export const useBills = () => useLiveQuery(repos.listBills)
export const useBillOccurrences = () => useLiveQuery(() => repos.listOccurrences())
export const useEnvelopes = () => useLiveQuery(repos.listEnvelopes)
export const useFunds = () => useLiveQuery(repos.listFunds)
export const useDebts = () => useLiveQuery(repos.listDebts)
export const useImpulse = () => useLiveQuery(repos.listImpulse)
export const useNoSpend = () => useLiveQuery(repos.listNoSpend)
export const useNotes = () => useLiveQuery(repos.listNotes)
export const useLatestCheckIn = () => useLiveQuery(repos.latestCheckIn)
export const useCheckIns = () => useLiveQuery(repos.listCheckIns)
export const useSettings = () => useLiveQuery(repos.getSettings)
export const useRecentlyDeleted = () => useLiveQuery(repos.listRecentlyDeleted)
export const useRecentTransactions = (limit = 20) =>
  useLiveQuery(() => repos.recentTransactions(limit), [limit])

/** Transactions in [from, to] inclusive; omit both for all of them. */
export const useTransactions = (from?: ISODate, to?: ISODate) =>
  useLiveQuery(() => repos.listTransactions(from, to), [from, to])

/** The label of the action Undo would revert ("Delete bill"), null if none, undefined while loading. */
export const useUndoLabel = () => useLiveQuery(async () => (await lastUndo())?.label ?? null)
