import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { useAppSettings } from '../../app/SettingsProvider'
import { csvNames } from '../../db/csv'
import { useImpulse, useLifeGoals, useNoSpend, useNotes } from '../../db/hooks'
import type { ReportInput } from '../../domain/report'
import type { ISODate } from '../../domain/types'
import { todayISO } from '../../lib/clock'
import { useReviewData } from '../review/useReviewData'

/**
 * Everything buildReport reads, live from the database; null while loading. Look back's
 * rows (so the numbers agree with it), plus every envelope, fund and debt by id, deleted
 * ones too (csvNames), so an old entry still names where it went.
 */
export function useReportInput(today: ISODate): ReportInput | null {
  const review = useReviewData(today)
  const { settings } = useAppSettings()
  const names = useLiveQuery(csvNames)
  const notes = useNotes()
  const noSpend = useNoSpend()
  const impulse = useImpulse()
  const lifeGoals = useLifeGoals()

  return useMemo(() => {
    if (!review || !names || !notes || !noSpend || !impulse || !lifeGoals) return null
    return {
      ...review.input,
      envelopes: names.envelopes,
      envelopesEnabled: settings.envelopesEnabled,
      funds: names.funds,
      debts: names.debts,
      notes,
      noSpend,
      impulse,
      lifeGoals,
      currency: settings.currency,
      decimals: settings.decimals,
      locale: settings.locale,
      displayName: settings.displayName,
      generatedOn: today,
      localDate: (at) => todayISO(new Date(at)),
    }
  }, [review, names, notes, noSpend, impulse, lifeGoals, settings, today])
}
