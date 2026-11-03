import { useNavigate } from 'react-router'
import { setMeta } from '../../db/repos'
import { addSnooze, type NextAction, type Snoozes } from '../../domain/nextAction'
import { Button } from '../../ui/Button'
import { Icon } from '../../ui/Icon'

interface Props {
  /** The data-safety nudge ('backup'): the one action card Today still carries. */
  action: NextAction
  snoozes: Snoozes
}

/**
 * A quiet card under Today's lists when a backup is overdue: everything lives on this
 * device, so one file keeps it safe. "Not now" snoozes it for 24 h, no guilt.
 */
export function ActionCard({ action, snoozes }: Props) {
  const navigate = useNavigate()
  return (
    <section
      aria-labelledby="next-action"
      className="card-quiet animate-fade-in flex flex-col gap-4 px-6 py-5 sm:flex-row sm:items-center"
    >
      <span
        aria-hidden="true"
        className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent sm:inline-flex"
      >
        <Icon name="shield" size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="eyebrow text-accent">Keep your data safe</p>
        <h2 id="next-action" className="mt-1 text-heading">
          {action.trigger}
        </h2>
        <p className="text-body text-muted">{action.detail}</p>
      </div>
      {action.cta && (
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button onClick={() => navigate('/more/backup')}>{action.cta}</Button>
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
