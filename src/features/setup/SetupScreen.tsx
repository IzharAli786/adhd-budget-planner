import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { useAppSettings } from '../../app/SettingsProvider'
import {
  completeSetup,
  getMeta,
  getSetupProgress,
  saveSetupProgress,
  setupComplete,
  updateSettings,
} from '../../db/repos'
import { addDays, isValidISODate } from '../../domain/dates'
import { rescaleCents } from '../../domain/money'
import {
  MAX_PAYDAY_AHEAD,
  paydaySuggestions,
  previousStep,
  resumeStep,
  SETUP_STEPS,
  stepNumber,
  suggestOtherDay,
  validateNextPayday,
  validateOtherDay,
  validatePayKind,
  type PayKind,
  type SetupProgress,
  type SetupStep,
} from '../../domain/setup'
import type { Cents, DayOfMonth } from '../../domain/types'
import { detectLocaleDefaults } from '../../lib/locale'
import { useToday } from '../../lib/useToday'
import { Button } from '../../ui/Button'
import { Chip } from '../../ui/Chip'
import { cx } from '../../ui/cx'
import { DateInput } from '../../ui/DateInput'
import { Icon } from '../../ui/Icon'
import { MoneyInput } from '../../ui/MoneyInput'
import { Switch } from '../../ui/Switch'
import { DaySelect, KINDS } from '../bills/IncomeForm'
import { useFormat } from '../bills/format'
import { LocaleLine } from './LocaleLine'
import { StartFromFile } from './StartFromFile'

/**
 * First run (PLAN §5): three questions and a number, in well under a minute. Each step
 * saves before moving on, so closing the app mid-way resumes on the same question.
 */
export function SetupScreen() {
  const progress = useLiveQuery(async () => (await getSetupProgress()) ?? null)
  const complete = useLiveQuery(setupComplete)
  if (progress === undefined || complete === undefined) return null
  if (complete) return <Navigate to="/" replace />
  return <SetupFlow progress={progress ?? undefined} />
}

function SetupFlow({ progress }: { progress: SetupProgress | undefined }) {
  const today = useToday()
  const step = resumeStep(progress, today)
  const back = previousStep(step)
  const goBack = back ? () => void saveSetupProgress({ step: back }) : undefined

  // Remounting per step resets each step's draft from the saved answers.
  switch (step) {
    case 'ack':
      return <AckStep key={step} />
    case 'payday':
      return <PaydayStep key={step} progress={progress} />
    case 'pay':
      return <PayStep key={step} progress={progress} onBack={goBack} />
    case 'balance':
      return <BalanceStep key={step} onBack={goBack} />
    case 'done':
      return null // SetupScreen has already redirected
  }
}

// ---------------------------------------------------------------------------------------

function StepFrame({
  step,
  title,
  lead,
  onBack,
  onSubmit,
  busy,
  action,
  children,
  footer,
}: {
  step: SetupStep
  title: string
  lead?: ReactNode
  onBack?: () => void
  onSubmit: () => void | Promise<void>
  busy?: boolean
  action: string
  children?: ReactNode
  footer?: ReactNode
}) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const n = stepNumber(step)
  // A new step is a new "page": move focus to its title so screen readers announce it,
  // unless a field already took focus (autoFocus) so the keyboard is up straight away.
  useEffect(() => {
    if (document.activeElement === document.body) headingRef.current?.focus()
  }, [])

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!busy) void onSubmit()
  }

  return (
    <div className="flex min-h-dvh flex-col px-5 pt-[max(env(safe-area-inset-top),1rem)] pb-[max(env(safe-area-inset-bottom),1.5rem)]">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
        <div className="flex min-h-14 items-center justify-between">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="-ml-3 inline-flex min-h-11 items-center gap-1 rounded-full pr-3 pl-1.5 text-[0.9375rem] font-medium text-accent hover:bg-accent-soft/60"
            >
              <Icon name="back" size={20} />
              Back
            </button>
          ) : (
            <span />
          )}
          <ol aria-label={`Step ${n} of ${SETUP_STEPS.length}`} className="flex gap-2">
            {SETUP_STEPS.map((s, i) => (
              <li
                key={s}
                aria-hidden="true"
                className={cx(
                  'h-2 rounded-full transition-[width,background-color] duration-300',
                  i + 1 === n ? 'w-6 bg-accent' : i + 1 < n ? 'w-2 bg-accent' : 'w-2 bg-line',
                )}
              />
            ))}
          </ol>
        </div>

        <form
          noValidate
          onSubmit={submit}
          className="animate-fade-in flex flex-1 flex-col pt-6 md:pt-12"
        >
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="text-[2rem] leading-tight font-semibold tracking-tight outline-none md:text-[2.5rem]"
          >
            {title}
          </h1>
          {lead && <div className="mt-2 text-base text-muted">{lead}</div>}
          <div className="mt-8 space-y-5">{children}</div>
          <div className="mt-auto pt-10">
            <Button type="submit" size="lg" block disabled={busy}>
              {action}
            </Button>
            {footer && <div className="mt-4 flex justify-center">{footer}</div>}
          </div>
        </form>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------------------

function AckStep() {
  const [busy, setBusy] = useState(false)
  async function next() {
    setBusy(true)
    try {
      // A fresh install has no settings row yet: fill it from the device. A settings
      // row (from an earlier visit or a restore) is the person's choice and stays.
      if ((await getMeta('settings')) === undefined) await updateSettings(detectLocaleDefaults())
      await saveSetupProgress({ step: 'payday', ackAt: new Date().toISOString() })
    } finally {
      setBusy(false)
    }
  }
  return (
    <StepFrame
      step="ack"
      title="Before we start"
      lead="Three quick questions, then you’ll see what you can spend today."
      onSubmit={next}
      busy={busy}
      action="I understand"
    >
      <ul className="space-y-4 rounded-3xl bg-surface p-6 shadow-card ring-1 ring-line">
        <Point icon="info">
          Steady gives <strong className="font-semibold">estimates</strong> from the numbers you
          enter. It’s not financial advice.
        </Point>
        <Point icon="shield">It can’t see your bank. Everything stays on this device.</Point>
        <Point icon="refresh">You can change any answer later.</Point>
      </ul>
    </StepFrame>
  )
}

function Point({ icon, children }: { icon: 'info' | 'shield' | 'refresh'; children: ReactNode }) {
  return (
    <li className="flex gap-3 text-[0.9375rem]">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
        <Icon name={icon} size={18} />
      </span>
      <span className="pt-1.5">{children}</span>
    </li>
  )
}

// ---------------------------------------------------------------------------------------

function PaydayStep({ progress }: { progress: SetupProgress | undefined }) {
  const today = useToday()
  const f = useFormat()
  const [date, setDate] = useState(progress?.nextPayday ?? '')
  const [error, setError] = useState<string | null>(null)
  const suggestions = paydaySuggestions(today)

  async function next() {
    const problem = validateNextPayday(date, today)
    setError(problem)
    if (problem) return
    await saveSetupProgress({
      step: 'pay',
      nextPayday: date,
      // A twice-a-month "other payday" was picked relative to the old date; re-guess it.
      ...(date !== progress?.nextPayday ? { otherDay: undefined } : {}),
    })
  }

  return (
    <StepFrame
      step="payday"
      title="When do you next get paid?"
      lead="The day the money lands in your account."
      onSubmit={next}
      action="Continue"
      footer={<StartFromFile ackAt={progress?.ackAt} />}
    >
      <div role="group" aria-label="Common paydays" className="flex flex-wrap gap-2">
        {suggestions.map((d) => (
          <Chip
            key={d}
            selected={d === date}
            onClick={() => {
              setDate(d)
              setError(null)
            }}
          >
            <span className="tabular-nums">{f.day(d)}</span>
          </Chip>
        ))}
      </div>
      <DateInput
        label="Or pick the date"
        value={date}
        min={today}
        max={addDays(today, MAX_PAYDAY_AHEAD)}
        onChange={(d) => {
          setDate(d)
          setError(null)
        }}
        hint={
          isValidISODate(date) && !error
            ? `${f.dayLong(date)}, ${f.relative(date, today)}.`
            : undefined
        }
        error={error}
      />
    </StepFrame>
  )
}

// ---------------------------------------------------------------------------------------

function PayStep({
  progress,
  onBack,
}: {
  progress: SetupProgress | undefined
  onBack?: () => void
}) {
  const f = useFormat()
  const today = useToday()
  const nextPayday = progress?.nextPayday ?? ''
  const [kind, setKind] = useState<PayKind>(progress?.kind ?? 'monthly')
  const [otherDay, setOtherDay] = useState<DayOfMonth>(
    progress?.otherDay ?? suggestOtherDay(nextPayday, today),
  )
  const [amount, setAmount] = useState<Cents | null>(progress?.amount ?? null)
  const [error, setError] = useState<string | null>(null)
  const [kindError, setKindError] = useState<string | null>(null)
  const groupId = useId()

  // Switching currency on the locale line keeps the number as typed: "2500" stays 2500
  // in yen, instead of the stored cents silently meaning 250000 (state adjusted during
  // render, React's pattern for state derived from a changing input).
  const [amountDecimals, setAmountDecimals] = useState(f.decimals)
  if (amountDecimals !== f.decimals) {
    setAmountDecimals(f.decimals)
    if (amount !== null) setAmount(rescaleCents(amount, amountDecimals, f.decimals))
  }

  async function next() {
    const scheduleProblem =
      (kind === 'semimonthly' ? validateOtherDay(nextPayday, otherDay) : null) ??
      validatePayKind(kind, nextPayday, today, kind === 'semimonthly' ? otherDay : undefined)
    setKindError(scheduleProblem)
    const amountProblem =
      amount === null || amount <= 0
        ? 'Roughly how much lands in your account? A round number is fine.'
        : null
    setError(amountProblem)
    if (scheduleProblem || amountProblem || amount === null) return
    await saveSetupProgress({
      step: 'balance',
      kind,
      amount,
      ...(kind === 'semimonthly' ? { otherDay } : {}),
    })
  }

  return (
    <StepFrame
      step="pay"
      title="How often, and how much?"
      lead={`Your next pay is ${f.dayLong(nextPayday)}.`}
      onBack={onBack}
      onSubmit={next}
      action="Continue"
    >
      <fieldset>
        <legend id={groupId} className="mb-2 text-sm font-medium">
          I get paid
        </legend>
        <div className="overflow-hidden rounded-3xl bg-surface shadow-card ring-1 ring-line">
          {KINDS.map((k) => (
            <label
              key={k.value}
              className="flex min-h-13 cursor-pointer items-center gap-3 border-b border-line px-5 last:border-b-0 has-[:checked]:bg-accent-soft/50"
            >
              <input
                type="radio"
                name={groupId}
                value={k.value}
                checked={kind === k.value}
                onChange={() => {
                  setKind(k.value)
                  setKindError(null)
                }}
                className="h-5 w-5 accent-accent"
              />
              <span className="text-[0.9375rem] font-medium">{k.label}</span>
            </label>
          ))}
        </div>
        {kindError && kind !== 'semimonthly' && (
          <p role="alert" className="mt-2 text-sm font-medium text-accent">
            {kindError}
          </p>
        )}
      </fieldset>

      {kind === 'semimonthly' && (
        <DaySelect
          label="My other payday"
          value={otherDay}
          onChange={(d) => {
            setOtherDay(d)
            setKindError(null)
          }}
          error={kindError}
        />
      )}

      {/* Keyed on decimals: switching EUR to JPY changes what the typed digits mean. */}
      <MoneyInput
        key={f.decimals}
        label={kind === 'irregular' ? 'Roughly how much each time?' : 'How much lands each time?'}
        value={amount}
        onChange={(v) => {
          setAmount(v)
          setError(null)
        }}
        symbol={f.symbol}
        decimals={f.decimals}
        hint="After tax, as it arrives in your account."
        error={error}
      />
      <LocaleLine />
    </StepFrame>
  )
}

// ---------------------------------------------------------------------------------------

function BalanceStep({ onBack }: { onBack?: () => void }) {
  const today = useToday()
  const f = useFormat()
  const navigate = useNavigate()
  const { settings } = useAppSettings()
  const [amount, setAmount] = useState<Cents | null>(null)
  const [overdrawn, setOverdrawn] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const switchId = useId()

  async function finish() {
    if (amount === null) {
      setError('What does your banking app say right now? A rough number is fine.')
      return
    }
    setBusy(true)
    try {
      // Overdrawn by 0 is still 0, not -0.
      await completeSetup(overdrawn && amount > 0 ? -amount : amount, today)
      navigate('/', { replace: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <StepFrame
      step="balance"
      title="What’s in your account right now?"
      lead="The account you spend from. You can update it any time."
      onBack={onBack}
      onSubmit={finish}
      busy={busy}
      action="Show my number"
    >
      <MoneyInput
        key={settings.decimals}
        label="Balance today"
        value={amount}
        onChange={(v) => {
          setAmount(v)
          setError(null)
        }}
        symbol={f.symbol}
        decimals={f.decimals}
        error={error}
      />
      <div className="flex items-center gap-3">
        <label htmlFor={switchId} className="min-w-0 flex-1">
          <span className="block text-[0.9375rem] font-medium">I’m overdrawn</span>
          <span className="block text-sm text-muted">The balance is below zero.</span>
        </label>
        <Switch id={switchId} checked={overdrawn} onChange={setOverdrawn} label="I’m overdrawn" />
      </div>
    </StepFrame>
  )
}
