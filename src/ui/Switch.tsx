import { cx } from './cx'

interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  /** Accessible name when no visible label points at it. */
  label: string
  id?: string
  /** Id of a helper line that explains the setting. */
  describedBy?: string
}

/** A button with role="switch": screen readers announce "on/off", not "checked". */
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
      className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center"
    >
      <span
        className={cx(
          'relative h-7 w-12 rounded-full transition-colors',
          checked ? 'bg-accent' : 'bg-line',
        )}
      >
        <span
          className={cx(
            'absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform',
            checked && 'translate-x-5',
          )}
        />
      </span>
    </button>
  )
}
