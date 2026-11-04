import { useEffect, useRef, type InputHTMLAttributes, type ReactNode } from 'react'
import { cx } from './cx'
import { Icon } from './Icon'

export type CheckboxTone = 'accent' | 'success'

interface CheckboxProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'size' | 'onChange' | 'checked' | 'children' | 'className'
> {
  checked: boolean
  onCheckedChange: (next: boolean) => void
  /** Some but not all: sets input.indeterminate and aria-checked="mixed". */
  indeterminate?: boolean
  /** The fill when checked: 'success' for "paid / done" ticks, accent otherwise. */
  tone?: CheckboxTone
  /** Visible label. Without one, pass aria-label. */
  children?: ReactNode
  /** Wrapper layout only (margin, self-alignment). */
  className?: string
}

const BOX =
  'size-5 shrink-0 rounded-[0.375rem] bg-surface ring-[1.5px] ring-control ring-inset transition-colors'

const FILL: Record<CheckboxTone, string> = {
  accent: 'checked:bg-accent indeterminate:bg-accent',
  success: 'checked:bg-tone-success indeterminate:bg-tone-success',
}
const GLYPH: Record<CheckboxTone, string> = {
  accent: 'text-accent-contrast',
  success: 'text-surface',
}

/**
 * The one tick in the app: a 20px rounded square in a 44px target. A native checkbox, so
 * Space toggles it and screen readers say "checkbox, checked" with no extra wiring.
 */
export function Checkbox({
  checked,
  onCheckedChange,
  indeterminate = false,
  tone = 'accent',
  children,
  className,
  ...rest
}: CheckboxProps) {
  const ref = useRef<HTMLInputElement>(null)
  // Every render: a click clears the DOM flag natively even when the prop stays true.
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate
  })

  return (
    <label
      className={cx(
        'inline-flex min-h-11 cursor-pointer items-center',
        children != null && 'gap-1 pr-2',
        className,
      )}
    >
      <span className="relative grid size-11 shrink-0 place-items-center">
        <input
          {...rest}
          ref={ref}
          type="checkbox"
          checked={checked}
          aria-checked={indeterminate ? 'mixed' : undefined}
          onChange={(e) => onCheckedChange(e.target.checked)}
          className={cx(
            // Hover tints the empty box only; a filled one keeps its fill.
            'peer col-start-1 row-start-1 cursor-pointer appearance-none hover:not-checked:not-indeterminate:bg-accent-soft/60',
            BOX,
            'checked:ring-0 indeterminate:ring-0 disabled:cursor-not-allowed disabled:opacity-50',
            FILL[tone],
          )}
        />
        {(checked || indeterminate) && (
          <Icon
            name={indeterminate ? 'minus' : 'check'}
            size={14}
            weight="bold"
            className={cx('pointer-events-none col-start-1 row-start-1', GLYPH[tone])}
          />
        )}
      </span>
      {children != null && <span className="text-body">{children}</span>}
    </label>
  )
}

/**
 * The same 20px box with no input of its own, for a control that already has its role
 * (Calendar's "Mark paid" button with aria-pressed). Decorative: the control speaks.
 */
export function CheckboxMark({
  checked,
  indeterminate = false,
  tone = 'accent',
}: {
  checked: boolean
  indeterminate?: boolean
  tone?: CheckboxTone
}) {
  const on = checked || indeterminate
  return (
    <span
      aria-hidden="true"
      className={cx(
        'grid size-5 shrink-0 place-items-center rounded-[0.375rem] transition-colors',
        on
          ? tone === 'success'
            ? 'bg-tone-success'
            : 'bg-accent'
          : 'bg-surface ring-[1.5px] ring-control ring-inset',
      )}
    >
      {on && (
        <Icon
          name={indeterminate ? 'minus' : 'check'}
          size={14}
          weight="bold"
          className={GLYPH[tone]}
        />
      )}
    </span>
  )
}

/** A native radio drawn as a 20px ring that fills to a dot; wrap it in a 44px label. */
export const radioClass =
  'size-5 shrink-0 cursor-pointer appearance-none rounded-full bg-surface ring-[1.5px] ring-control ring-inset transition-[box-shadow] checked:ring-[6px] checked:ring-accent disabled:opacity-50'
