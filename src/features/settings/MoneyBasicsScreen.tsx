import { useState } from 'react'
import { useAppSettings } from '../../app/SettingsProvider'
import { isValidISODate } from '../../domain/dates'
import type { Cents, ISODate } from '../../domain/types'
import { useNow } from '../../lib/useNow'
import { useToday } from '../../lib/useToday'
import { Button } from '../../ui/Button'
import { DateInput } from '../../ui/DateInput'
import { MoneyInput } from '../../ui/MoneyInput'
import { PageHeader } from '../../ui/PageHeader'
import { Segmented } from '../../ui/Segmented'
import { Switch } from '../../ui/Switch'
import { useToast } from '../../ui/Toast'
import { useFormat } from '../bills/format'
import { LocalePickers } from '../setup/LocaleLine'
import { useTodayModel, type TodayModel } from '../today/useTodayModel'

const PLAN_BY = [
  { value: 'month', label: 'Calendar month' },
  { value: 'payday', label: 'Payday to payday' },
] as const

/**
 * Money basics (PLAN-v2 §C): the handful of numbers safe to spend is built on, all in one
 * place and all changeable any time. A live line at the top shows the effect of each change.
 */
export function MoneyBasicsScreen() {
  const { loaded } = useAppSettings()
  const today = useToday()
  const now = useNow()
  const model = useTodayModel(today, now)
  // The form's first values come from stored data, so it waits for it.
  if (!loaded || !model.loaded)
    return <div aria-hidden="true" className="h-64 animate-pulse rounded-3xl bg-surface" />
  return <BasicsForm model={model} today={today} />
}

function BasicsForm({ model, today }: { model: TodayModel; today: ISODate }) {
  const { settings, update } = useAppSettings()
  const f = useFormat()
  const toast = useToast()
  const plan = model.plan?.kind === 'ready' ? model.plan : null
  const startDate = settings.startDate ?? plan?.start.date ?? today
  const [balance, setBalance] = useState<Cents | null>(
    settings.startDate ? settings.startingBalance : (plan?.start.balance ?? 0),
  )
  const [date, setDate] = useState(startDate)
  const [buffer, setBuffer] = useState<Cents | null>(settings.buffer)
  const dirty =
    balance !== (settings.startDate ? settings.startingBalance : plan?.start.balance) ||
    date !== startDate ||
    buffer !== settings.buffer

  async function save() {
    if (!isValidISODate(date)) return
    const before = {
      startingBalance: settings.startingBalance,
      startDate: settings.startDate,
      buffer: settings.buffer,
    }
    await update({ startingBalance: balance ?? 0, startDate: date, buffer: buffer ?? 0 })
    // Undo puts back exactly what these fields held (settings are not in the undo log).
    toast.show({
      message: 'Saved your money basics',
      duration: 10_000,
      action: { label: 'Undo', onAction: () => void update(before) },
    })
  }

  return (
    <>
      <PageHeader
        title="Money basics"
        subtitle="What safe to spend is built on. Change any of it, any time."
        back={{ to: '/more/settings', label: 'Settings' }}
      />
      <div className="max-w-2xl space-y-5">
        {plan && (
          <p aria-live="polite" className="card-hero p-5 text-body">
            <span className="text-muted">Safe to spend right now: </span>
            <span className="font-semibold tabular-nums">{f.money(plan.safe.total)}</span>
            <span className="mt-1 block text-sm text-muted">
              Money in {f.money(plan.safe.income + plan.safe.carriedIn)} − bills{' '}
              {f.money(plan.safe.bills)} − spending {f.money(plan.safe.expenses)}
              {plan.safe.buffer > 0 && <> − cushion {f.money(plan.safe.buffer)}</>}
            </span>
          </p>
        )}

        <Card title="Your currency" body="Every amount in the planner shows in this currency.">
          <LocalePickers />
        </Card>

        <Card
          title="Starting balance"
          body="Money you already have before you start tracking. It’s added once, to the first period you track, never again after that."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <MoneyInput
              label="Starting balance"
              value={balance}
              onChange={setBalance}
              symbol={f.symbol}
              decimals={f.decimals}
            />
            <DateInput
              format={f.dayFull}
              label="Tracking starts"
              value={date}
              max={today}
              onChange={setDate}
              error={isValidISODate(date) ? undefined : 'Pick a date'}
            />
          </div>
        </Card>

        <Card
          title="Cushion"
          body="Kept back from safe to spend, for the surprises nobody plans. Zero is fine."
        >
          <MoneyInput
            label="Cushion"
            value={buffer}
            onChange={setBuffer}
            symbol={f.symbol}
            decimals={f.decimals}
          />
        </Card>

        {dirty && (
          <Button block onClick={() => void save()}>
            Save changes
          </Button>
        )}

        <Card
          title="Roll over leftover money"
          body="When a period ends with money unspent, carry it into the next one automatically. Off means every period starts fresh from its own income."
          trailing={
            <Switch
              label="Roll over leftover money"
              checked={settings.rollover}
              onChange={(rollover) => void update({ rollover })}
            />
          }
        />

        <Card
          title="Plan by"
          body="Budget each calendar month, or from one payday to the next. Envelope budgets keep their amounts."
        >
          <Segmented
            label="Plan by"
            value={settings.planBy}
            options={PLAN_BY}
            onChange={(planBy) => void update({ planBy })}
          />
        </Card>

        <p className="px-1 text-sm text-muted">
          Safe to spend = money in − bills − spending. Savings and debt payments are tracked on
          their own and never lower it.
        </p>
      </div>
    </>
  )
}

function Card({
  title,
  body,
  trailing,
  children,
}: {
  title: string
  body: string
  trailing?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <section className="card space-y-4 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-heading">{title}</h2>
          <p className="mt-1 text-body text-muted">{body}</p>
        </div>
        {trailing}
      </div>
      {children}
    </section>
  )
}
