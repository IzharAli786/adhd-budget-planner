import { Dialog } from '../../ui/Dialog'
import { Button } from '../../ui/Button'
import { cx } from '../../ui/cx'
import type { EditScope } from './actions'

interface EditScopeDialogProps {
  open: boolean
  billName: string
  /** e.g. "Fri 7 Nov": the occurrence the edit started from. */
  dateLabel: string
  /** Only an amount can differ for a single occurrence. */
  canChangeOne: boolean
  onChoose: (scope: EditScope) => void
  onClose: () => void
}

/** The calendar-app question for repeating items: which ones does this edit touch? */
export function EditScopeDialog({
  open,
  billName,
  dateLabel,
  canChangeOne,
  onChoose,
  onClose,
}: EditScopeDialogProps) {
  const options: { scope: EditScope; title: string; detail: string; disabled?: boolean }[] = [
    {
      scope: 'one',
      title: 'Just this one',
      detail: canChangeOne
        ? `Only the bill on ${dateLabel} changes.`
        : 'Only the amount can change for a single bill. To change its date, use Move.',
      disabled: !canChangeOne,
    },
    {
      scope: 'following',
      title: 'This and following',
      detail: `From ${dateLabel} on. Earlier bills stay as they were.`,
    },
    {
      scope: 'all',
      title: 'All',
      detail: 'Every bill in the series. Ones you already paid keep what you paid.',
    },
  ]
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Change which ${billName} bills?`}
      actions={
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      }
    >
      <div className="space-y-2">
        {options.map((o) => (
          <button
            key={o.scope}
            type="button"
            disabled={o.disabled}
            onClick={() => onChoose(o.scope)}
            className={cx(
              'block min-h-14 w-full rounded-2xl px-4 py-3 text-left ring-1 ring-line transition-[background-color,box-shadow]',
              // The option under the pointer or finger reads as chosen: accent wash + edge.
              'hover:bg-accent-soft/50 hover:ring-[1.5px] hover:ring-accent active:bg-accent-soft/50 active:ring-[1.5px] active:ring-accent',
              // Unavailable, but still readable: a neutral slab with muted words (no fading).
              'disabled:cursor-not-allowed disabled:bg-tone-neutral-bg disabled:text-muted disabled:ring-0',
            )}
          >
            <span className="block font-medium">{o.title}</span>
            <span className="block text-sm text-muted">{o.detail}</span>
          </button>
        ))}
      </div>
    </Dialog>
  )
}
