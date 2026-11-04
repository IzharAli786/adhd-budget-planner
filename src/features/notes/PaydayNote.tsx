import { useAppSettings } from '../../app/SettingsProvider'
import type { ISODate } from '../../domain/types'
import { NoteEditor } from './NoteEditor'

/**
 * The note for one period (month or pay period), keyed by its first day. Home shows it as
 * an always-open box under its own section heading ('inline', named by `labelledBy`).
 */
export function PaydayNote({
  periodStart,
  foldId,
  variant,
  labelledBy,
}: {
  periodStart: ISODate
  foldId?: string
  variant?: 'card' | 'inline'
  labelledBy?: string
}) {
  const month = useAppSettings().settings.planBy === 'month'
  return (
    <NoteEditor
      target={{ periodStart }}
      foldId={foldId}
      variant={variant}
      labelledBy={labelledBy}
      title={month ? 'Note for this month' : 'Note for this payday'}
      hint={
        month
          ? 'Anything to remember this month? A birthday, a trip, a bill that’s different this time.'
          : 'Anything to remember until the next payday? A birthday, a trip, a bill that’s different this time.'
      }
    />
  )
}
