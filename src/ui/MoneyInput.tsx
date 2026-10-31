import { useId, useState, type ReactNode } from 'react'
import { parseAmount, type Cents } from '../domain/money'
import { cx } from './cx'
import { Field, inputClass } from './Field'

interface MoneyInputProps {
  label: ReactNode
  value: Cents | null
  onChange: (cents: Cents | null) => void
  /** Symbol shown inside the field, e.g. '€'. */
  symbol?: string
  decimals?: number
  hint?: ReactNode
  /** An error from the form (e.g. "required"); a parse error takes precedence. */
  error?: ReactNode
  id?: string
}

const toText = (cents: Cents | null, decimals: number) =>
  cents === null ? '' : (cents / 10 ** decimals).toFixed(decimals).replace(/\.0+$/, '')

/**
 * Keeps the raw text the user typed (so "12," doesn't jump to "12") and reports cents
 * through parseAmount, never parseFloat. inputMode=decimal brings up the number pad
 * with a decimal key on iOS and Android, which type=number does not reliably do.
 */
export function MoneyInput({
  label,
  value,
  onChange,
  symbol = '€',
  decimals = 2,
  hint,
  error,
  id,
}: MoneyInputProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  const [text, setText] = useState(() => toText(value, decimals))
  const [touched, setTouched] = useState(false)
  const parsed = text.trim() === '' ? null : parseAmount(text, decimals)
  const parseError = touched && text.trim() !== '' && parsed === null
  const invalid = parseError || Boolean(error)

  return (
    <Field
      id={inputId}
      label={label}
      hint={hint}
      error={parseError ? `Enter an amount like 12${decimals ? '.50' : ''}` : error}
    >
      <div className="relative">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-muted"
        >
          {symbol}
        </span>
        <input
          id={inputId}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          enterKeyHint="done"
          value={text}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
          onChange={(e) => {
            setText(e.target.value)
            const next = e.target.value.trim() === '' ? null : parseAmount(e.target.value, decimals)
            if (next !== null || e.target.value.trim() === '') onChange(next)
          }}
          onBlur={() => setTouched(true)}
          className={cx(inputClass, 'pl-9 text-lg font-medium tabular-nums')}
        />
      </div>
    </Field>
  )
}
