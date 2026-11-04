import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { isValidISODate } from '../../domain/dates'
import type {
  DayOfMonth,
  IncomeSource,
  ISODate,
  PaySchedule,
  WeekendRule,
} from '../../domain/types'
import { DateInput } from '../../ui/DateInput'
import { Button } from '../../ui/Button'
import { Field, FieldError, inputClass } from '../../ui/Field'
import { IconButton } from '../../ui/IconButton'
import { MoneyInput } from '../../ui/MoneyInput'
import { Segmented } from '../../ui/Segmented'
import { Switch } from '../../ui/Switch'
import { describeSchedule } from './describe'
import { useFormat } from './format'

type Kind = PaySchedule['kind']

export const KINDS: { value: Kind; label: string }[] = [
  { value: 'weekly', label: 'Every week' },
  { value: 'biweekly', label: 'Every 2 weeks' },
  { value: 'semimonthly', label: 'Twice a month' },
  { value: 'monthly', label: 'Once a month' },
  { value: 'irregular', label: 'It varies' },
]

const WEEKEND = [
  { value: 'before', label: 'Friday before' },
  { value: 'after', label: 'Monday after' },
  { value: 'none', label: 'Same day' },
] as const satisfies readonly { value: WeekendRule; label: string }[]

export type IncomeInput = Omit<IncomeSource, 'id' | 'active'>

interface Draft {
  name: string
  amount: number | null
  kind: Kind
  anchor: ISODate
  day: DayOfMonth
  days: [number, DayOfMonth]
  expected: ISODate[]
  weekendRule: WeekendRule
  primary: boolean
}

function draftFrom(income: IncomeSource | undefined, today: ISODate): Draft {
  const d: Draft = {
    name: income?.name ?? '',
    amount: income?.amount ?? null,
    kind: income?.schedule.kind ?? 'monthly',
    anchor: today,
    day: 'last',
    days: [15, 'last'],
    expected: [today],
    weekendRule: income?.weekendRule ?? 'before',
    primary: income?.primary ?? false,
  }
  const s = income?.schedule
  if (s?.kind === 'weekly' || s?.kind === 'biweekly') d.anchor = s.anchor
  if (s?.kind === 'monthly') d.day = s.day
  if (s?.kind === 'semimonthly') d.days = s.days
  if (s?.kind === 'irregular') d.expected = s.expected.length ? [...s.expected] : [today]
  return d
}

function scheduleFrom(d: Draft): PaySchedule | null {
  switch (d.kind) {
    case 'weekly':
    case 'biweekly':
      return isValidISODate(d.anchor) ? { kind: d.kind, anchor: d.anchor } : null
    case 'monthly':
      return { kind: 'monthly', day: d.day }
    case 'semimonthly':
      return { kind: 'semimonthly', days: d.days }
    case 'irregular': {
      const expected = [...new Set(d.expected.filter(isValidISODate))].sort()
      return expected.length ? { kind: 'irregular', expected } : null
    }
  }
}

export function validateIncome(d: Pick<Draft, 'name' | 'amount'>, schedule: PaySchedule | null) {
  const errors: { name?: string; amount?: string; schedule?: string } = {}
  if (!d.name.trim()) errors.name = 'Give it a name, like “Salary”.'
  if (d.amount === null) errors.amount = 'Roughly how much lands in your account?'
  else if (d.amount <= 0) errors.amount = 'The amount needs to be more than zero.'
  if (!schedule) errors.schedule = 'Pick at least one payday date.'
  return errors
}

interface IncomeFormProps {
  id: string
  income?: IncomeSource
  /** Offer "use for pay periods" only when there is more than one income. */
  showPrimary: boolean
  today: ISODate
  onSubmit: (input: IncomeInput) => void
}

export function IncomeForm({ id, income, showPrimary, today, onSubmit }: IncomeFormProps) {
  const f = useFormat()
  const [d, setD] = useState(() => draftFrom(income, today))
  const [submitted, setSubmitted] = useState(false)
  const [focusTick, setFocusTick] = useState(0)
  const formRef = useRef<HTMLFormElement>(null)
  useEffect(() => {
    if (focusTick) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [focusTick])
  const nameId = useId()
  const kindId = useId()
  const primaryId = useId()
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }))

  const schedule = scheduleFrom(d)
  const errors = validateIncome(d, schedule)
  const shown = submitted ? errors : {}

  function submit(e: FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    if (Object.keys(errors).length > 0 || !schedule || d.amount === null) {
      setFocusTick((n) => n + 1)
      return
    }
    onSubmit({
      name: d.name.trim(),
      amount: d.amount,
      schedule,
      weekendRule: d.weekendRule,
      primary: d.primary,
    })
  }

  return (
    <form ref={formRef} id={id} noValidate onSubmit={submit} className="space-y-5 pb-2">
      <Field id={nameId} label="Name" error={shown.name}>
        <input
          id={nameId}
          type="text"
          value={d.name}
          autoComplete="off"
          placeholder="Salary, benefits, side job…"
          aria-invalid={shown.name ? true : undefined}
          aria-describedby={shown.name ? `${nameId}-error` : undefined}
          onChange={(e) => set({ name: e.target.value })}
          className={inputClass}
        />
      </Field>

      <MoneyInput
        label="Amount each payday"
        value={d.amount}
        onChange={(amount) => set({ amount })}
        symbol={f.symbol}
        decimals={f.decimals}
        error={shown.amount}
        hint="What actually lands in your account, after tax. Today’s number doesn’t change when you edit this: pay counts once it’s in your account."
      />

      <Field id={kindId} label="How often">
        <select
          id={kindId}
          value={d.kind}
          onChange={(e) => set({ kind: e.target.value as Kind })}
          className={`${inputClass} appearance-none`}
        >
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
      </Field>

      {(d.kind === 'weekly' || d.kind === 'biweekly') && (
        <DateInput
          format={f.dayFull}
          label="One payday"
          value={d.anchor}
          onChange={(anchor) => set({ anchor })}
          hint="Any recent or upcoming payday. Steady counts on from there."
          error={shown.schedule}
        />
      )}

      {d.kind === 'monthly' && (
        <DaySelect label="Paid on" value={d.day} onChange={(day) => set({ day })} />
      )}

      {d.kind === 'semimonthly' && (
        <div className="grid grid-cols-2 gap-3">
          <DaySelect
            label="First payday"
            value={d.days[0]}
            allowLast={false}
            onChange={(v) => set({ days: [v as number, d.days[1]] })}
          />
          <DaySelect
            label="Second payday"
            value={d.days[1]}
            onChange={(v) => set({ days: [d.days[0], v] })}
          />
        </div>
      )}

      {d.kind === 'irregular' && (
        <fieldset className="space-y-3">
          <legend className="mb-1.5 text-sm font-medium">Expected paydays</legend>
          {d.expected.map((date, i) => (
            <div key={i} className="flex items-end gap-2">
              <div className="flex-1">
                <DateInput
                  format={f.dayFull}
                  label={<span className="sr-only">Payday {i + 1}</span>}
                  value={date}
                  onChange={(v) => set({ expected: d.expected.map((x, j) => (j === i ? v : x)) })}
                />
              </div>
              {d.expected.length > 1 && (
                <IconButton
                  icon="close"
                  tone="danger"
                  size="sm"
                  label={`Remove payday ${i + 1}`}
                  onClick={() => set({ expected: d.expected.filter((_, j) => j !== i) })}
                  className="mb-0.5"
                />
              )}
            </div>
          ))}
          {shown.schedule && <FieldError>{shown.schedule}</FieldError>}
          <Button
            variant="text"
            size="sm"
            bleed
            icon="plus"
            onClick={() => set({ expected: [...d.expected, d.expected.at(-1) ?? today] })}
          >
            Add a date
          </Button>
        </fieldset>
      )}

      <div className="space-y-1.5">
        <p aria-hidden="true" className="text-sm font-medium">
          If payday lands on a weekend
        </p>
        <Segmented
          label="If payday lands on a weekend"
          value={d.weekendRule}
          options={WEEKEND}
          onChange={(weekendRule) => set({ weekendRule })}
        />
      </div>

      {schedule && (
        <p className="rounded-2xl bg-bg px-4 py-3 text-sm text-muted" aria-live="polite">
          {describeSchedule(schedule, f)}
          {d.weekendRule !== 'none' && schedule.kind !== 'irregular'
            ? `, or the ${d.weekendRule === 'before' ? 'Friday before' : 'Monday after'} a weekend.`
            : '.'}
        </p>
      )}

      {showPrimary && (
        <div className="flex items-center gap-3">
          <label htmlFor={primaryId} className="min-w-0 flex-1">
            <span className="block text-body font-medium">My main pay</span>
            <span className="block text-sm text-muted">
              Pay periods run from one of these paydays to the next.
            </span>
          </label>
          <Switch
            id={primaryId}
            checked={d.primary}
            onChange={(primary) => set({ primary })}
            label="My main pay"
          />
        </div>
      )}
    </form>
  )
}

export function DaySelect({
  label,
  value,
  onChange,
  allowLast = true,
  error,
}: {
  label: string
  value: DayOfMonth
  onChange: (v: DayOfMonth) => void
  allowLast?: boolean
  error?: string | null
}) {
  const id = useId()
  const f = useFormat()
  return (
    <Field id={id} label={label} error={error}>
      <select
        id={id}
        value={String(value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(e) => onChange(e.target.value === 'last' ? 'last' : Number(e.target.value))}
        className={`${inputClass} appearance-none`}
      >
        {Array.from({ length: allowLast ? 31 : 28 }, (_, i) => i + 1).map((n) => (
          <option key={n} value={n}>
            The {f.ordinal(n)}
          </option>
        ))}
        {allowLast && <option value="last">The last day</option>}
      </select>
    </Field>
  )
}
