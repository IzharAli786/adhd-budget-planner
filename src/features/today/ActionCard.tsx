import { useNavigate } from 'react-router'
import { useAppSettings } from '../../app/SettingsProvider'
import { useUndoToast } from '../../app/useUndoToast'
import { markPaid, setMeta } from '../../db/repos'
import { addSnooze, type NextAction, type Snoozes } from '../../domain/nextAction'
import { Button } from '../../ui/Button'
import { Icon } from '../../ui/Icon'
import { useFormat } from '../bills/format'

interface Props {
  action: NextAction
  snoozes: Snoozes
  /** Opens the balance sheet (stale balance, payday). */
  onCheckIn: (offerBackup: boolean) => void
  onLog: () => void
}

/** The single "one thing now" card (PLAN §4.5). "Not now" snoozes it for 24 h. */
export function ActionCard({ action, snoozes, onCheckIn, onLog }: Props) {
  const navigate = useNavigate()
  const undoToast = useUndoToast()
  const f = useFormat()
  const { simpleMode } = useAppSettings().settings

  function run() {
    switch (action.kind) {
      case 'payday-unknown':
        return navigate('/bills?view=paydays')
      case 'overdue-bill': {
        const b = action.bill!
        return void markPaid(b.billId, b.originalDate, b.amount).then(() =>
          undoToast(action.doneState),
        )
      }
      case 'stale-balance':
        return onCheckIn(false)
      case 'payday-checkin':
        return onCheckIn(true)
      case 'backup':
        return navigate('/more/backup')
      case 'impulse':
        return navigate(simpleMode ? '/more/wait' : '/goals')
      case 'setup-bills':
        return navigate('/bills')
      case 'log-today':
        return onLog()
      case 'all-done':
        return
    }
  }

  const done = action.kind === 'all-done'
  return (
    <section
      aria-labelledby="next-action"
      className="animate-fade-in rounded-[1.75rem] bg-accent-soft p-5"
    >
      <p className="eyebrow text-accent">{done ? 'Today' : 'One thing now'}</p>
      <h2 id="next-action" className="mt-1 flex items-center gap-2 text-lg font-medium">
        {done && <Icon name="check" size={20} className="text-accent" />}
        {action.trigger}
      </h2>
      <p className="text-body text-muted">
        {action.bill ? (
          <>
            <span className="font-medium text-text tabular-nums">
              {f.money(action.bill.amount)}
            </span>{' '}
            · due {f.day(action.bill.date)}
          </>
        ) : (
          action.detail
        )}
      </p>
      {action.cta && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={run}>{action.cta}</Button>
          {action.snoozable && (
            <Button
              variant="ghost"
              className="text-muted"
              onClick={() =>
                void setMeta('snoozes', addSnooze(snoozes, action.id, new Date().toISOString()))
              }
            >
              Not now
            </Button>
          )}
        </div>
      )}
    </section>
  )
}
