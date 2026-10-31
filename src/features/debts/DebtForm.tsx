import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { parseAmount, type Cents } from '../../domain/money'
import type { Debt } from '../../domain/types'
import { Field, inputClass } from '../../ui/Field'
import { MoneyInput } from '../../ui/MoneyInput'
import { useFormat } from '../bills/format'

export interface DebtValues {
  name: string
  balance: Cents
  aprBps: number
  minPayment: Cents
  dueDay: number
}

export interface DebtFormErrors {
  name?: string
  balance?: string
  apr?: string
  minPayment?: string
}

// Payday loans can legally exceed 100% APR; the backup schema allows up to 1000%.
const MAX_APR_BPS = 100_000

/** "22.99" → 2299 basis points. Same integer parser as money, never parseFloat. */
export const parseApr = (text: string): number | null =>
  text.trim() === '' ? null : parseAmount(text.replace('%', ''), 2)

export const aprText = (bps: number) => (bps / 100).toFixed(2).replace(/\.?0+$/, '')

export function validateDebt(v: {
  name: string
  balance: Cents | null
  aprBps: number | null
  minPayment: Cents | null
}): DebtFormErrors {
  const errors: DebtFormErrors = {}
  if (!v.name.trim()) errors.name = 'Give it a name, like “Visa” or “Car loan”.'
  if (v.balance === null) errors.balance = 'What do you owe today? An estimate is fine.'
  if (v.aprBps === null) errors.apr = 'Enter the yearly rate, like 19.9. Use 0 if there’s none.'
  else if (v.aprBps > MAX_APR_BPS) errors.apr = 'That rate looks too high. Check your statement?'
  if (v.minPayment === null) errors.minPayment = 'What’s the smallest payment they accept?'
  else if (v.minPayment <= 0) errors.minPayment = 'The minimum needs to be more than zero.'
  return errors
}

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1)

interface DebtFormProps {
  id: string
  debt?: Debt
  onSubmit: (values: DebtValues) => void
}

/** Add/edit fields. Save and Delete live in the sheet footer and submit through the id. */
export function DebtForm({ id, debt, onSubmit }: DebtFormProps) {
  const f = useFormat()
  const [name, setName] = useState(debt?.name ?? '')
  const [balance, setBalance] = useState<Cents | null>(debt?.balance ?? null)
  const [apr, setApr] = useState(debt ? aprText(debt.aprBps) : '')
  const [minPayment, setMinPayment] = useState<Cents | null>(debt?.minPayment ?? null)
  const [dueDay, setDueDay] = useState(debt?.dueDay ?? 1)
  const [submitted, setSubmitted] = useState(false)
  const [focusTick, setFocusTick] = useState(0)
  const formRef = useRef<HTMLFormElement>(null)
  useEffect(() => {
    if (focusTick) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [focusTick])
  const nameId = useId()
  const aprId = useId()
  const dayId = useId()

  const aprBps = parseApr(apr)
  const errors = validateDebt({ name, balance, aprBps, minPayment })
  const shown = submitted ? errors : {}

  function submit(e: FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    if (Object.keys(errors).length > 0) {
      setFocusTick((n) => n + 1)
      return
    }
    onSubmit({
      name: name.trim(),
      balance: balance!,
      aprBps: aprBps!,
      minPayment: minPayment!,
      dueDay,
    })
  }

  return (
    <form ref={formRef} id={id} noValidate onSubmit={submit} className="space-y-5 pb-2">
      <Field id={nameId} label="Name" error={shown.name}>
        <input
          id={nameId}
          type="text"
          value={name}
          autoComplete="off"
          enterKeyHint="next"
          placeholder="Visa, student loan, car…"
          aria-invalid={shown.name ? true : undefined}
          aria-describedby={shown.name ? `${nameId}-error` : undefined}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
        />
      </Field>

      <MoneyInput
        label="Balance today"
        value={balance}
        onChange={setBalance}
        symbol={f.symbol}
        decimals={f.decimals}
        error={shown.balance}
      />

      <div className="grid grid-cols-2 gap-3">
        <Field id={aprId} label="Interest (APR)" error={shown.apr}>
          <div className="relative">
            <input
              id={aprId}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={apr}
              placeholder="19.9"
              aria-invalid={shown.apr ? true : undefined}
              aria-describedby={shown.apr ? `${aprId}-error` : undefined}
              onChange={(e) => setApr(e.target.value)}
              className={`${inputClass} pr-9 tabular-nums`}
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-muted"
            >
              %
            </span>
          </div>
        </Field>
        <Field id={dayId} label="Due day">
          <select
            id={dayId}
            value={dueDay}
            onChange={(e) => setDueDay(Number(e.target.value))}
            className={`${inputClass} appearance-none tabular-nums`}
          >
            {DAYS.map((d) => (
              <option key={d} value={d}>
                {f.ordinal(d)}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <MoneyInput
        label="Minimum payment"
        value={minPayment}
        onChange={setMinPayment}
        symbol={f.symbol}
        decimals={f.decimals}
        error={shown.minPayment}
        hint={`Added to Bills on the ${f.ordinal(dueDay)} of each month, so it’s set aside.`}
      />
    </form>
  )
}
