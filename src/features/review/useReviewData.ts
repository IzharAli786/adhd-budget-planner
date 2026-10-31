import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { useAppSettings } from '../../app/SettingsProvider'
import {
  useBillOccurrences,
  useBills,
  useCheckIns,
  useDebts,
  useEnvelopes,
  useFunds,
  useIncomes,
  usePaydayOverrides,
  useTransactions,
} from '../../db/hooks'
import { getMeta } from '../../db/repos'
import { historyStart, type PeriodCloseLog, type ReviewInput } from '../../domain/review'
import type {
  Bill,
  BillOccurrence,
  Debt,
  Envelope,
  ISODate,
  SavingsFund,
  Transaction,
} from '../../domain/types'

export interface ReviewData {
  input: ReviewInput
  envelopes: Envelope[]
  envelopesEnabled: boolean
  funds: SavingsFund[]
  debts: Debt[]
  bills: Bill[]
  occurrences: BillOccurrence[]
  transactions: Transaction[]
}

/** Every row Look back, Insights and the printed report read; null while loading. */
export function useReviewData(today: ISODate): ReviewData | null {
  const { settings } = useAppSettings()
  const incomes = useIncomes()
  const paydayOverrides = usePaydayOverrides()
  const bills = useBills()
  const occurrences = useBillOccurrences()
  const transactions = useTransactions()
  const checkIns = useCheckIns()
  const envelopes = useEnvelopes()
  const funds = useFunds()
  const debts = useDebts()
  // `?? {}` inside the query: useLiveQuery's own undefined means "still loading".
  const periodClose = useLiveQuery(async () => (await getMeta<PeriodCloseLog>('periodClose')) ?? {})

  return useMemo(() => {
    if (
      !incomes ||
      !paydayOverrides ||
      !bills ||
      !occurrences ||
      !transactions ||
      !checkIns ||
      !envelopes ||
      !funds ||
      !debts ||
      !periodClose
    )
      return null
    const input: ReviewInput = {
      today,
      incomes,
      paydayOverrides,
      bills,
      occurrences,
      transactions,
      checkIns,
      periodClose,
    }
    return {
      input: { ...input, since: historyStart(input) },
      envelopes,
      envelopesEnabled: settings.envelopesEnabled,
      funds,
      debts,
      bills,
      occurrences,
      transactions,
    }
  }, [
    today,
    incomes,
    paydayOverrides,
    bills,
    occurrences,
    transactions,
    checkIns,
    envelopes,
    funds,
    debts,
    periodClose,
    settings.envelopesEnabled,
  ])
}
