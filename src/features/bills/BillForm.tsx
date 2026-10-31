import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { choiceFromRule, ruleFromChoice, type Repeat, type RepeatChoice } from '../../domain/bills'
import { isValidISODate } from '../../domain/dates'
import type { Bill, Envelope, Id, ISODate } from '../../domain/types'
import { Chip } from '../../ui/Chip'
import { DateInput } from '../../ui/DateInput'
import { Field, inputClass } from '../../ui/Field'
import { MoneyInput } from '../../ui/MoneyInput'
import { Segmented } from '../../ui/Segmented'
import { Switch } from '../../ui/Switch'
import type { BillChanges } from './actions'
import { describeRule, dayNumber } from './describe'
import { useFormat } from './format'

const REPEAT_OPTIONS = [
  { value: 'once', label: 'Once' },
  { value: 'weekly', label: 'Weekly', name: 'Every week' },
  { value: 'biweekly', label: '2 weeks', name: 'Every 2 weeks' },
  { value: 'monthly', label: 'Monthly', name: 'Every month' },
  { value: 'yearly', label: 'Yearly', name: 'Every year' },
] as const satisfies readonly { value: Repeat; label: string; name?: string }[]

export interface BillFormErrors {
  name?: string
  amount?: string
  start?: string
}

export function validateBill(v: {
  name: string
  amount: number | null
  start: ISODate
}): BillFormErrors {
  const errors: BillFormErrors = {}
  if (!v.name.trim()) errors.name = 'Give it a name, like “Rent” or “Phone”.'
  if (v.amount === null) errors.amount = 'How much is it? An estimate is fine.'
  else if (v.amount <= 0) errors.amount = 'The amount needs to be more than zero.'
  if (!isValidISODate(v.start)) errors.start = 'Pick the date it’s due.'
  return errors
}

interface BillFormProps {
  id: string
  /** Absent for a new bill. */
  bill?: Bill
  /** New bills start on this date (a tapped calendar day, or today). */
  defaultDate: ISODate
  today: ISODate
  onSubmit: (changes: BillChanges) => void
  /** Live envelopes to link the bill to; empty while envelopes are off or hidden. */
  envelopes?: readonly Envelope[]
}

/**
 * The add/edit bill fields. Actions (Save, Delete) live in the sheet's footer and submit
 * this form through its id, so the keyboard's Go/Enter key saves too.
 */
export function BillForm({
  id,
  bill,
  defaultDate,
  today,
  onSubmit,
  envelopes = [],
}: BillFormProps) {
  const f = useFormat()
  const initial = bill
    ? choiceFromRule(bill.rule, today)
    : { repeat: 'monthly' as Repeat, start: defaultDate, lastDay: false, exact: true }
  const [name, setName] = useState(bill?.name ?? '')
  const [amount, setAmount] = useState<number | null>(bill?.amount ?? null)
  const [autopay, setAutopay] = useState(bill?.autopay ?? false)
  const [envelopeId, setEnvelopeId] = useState<Id | undefined>(bill?.envelopeId)
  const [choice, setChoice] = useState<RepeatChoice>(initial)
  // Rules the form can't show exactly (from a split or a backup) stay as stored unless
  // the user actually changes the repeat fields.
  const [ruleTouched, setRuleTouched] = useState(!bill)
  const [submitted, setSubmitted] = useState(false)
  const [focusTick, setFocusTick] = useState(0)
  const formRef = useRef<HTMLFormElement>(null)
  useEffect(() => {
    if (focusTick) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [focusTick])
  const nameId = useId()
  const autopayId = useId()

  const errors = validateBill({ name, amount, start: choice.start })
  const shown = submitted ? errors : {}
  const validStart = isValidISODate(choice.start)
  const rule = validStart ? ruleFromChoice(choice) : null
  const summaryRule = ruleTouched || !bill ? rule : bill.rule
  const day = validStart ? dayNumber(choice.start) : 0

  function change(patch: Partial<RepeatChoice>) {
    setChoice((c) => ({ ...c, ...patch }))
    setRuleTouched(true)
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    if (Object.keys(errors).length > 0 || amount === null) {
      // Focus the first broken field (after the errors render) so keyboard and screen
      // reader users land on it.
      setFocusTick((n) => n + 1)
      return
    }
    onSubmit({
      name: name.trim(),
      amount,
      autopay,
      rule: ruleTouched ? ruleFromChoice(choice) : null,
      // Only when the picker was shown, so a hidden envelope link is never cleared.
      ...(envelopes.length > 0 ? { envelopeId } : {}),
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
          placeholder="Rent, phone, Netflix…"
          aria-invalid={shown.name ? true : undefined}
          aria-describedby={shown.name ? `${nameId}-error` : undefined}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
        />
      </Field>

      <MoneyInput
        label="Amount"
        value={amount}
        onChange={setAmount}
        symbol={f.symbol}
        decimals={f.decimals}
        error={shown.amount}
        hint="If it changes month to month, use a typical amount."
      />

      <div className="space-y-1.5">
        {/* Visual label only; the radiogroup carries the same name for screen readers. */}
        <p aria-hidden="true" className="text-sm font-medium">
          Repeats
        </p>
        <Segmented
          label="Repeats"
          value={choice.repeat}
          options={REPEAT_OPTIONS}
          onChange={(repeat) => change({ repeat, lastDay: repeat === 'monthly' && choice.lastDay })}
        />
      </div>

      <DateInput
        label={choice.repeat === 'once' ? 'Due on' : 'First due on'}
        value={choice.start}
        onChange={(start) => change({ start })}
        error={shown.start}
      />

      {choice.repeat === 'monthly' && day >= 28 && (
        <label className="flex min-h-11 items-center gap-3 text-body">
          <input
            type="checkbox"
            checked={choice.lastDay}
            onChange={(e) => change({ lastDay: e.target.checked })}
            className="h-5 w-5 accent-[var(--accent)]"
          />
          Always on the last day of the month
        </label>
      )}

      {summaryRule && (
        <p className="rounded-2xl bg-bg px-4 py-3 text-sm text-muted" aria-live="polite">
          {describeRule(summaryRule, f)}
          {summaryRule.freq === 'monthly' && summaryRule.day !== 'last' && summaryRule.day > 28
            ? ', or the last day in shorter months.'
            : '.'}
        </p>
      )}

      {envelopes.length > 0 && (
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">Comes out of an envelope?</legend>
          <div className="flex flex-wrap gap-2">
            <Chip selected={envelopeId === undefined} onClick={() => setEnvelopeId(undefined)}>
              No
            </Chip>
            {envelopes.map((e) => (
              <Chip key={e.id} selected={envelopeId === e.id} onClick={() => setEnvelopeId(e.id)}>
                {e.name}
              </Chip>
            ))}
          </div>
          <p className="mt-1.5 text-sm text-muted">
            It’s counted once: it uses up that envelope instead of coming off twice.
          </p>
        </fieldset>
      )}

      <div className="flex items-center gap-3">
        <label htmlFor={autopayId} className="min-w-0 flex-1">
          <span className="block text-body font-medium">Paid automatically</span>
          <span className="block text-sm text-muted">
            Autopay and direct debits get ticked off when you update your balance.
          </span>
        </label>
        <Switch id={autopayId} checked={autopay} onChange={setAutopay} label="Paid automatically" />
      </div>
    </form>
  )
}
