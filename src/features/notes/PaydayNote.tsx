import { useAppSettings } from '../../app/SettingsProvider'
import type { ISODate } from '../../domain/types'
import { NoteEditor } from './NoteEditor'

/** The same note on Plan and Today: one per period (month or pay period), keyed by its first day. */
export function PaydayNote({ periodStart, foldId }: { periodStart: ISODate; foldId?: string }) {
  const month = useAppSettings().settings.planBy === 'month'
  return (
    <NoteEditor
      target={{ periodStart }}
      foldId={foldId}
      title={month ? 'Note for this month' : 'Note for this payday'}
      hint={
        month
          ? 'Anything to remember this month? A birthday, a trip, a bill that’s different this time.'
          : 'Anything to remember until the next payday? A birthday, a trip, a bill that’s different this time.'
      }
    />
  )
}
