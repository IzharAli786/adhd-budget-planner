import { useId, type ReactNode } from 'react'
import { cx } from './cx'
import { Field, inputClass } from './Field'

interface DateInputProps {
  label: ReactNode
  value: string
  onChange: (date: string) => void
  min?: string
  max?: string
  hint?: ReactNode
  error?: ReactNode
  id?: string
  /**
   * Shows the picked date in the app's locale under the field. The native control draws
   * the date in the BROWSER's locale (07/11 vs 11/07), which can disagree with the rest of
   * the app; the preview is the unambiguous version. Ignored while a hint or error shows.
   */
  format?: (date: string) => string
}

// ui imports only domain/money (PLAN §2), so dates are plain 'YYYY-MM-DD' strings here.
// The native picker already speaks 'YYYY-MM-DD', our storage format, so no Date object
// (and no timezone shift) ever sits between the user and the stored value.
export function DateInput({
  label,
  value,
  onChange,
  min,
  max,
  hint,
  error,
  id,
  format,
}: DateInputProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  const shown = hint ?? (format && /^\d{4}-\d{2}-\d{2}$/.test(value) ? format(value) : undefined)
  return (
    <Field id={inputId} label={label} hint={shown} error={error}>
      <input
        id={inputId}
        type="date"
        value={value}
        min={min}
        max={max}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${inputId}-error` : shown ? `${inputId}-hint` : undefined}
        onChange={(e) => onChange(e.target.value)}
        className={cx(inputClass, 'appearance-none tabular-nums')}
      />
    </Field>
  )
}
