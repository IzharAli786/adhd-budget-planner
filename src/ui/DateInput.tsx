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
}

// ui imports only domain/money (PLAN §2), so dates are plain 'YYYY-MM-DD' strings here.
// The native picker already speaks 'YYYY-MM-DD', our storage format, so no Date object
// (and no timezone shift) ever sits between the user and the stored value.
export function DateInput({ label, value, onChange, min, max, hint, error, id }: DateInputProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  return (
    <Field id={inputId} label={label} hint={hint} error={error}>
      <input
        id={inputId}
        type="date"
        value={value}
        min={min}
        max={max}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
        onChange={(e) => onChange(e.target.value)}
        className={cx(inputClass, 'appearance-none tabular-nums')}
      />
    </Field>
  )
}
