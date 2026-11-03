import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useAppSettings } from '../../app/SettingsProvider'
import { useUndoToast } from '../../app/useUndoToast'
import { catchUp, type CatchUp } from '../../domain/catchUp'
import { addDays } from '../../domain/dates'
import { greeting } from '../../domain/greeting'
import { nextAction } from '../../domain/nextAction'
import { primaryIncome } from '../../domain/paySchedule'
import { recordCarryOver } from '../../db/repos'
import type { Cents, Instant, ISODate } from '../../domain/types'
import { useNow } from '../../lib/useNow'
import { useToday } from '../../lib/useToday'
import { BigNumber } from '../../ui/BigNumber'
import { Button, buttonClass } from '../../ui/Button'
import { cx } from '../../ui/cx'
import { Icon } from '../../ui/Icon'
import { EmptyState } from '../../ui/PageHeader'
import { BackupMomentSheet } from '../backup/BackupMomentSheet'
import { useFormat } from '../bills/format'
import { CatchUpCard } from '../catchup/CatchUpCard'
import { useCatchUpSession } from '../catchup/CatchUpProvider'
import { FreshStart } from '../catchup/FreshStart'
import { GardenGlance } from '../goals/GardenCard'
import { PaydayNote } from '../notes/PaydayNote'
import { QuickAddField } from '../quickadd/QuickAddField'
import { useQuickAdd } from '../quickadd/QuickAddProvider'
import { ActionCard } from './ActionCard'
import { CanFitSheet } from './CanFitSheet'
import { CheckInSheet } from './CheckInSheet'
import { ComingUp } from './ComingUp'
import { BudgetGlance, GlanceTiles, GoalsInMotion, MoneyOverview, monthName } from './Dashboard'
import { MathSheet } from './MathSheet'
import { useTodayModel, type TodayModel } from './useTodayModel'

type Panel = 'math' | 'checkin' | 'fit' | 'backup' | null

// One number, one action (PLAN §1): the hero, the action card and the quick-add field
// are all that sits above the fold. Everything else is one tap away in a sheet.
export function TodayScreen() {
  const today = useToday()
  // Ticks each minute and on return to the app, so a 24 h "Not now" ends on time.
  const now = useNow()
  const model = useTodayModel(today, now)
  const { ready } = useCatchUpSession()

  return (
    <div className="space-y-5">
      {/* Every screen needs an h1 for heading navigation; Today's is the hero itself. */}
      <h1 className="sr-only">Today</h1>
      <div className="-my-2 flex items-center justify-between gap-3">
        <Greeting now={now} />
        <JustTodayToggle />
      </div>
      {!model.loaded || !model.plan || !ready ? (
        <div aria-hidden="true" className="h-64 animate-pulse rounded-3xl bg-surface" />
      ) : (
        <TodayBody model={model} today={today} now={now} />
      )}
    </div>
  )
}

/** "Good morning, Sam": a quiet hello, following the clock as the app stays open. */
function Greeting({ now }: { now: Instant }) {
  const { displayName } = useAppSettings().settings
  return (
    <p className="min-w-0 truncate text-sm font-medium text-muted">
      {greeting(new Date(now).getHours(), displayName)}
    </p>
  )
}

/**
 * "Just today" (PLAN §5): a low-energy variant of this screen, not a separate mode. The
 * number and one card, nothing else to read or decide.
 */
function JustTodayToggle() {
  const { settings, update } = useAppSettings()
  const on = settings.justToday
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => void update({ justToday: !on })}
      className={cx(
        'inline-flex min-h-11 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition-colors',
        on ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-accent-soft/60',
      )}
    >
      <Icon name={on ? 'check' : 'leaf'} size={16} />
      Just today
    </button>
  )
}

function TodayBody({ model, today, now }: { model: TodayModel; today: ISODate; now: Instant }) {
  const f = useFormat()
  const { settings } = useAppSettings()
  const lite = settings.justToday
  const undoToast = useUndoToast()
  const { fieldRef, openSheet } = useQuickAdd()
  const session = useCatchUpSession()
  const [panel, setPanel] = useState<Panel>(null)
  const [offerBackup, setOfferBackup] = useState(false)
  const [carried, setCarried] = useState<Cents | null>(null)
  const { plan, actionState, snoozes } = model

  const action = useMemo(
    () => actionState && nextAction(actionState, snoozes, today, now),
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
    // /setup sends a finished install straight back here, so the step is Bills > Paydays.
    return (
      <Welcome
        title={plan.kind === 'no-income' ? 'Let’s find your number' : 'When is your next pay?'}
        body={
          plan.kind === 'no-income'
            ? 'Tell Steady when you get paid, then what’s in your account. That’s all it needs to work out what you can spend each day.'
            : 'Your pay has no date coming up. Add the next one and today’s number counts down to it.'
        }
        cta={
          <Link to="/bills?view=paydays" className={buttonClass()}>
            <Icon name="plus" size={18} />
            Add your payday
          </Link>
        }
      />
    )
  }

  const checkIn = (
    <CheckInSheet
      open={panel === 'checkin'}
      // Saving closes the sheet AFTER onSaved, which may have moved on to the backup moment.
      onClose={() => setPanel((p) => (p === 'checkin' ? null : p))}
      today={today}
      due={plan.safe.dueEntries}
      onSaved={(summary) => {
        undoToast(summary)
        if (offerBackup) {
          setCarried(null)
          setPanel('backup')
          // Bookkeeping only: if it fails, the sheet simply shows no carry-over line.
          void recordCarryOver(today)
            .then((c) => setCarried(c?.amount ?? null))
            .catch(() => {})
        }
      }}
    />
  )

  if (gap.mode === 'fresh') {
    return <FreshStart gap={gap} today={today} onDone={session.dismiss} />
  }

  const { safe, runway, period } = plan
  const pay = primaryIncome(model.incomes)
  const nextPay =
    pay && model.actionState?.nextPayday
      ? { date: model.actionState.nextPayday, amount: pay.amount }
      : undefined
  const month = settings.planBy === 'month'
  const periodName = month ? monthName(f, period.start) : 'this pay period'
  const endsOn = f.day(addDays(period.end, -1))
  const short = safe.status === 'short'
  const over = !short && runway.leftToday < 0
  const heroAmount = f.money(short ? -safe.total : over ? -runway.leftToday : runway.leftToday)
  const heroSuffix = short ? 'short' : over ? 'over' : null

  return (
    <>
      <div
        className={cx(
          // "Just today" has no side column, so it keeps the calm reading width.
          lite
            ? 'lg:max-w-2xl'
            : 'lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-x-8',
        )}
      >
        <div className="space-y-5">
          <section aria-label="Today’s number" className="card-hero @container p-6 sm:p-7">
            <p className="text-body text-muted">
              {short ? `Short for ${periodName}` : over ? 'Today' : 'You can spend today'}
            </p>
            {/* "short" / "over" are words, not part of the number: smaller and calmer. */}
            <BigNumber text={heroAmount} suffix={heroSuffix} className="mt-2" />
            <p className="mt-5 text-base">
              {short ? (
                // One calm suggestion, no red (PLAN §1.3).
                `Bills and spending are more than the money in for ${periodName}. Moving one bill to next ${month ? 'month' : 'period'} is often the quickest fix.`
              ) : (
                <>
                  <span className="font-medium tabular-nums">{f.money(safe.total)}</span> safe to
                  spend in {periodName} · until {endsOn}
                </>
              )}
            </p>
            {over && (
              <p className="mt-1 text-body text-muted">
                That’s fine. It spreads over the days left.
              </p>
            )}
            {!lite && (
              <div className="mt-5 flex flex-wrap items-center gap-x-3 border-t border-line pt-3 text-caption text-muted">
                <span>
                  {runway.daysLeft === 1 ? 'Last day' : `${runway.daysLeft} days left`} ·{' '}
                  {f.money(safe.income + safe.carriedIn)} in − {f.money(safe.bills)} bills −{' '}
                  {f.money(safe.expenses)} spent
                </span>
                <Link
                  to="/more/basics"
                  className="-mx-1 inline-flex min-h-11 shrink-0 items-center rounded-full px-1 font-medium whitespace-nowrap text-accent"
                >
                  Money basics
                </Link>
                <button
                  type="button"
                  onClick={() => setPanel('math')}
                  // Never "See the / math" across two lines: it moves down whole instead.
                  className="-mx-1 ml-auto min-h-11 shrink-0 rounded-full px-1 font-medium whitespace-nowrap text-accent"
                >
                  See the math
                </button>
              </div>
            )}
          </section>

          {gap.mode === 'short' && !lite && <CatchUpCard gap={gap} onDismiss={session.dismiss} />}

          {action && (
            <ActionCard
              action={action}
              snoozes={snoozes}
              onCheckIn={(backup) => {
                setOfferBackup(backup)
                setPanel('checkin')
              }}
              onLog={() => (fieldRef.current ? fieldRef.current.focus() : openSheet())}
            />
          )}

          {!lite && (
            <>
              <QuickAddField
                today={today}
                transactions={model.transactions}
                envelopes={model.envelopes}
              />

              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => setPanel('fit')}>
                  Can this fit?
                </Button>
                <Link to="/more/transactions" className={buttonClass('ghost')}>
                  All entries
                </Link>
              </div>

              <MoneyOverview model={model} />
              <GlanceTiles model={model} />
              <ComingUp today={today} />
              {!settings.simpleMode && <GoalsInMotion />}
              {!settings.simpleMode && <BudgetGlance model={model} />}
            </>
          )}
        </div>

        {/* Glances: below the fold on phones, a quiet side column on wide screens. */}
        {!lite && (
          <aside aria-label="At a glance" className="mt-8 space-y-6 lg:sticky lg:top-10 lg:mt-0">
            {/* Full mode only: Simple stays one number and the next step (PLAN §5). */}
            {!settings.simpleMode && <PaydayNote periodStart={period.start} />}
            {/* Only where the garden lives (Goals is a Full-mode tab). */}
            {!settings.simpleMode && <GardenGlance />}
          </aside>
        )}
      </div>

      <MathSheet
        open={panel === 'math'}
        onClose={() => setPanel(null)}
        safe={safe}
        runway={runway}
        today={today}
        nextPay={nextPay}
      />
      <CanFitSheet
        open={panel === 'fit'}
        onClose={() => setPanel(null)}
        total={safe.total}
        runway={runway}
        // Simple mode hides envelopes (PLAN §5); they still count in "Set aside".
        envelopes={settings.envelopesEnabled && !settings.simpleMode ? safe.envelopes : []}
      />
      {checkIn}
      <BackupMomentSheet
        open={panel === 'backup'}
        onClose={() => setPanel(null)}
        carried={carried}
      />
    </>
  )
}

function Welcome({ title, body, cta }: { title: string; body: string; cta: React.ReactNode }) {
  return (
    <EmptyState art="sunrise" title={title} action={cta}>
      {body}
    </EmptyState>
  )
}
