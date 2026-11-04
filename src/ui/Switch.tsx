import { cx } from './cx'
import { Icon } from './Icon'

interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  /** Accessible name when no visible label points at it. */
  label: string
  id?: string
  /** Id of a helper line that explains the setting. */
  describedBy?: string
}

/**
 * A button with role="switch": screen readers announce "on/off", not "checked". Off is an
 * outlined track with a grey knob (3:1 edges); on is the accent with a ticked knob, so the
 * state never rests on colour alone.
 */
export function Switch({ checked, onChange, label, id, describedBy }: SwitchProps) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-describedby={describedBy}
      onClick={() => onChange(!checked)}
      // rounded-full: the focus ring follows the track's shape, as on every other control.
      className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full"
    >
      <span
        className={cx(
          'relative h-7 w-12 rounded-full transition-colors',
          checked ? 'bg-accent' : 'bg-surface ring-[1.5px] ring-control ring-inset',
        )}
      >
        <span
          className={cx(
            'absolute rounded-full transition-[left,top,width,height] duration-150',
            checked
              ? 'top-0.5 left-[1.375rem] grid size-6 place-items-center bg-accent-contrast shadow-sm'
              : 'top-1.5 left-1.5 size-4 bg-control',
          )}
        >
          {checked && <Icon name="check" size={14} weight="bold" className="text-accent" />}
        </span>
      </span>
    </button>
  )
}
