import type { ISODate } from '../../domain/types'
import { NoteEditor } from './NoteEditor'

/** The same note on Plan and Today: one per pay period, keyed by the period's first day. */
export function PaydayNote({ periodStart }: { periodStart: ISODate }) {
  return (
    <NoteEditor
      target={{ periodStart }}
      title="Note for this payday"
      hint="Anything to remember until the next payday? A birthday, a trip, a bill that’s different this time."
    />
  )
}
