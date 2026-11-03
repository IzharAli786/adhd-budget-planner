import { useMemo } from 'react'
import { Link } from 'react-router'
import { useAppSettings } from '../../app/SettingsProvider'
import { catchUp, type CatchUp } from '../../domain/catchUp'
import { greeting } from '../../domain/greeting'
import { candidates, isSnoozed } from '../../domain/nextAction'
import type { Instant, ISODate } from '../../domain/types'
import { useNow } from '../../lib/useNow'
import { useToday } from '../../lib/useToday'
import { buttonClass } from '../../ui/Button'
import { Icon } from '../../ui/Icon'
import { EmptyState } from '../../ui/PageHeader'
import { useCatchUpSession } from '../catchup/CatchUpProvider'
import { FreshStart } from '../catchup/FreshStart'
import { ActionCard } from './ActionCard'
import { ComingUp } from './ComingUp'
import { GlanceTiles, GoalsInMotion, MoneyOverview } from './Dashboard'
import { useTodayModel, type TodayModel } from './useTodayModel'

/**
 * Today: a hello, then the shape of your money from the top down. What you've saved and
 * still owe, this period's safe to spend beside the two numbers that steer it, what's
 * coming up on the calendar, and the goals you're working on. Logging spending is the
 * floating "Track spending" button, the same on every screen.
 */
export function TodayScreen() {
  const today = useToday()
  // Ticks each minute and on return to the app, so a 24 h "Not now" ends on time.
  const now = useNow()
  const model = useTodayModel(today, now)
  const { ready } = useCatchUpSession()

  return (
    <div>
      <TodayHeader now={now} />
      {!model.loaded || !model.plan || !ready ? (
        <div aria-hidden="true" className="card-hero h-48 animate-pulse" />
      ) : (
        <TodayBody model={model} today={today} now={now} />
      )}
    </div>
  )
}

/** "Good evening, Sam": the page title, following the clock as the app stays open. */
function TodayHeader({ now }: { now: Instant }) {
  const { displayName } = useAppSettings().settings
  return (
    <header className="mb-7 sm:mb-8">
      <h1 className="type-display text-[2rem] leading-[1.1] sm:text-[2.5rem]">
        {greeting(new Date(now).getHours(), displayName)}
      </h1>
      <p className="mt-2 text-body text-muted sm:text-base">Your money at a glance.</p>
    </header>
  )
}

function TodayBody({ model, today, now }: { model: TodayModel; today: ISODate; now: Instant }) {
  const { settings } = useAppSettings()
  const session = useCatchUpSession()
  const { plan, actionState, snoozes } = model

  // Only the data-safety nudge is left on Today; it waits below the lists.
  const backup = useMemo(
    () =>
      actionState
        ? candidates(actionState, today).find(
            (a) => a.kind === 'backup' && !isSnoozed(a.id, snoozes, now),
          )
        : undefined,
    [actionState, snoozes, today, now],
  )

  const gap = useMemo<CatchUp>(
    () =>
      plan?.kind === 'ready' && session.since !== null
        ? catchUp({
            lastOpened: session.since,
            today,
            due: plan.safe.dueEntries,
            periodStart: plan.period.start,
            impulse: model.impulse,
            now,
          })
        : { mode: 'none' },
    [plan, session.since, today, model.impulse, now],
  )

  if (!plan) return null

  if (plan.kind === 'no-income' || plan.kind === 'no-payday') {
    // Only reachable after setup (RequireSetup), e.g. once the pay was deleted, and
    // /setup sends a finished install straight back here, so the step is Calendar > Paydays.
    return (
      <EmptyState
        art="sunrise"
        title={plan.kind === 'no-income' ? 'Let’s find your number' : 'When is your next pay?'}
        action={
          <Link to="/bills?view=paydays" className={buttonClass()}>
            <Icon name="plus" size={18} />
            Add your payday
          </Link>
        }
      >
        {plan.kind === 'no-income'
          ? 'Tell Steady when you get paid, then what’s in your account. That’s all it needs to work out what you can spend.'
          : 'Your pay has no date coming up. Add the next one and your pay period starts from it.'}
      </EmptyState>
    )
  }

  // After a long time away, one calm welcome takes the whole screen first.
  if (gap.mode === 'fresh') {
    return <FreshStart gap={gap} today={today} onDone={session.dismiss} />
  }

  return (
    <div className="space-y-10">
      <div className="space-y-5 sm:space-y-6">
        <MoneyOverview model={model} />
        <GlanceTiles model={model} />
      </div>
      <ComingUp today={today} />
      {/* Goals is a Full-mode section; Simple keeps Today to money and dates. */}
      {!settings.simpleMode && <GoalsInMotion />}
      {backup && <ActionCard action={backup} snoozes={snoozes} />}
    </div>
  )
}
