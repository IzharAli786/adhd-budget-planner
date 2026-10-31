import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { useAppSettings } from '../../app/SettingsProvider'
import {
  useBillOccurrences,
  useBills,
  useCheckIns,
  useEnvelopes,
  useFunds,
  useIncomes,
  usePaydayOverrides,
  useTransactions,
} from '../../db/hooks'
import { getMeta } from '../../db/repos'
import { addedOnMap } from '../../domain/bills'
import { daysBetween } from '../../domain/dates'
import { type ActionState, type Snoozes } from '../../domain/nextAction'
import { overdueManual, planToday } from '../../domain/today'
import type { Instant, ISODate } from '../../domain/types'
import { todayISO } from '../../lib/clock'

const localDate = (at: Instant) => todayISO(new Date(at))

/**
 * Today's rows from IndexedDB, run through the pure planToday(). useLiveQuery re-runs
 * when any of these tables change, so logging "12 coffee" anywhere updates the hero.
 */
export function useTodayModel(today: ISODate) {
  const { settings } = useAppSettings()
  const incomes = useIncomes()
  const paydayOverrides = usePaydayOverrides()
  const bills = useBills()
  const occurrences = useBillOccurrences()
  const transactions = useTransactions()
  const checkIns = useCheckIns()
  const envelopes = useEnvelopes()
  const funds = useFunds()
  // `?? {}` inside the query: useLiveQuery's own undefined means "still loading".
  const snoozes = useLiveQuery(async () => (await getMeta<Snoozes>('snoozes')) ?? {})
  const lastBackupAt = useLiveQuery(async () => (await getMeta<Instant>('lastBackupAt')) ?? null)

  const loaded =
    incomes !== undefined &&
    paydayOverrides !== undefined &&
    bills !== undefined &&
    occurrences !== undefined &&
    transactions !== undefined &&
    checkIns !== undefined &&
    envelopes !== undefined &&
    funds !== undefined &&
    snoozes !== undefined &&
    lastBackupAt !== undefined

  const checkIn = checkIns?.at(-1)

  const plan = useMemo(() => {
    if (!loaded) return null
    return planToday({
      today,
      incomes,
      paydayOverrides,
      bills,
      occurrences,
      transactions,
      checkIn,
      funds,
      envelopes,
      envelopesEnabled: settings.envelopesEnabled,
      buffer: settings.buffer,
      addedOn: addedOnMap(bills, localDate),
    })
  }, [
    loaded,
    today,
    incomes,
    paydayOverrides,
    bills,
    occurrences,
    transactions,
    checkIn,
    funds,
    envelopes,
    settings.envelopesEnabled,
    settings.buffer,
  ])

  // Only a ready Today has an action card; before that, the empty state IS the action.
  const actionState = useMemo<ActionState | null>(() => {
    if (plan?.kind !== 'ready' || !checkIns?.length) return null
    // With no backup yet, the clock starts with the first check-in.
    const since = lastBackupAt ? localDate(lastBackupAt) : checkIns[0]!.date
    return {
      nextPayday: plan.period.end,
      overdue: overdueManual(plan.safe.dueEntries, today),
      balanceAgeDays: plan.safe.balanceAgeDays,
      paydaySinceCheckIn: plan.paydaySinceCheckIn,
      daysSinceBackup: daysBetween(since, today),
      hasBills: (bills?.length ?? 0) > 0,
      loggedToday: (transactions ?? []).some((t) => t.date === today),
    }
  }, [plan, checkIns, lastBackupAt, today, bills, transactions])

  return {
    loaded,
    plan,
    actionState,
    snoozes: snoozes ?? {},
    checkIn,
    transactions: transactions ?? [],
    envelopes: envelopes ?? [],
  }
}

export type TodayModel = ReturnType<typeof useTodayModel>
