import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo } from 'react'
import { useAppSettings } from '../../app/SettingsProvider'
import {
  useBillOccurrences,
  useBills,
  useCheckIns,
  useEnvelopes,
  useFunds,
  useImpulse,
  useIncomes,
  usePaydayOverrides,
  useTransactions,
} from '../../db/hooks'
import { getMeta } from '../../db/repos'
import { paydayEntriesBetween } from '../../domain/bills'
import { addDays, daysBetween } from '../../domain/dates'
import { type ActionState, type Snoozes } from '../../domain/nextAction'
import { expiredImpulse } from '../../domain/impulse'
import { overdueManual, planToday, type TodayInput } from '../../domain/today'
import type { Instant, ISODate } from '../../domain/types'
import { todayISO } from '../../lib/clock'
import { IS_DEMO } from '../../lib/demo'
import type { DemoState } from '../../db/demo'

const localDate = (at: Instant) => todayISO(new Date(at))

/**
 * Today's rows from IndexedDB, run through the pure planToday(). useLiveQuery re-runs
 * when any of these tables change, so logging "12 coffee" anywhere updates the hero.
 */
export function useTodayModel(today: ISODate, now: Instant) {
  const { settings, loaded: settingsLoaded, update } = useAppSettings()
  const incomes = useIncomes()
  const paydayOverrides = usePaydayOverrides()
  const bills = useBills()
  const occurrences = useBillOccurrences()
  const transactions = useTransactions()
  const checkIns = useCheckIns()
  const envelopes = useEnvelopes()
  const funds = useFunds()
  const impulse = useImpulse()
  // `?? {}` inside the query: useLiveQuery's own undefined means "still loading".
  const snoozes = useLiveQuery(async () => (await getMeta<Snoozes>('snoozes')) ?? {})
  const lastBackupAt = useLiveQuery(async () => (await getMeta<Instant>('lastBackupAt')) ?? null)
  // Only the demo build has a demo state; the full app never reads it.
  const demo = useLiveQuery(async () =>
    IS_DEMO ? ((await getMeta<DemoState>('demo')) ?? null) : null,
  )

  const loaded =
    incomes !== undefined &&
    paydayOverrides !== undefined &&
    bills !== undefined &&
    occurrences !== undefined &&
    transactions !== undefined &&
    checkIns !== undefined &&
    envelopes !== undefined &&
    funds !== undefined &&
    impulse !== undefined &&
    snoozes !== undefined &&
    lastBackupAt !== undefined &&
    demo !== undefined

  const input = useMemo<TodayInput | null>(() => {
    if (!loaded) return null
    return {
      today,
      money: settings,
      checkIns,
      incomes,
      paydayOverrides,
      bills,
      occurrences,
      transactions,
      envelopes,
      envelopesEnabled: settings.envelopesEnabled,
      buffer: settings.buffer,
    }
  }, [
    settings,
    checkIns,
    loaded,
    today,
    incomes,
    paydayOverrides,
    bills,
    occurrences,
    transactions,
    envelopes,
  ])
  const plan = useMemo(() => (input ? planToday(input) : null), [input])

  // Tracking starts once and stays put: record the derived start the first time, so the
  // starting balance is added to that first period only, never again next month.
  const start = plan?.kind === 'ready' ? plan.start : null
  useEffect(() => {
    if (!settingsLoaded || settings.startDate !== null || !start) return
    void update({ startDate: start.date, startingBalance: start.balance })
  }, [settingsLoaded, settings.startDate, start, update])

  // Only a ready Today has an action card; before that, the empty state IS the action.
  const actionState = useMemo<ActionState | null>(() => {
    if (plan?.kind !== 'ready') return null
    // With no backup yet, the clock starts with tracking.
    const since = lastBackupAt ? localDate(lastBackupAt) : plan.start.date
    const nextPay = paydayEntriesBetween(
      incomes ?? [],
      paydayOverrides ?? [],
      addDays(today, 1),
      addDays(today, 62),
    )[0]
    return {
      nextPayday: nextPay?.date ?? null,
      paydayOptional: settings.planBy === 'month',
      overdue: overdueManual(plan.safe.dueEntries, today),
      // The number no longer depends on a bank balance (PLAN-v2 locked decision A).
      balanceAgeDays: 0,
      paydaySinceCheckIn: false,
      daysSinceBackup: daysBetween(since, today),
      expiredImpulse: expiredImpulse(impulse ?? [], now).length,
      hasBills: (bills?.length ?? 0) > 0,
      loggedToday: (transactions ?? []).some((t) => t.date === today),
      ...(IS_DEMO
        ? { demo: demo?.kind === 'sample' && demo.entries === 0 ? 'sample' : 'other' }
        : {}),
    }
  }, [
    plan,
    settings.planBy,
    incomes,
    paydayOverrides,
    lastBackupAt,
    today,
    now,
    impulse,
    bills,
    transactions,
    demo,
  ])

  return {
    loaded,
    input,
    plan,
    actionState,
    snoozes: snoozes ?? {},
    incomes: incomes ?? [],
    transactions: transactions ?? [],
    envelopes: envelopes ?? [],
    funds: funds ?? [],
    bills: bills ?? [],
    occurrences: occurrences ?? [],
    impulse: impulse ?? [],
  }
}

export type TodayModel = ReturnType<typeof useTodayModel>
