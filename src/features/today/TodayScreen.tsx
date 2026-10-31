import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useToast } from '../../ui/Toast'
import { useUndoToast } from '../../app/useUndoToast'
import { nextAction } from '../../domain/nextAction'
import type { ISODate } from '../../domain/types'
import { useToday } from '../../lib/useToday'
import { Button, buttonClass } from '../../ui/Button'
import { Icon, type IconName } from '../../ui/Icon'
import { useFormat } from '../bills/format'
import { QuickAddField } from '../quickadd/QuickAddField'
import { useQuickAdd } from '../quickadd/QuickAddProvider'
import { ActionCard } from './ActionCard'
import { CanFitSheet } from './CanFitSheet'
import { CheckInSheet } from './CheckInSheet'
import { MathSheet } from './MathSheet'
import { useTodayModel, type TodayModel } from './useTodayModel'

type Panel = 'math' | 'checkin' | 'fit' | null

// One number, one action (PLAN §1): the hero, the action card and the quick-add field
// are all that sits above the fold. Everything else is one tap away in a sheet.
export function TodayScreen() {
  const today = useToday()
  const model = useTodayModel(today)

  return (
    <div className="space-y-5">
      {/* Every screen needs an h1 for heading navigation; Today's is the hero itself. */}
      <h1 className="sr-only">Today</h1>
      <p aria-hidden="true" className="text-sm font-medium tracking-wide text-muted md:hidden">
        Steady
      </p>
      {!model.loaded || !model.plan ? (
        <div aria-hidden="true" className="h-64 animate-pulse rounded-[1.75rem] bg-surface" />
      ) : (
        <TodayBody model={model} today={today} />
      )}
    </div>
  )
}

function TodayBody({ model, today }: { model: TodayModel; today: ISODate }) {
  const f = useFormat()
  const navigate = useNavigate()
  const toast = useToast()
  const undoToast = useUndoToast()
  const { fieldRef } = useQuickAdd()
  const [panel, setPanel] = useState<Panel>(null)
  const [offerBackup, setOfferBackup] = useState(false)
  const { plan, actionState, snoozes } = model

  const action = useMemo(
    () => actionState && nextAction(actionState, snoozes, today, new Date().toISOString()),
    [actionState, snoozes, today],
  )

  if (!plan) return null

  if (plan.kind === 'no-income' || plan.kind === 'no-payday') {
    // M6 adds /setup; until then the next step lives in Bills > Paydays.
    return (
      <Welcome
        icon="payday"
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
      onClose={() => setPanel(null)}
      today={today}
      due={plan.kind === 'ready' ? plan.safe.dueEntries : plan.due}
      onSaved={(summary) =>
        offerBackup
          ? toast.show({
              message: `${summary}. A good moment for a backup.`,
              duration: 10_000,
              action: { label: 'Back up', onAction: () => navigate('/more/backup') },
            })
          : undoToast(summary)
      }
    />
  )

  if (plan.kind === 'no-balance') {
    return (
      <>
        <Welcome
          icon="payday"
          title="One number to go"
          body={`Payday is ${f.dayLong(plan.period.end)}. What’s in your account right now? Then Steady shows what you can spend each day until then.`}
          cta={
            <Button onClick={() => setPanel('checkin')}>
              <Icon name="plus" size={18} />
              Add your balance
            </Button>
          }
        />
        {checkIn}
      </>
    )
  }

  const { safe, runway, period } = plan
  const short = safe.status === 'short'
  const over = !short && runway.leftToday < 0

  return (
    <>
      <section
        aria-label="Today’s number"
        className="rounded-[1.75rem] bg-surface p-6 shadow-card ring-1 ring-line"
      >
        <p className="text-sm text-muted">
          {short ? 'Before payday' : over ? 'Today' : 'You can spend today'}
        </p>
        <p
          aria-live="polite"
          className="mt-1 text-[clamp(3rem,15vw,4.5rem)] leading-none font-semibold tracking-tight tabular-nums"
        >
          {short
            ? `${f.money(-safe.total)} short`
            : over
              ? `${f.money(-runway.leftToday)} over`
              : f.money(runway.leftToday)}
        </p>
        <p className="mt-4 text-base">
          {short ? (
            // One calm suggestion, no red (PLAN §1.3).
            'Bills before payday are more than your balance. Moving one past payday is often the quickest fix.'
          ) : (
            <>
              <span className="font-medium tabular-nums">{f.money(safe.total)}</span> until payday ·{' '}
              {f.day(period.end)}
            </>
          )}
        </p>
        {over && (
          <p className="mt-1 text-[0.9375rem] text-muted">
            That’s fine. It spreads over the days left.
          </p>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-x-3 text-sm text-muted">
          <span>
            {runway.daysLeft === 1 ? 'Payday tomorrow' : `${runway.daysLeft} days to payday`} ·
            balance from {f.relative(model.checkIn!.date, today)}
          </span>
          <button
            type="button"
            onClick={() => {
              setOfferBackup(false)
              setPanel('checkin')
            }}
            className="-mx-1 min-h-11 rounded-full px-1 font-medium text-accent"
          >
            Update
          </button>
          <button
            type="button"
            onClick={() => setPanel('math')}
            className="-mx-1 ml-auto min-h-11 rounded-full px-1 font-medium text-accent"
          >
            See the math
          </button>
        </div>
      </section>

      {action && (
        <ActionCard
          action={action}
          snoozes={snoozes}
          onCheckIn={(backup) => {
            setOfferBackup(backup)
            setPanel('checkin')
          }}
          onLog={() => fieldRef.current?.focus()}
        />
      )}

      <QuickAddField today={today} transactions={model.transactions} envelopes={model.envelopes} />

      <div className="flex flex-wrap gap-2 pt-1">
        <Button variant="secondary" onClick={() => setPanel('fit')}>
          Can this fit?
        </Button>
        <Link to="/more/transactions" className={buttonClass('ghost')}>
          All entries
        </Link>
      </div>

      <MathSheet
        open={panel === 'math'}
        onClose={() => setPanel(null)}
        safe={safe}
        runway={runway}
        today={today}
      />
      <CanFitSheet
        open={panel === 'fit'}
        onClose={() => setPanel(null)}
        total={safe.total}
        runway={runway}
      />
      {checkIn}
    </>
  )
}

function Welcome({
  icon,
  title,
  body,
  cta,
}: {
  icon: IconName
  title: string
  body: string
  cta: React.ReactNode
}) {
  return (
    <section className="animate-fade-in rounded-[1.75rem] bg-surface px-6 py-10 text-center shadow-card ring-1 ring-line">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft text-accent">
        <Icon name={icon} size={26} />
      </span>
      <h2 className="mt-4 text-xl font-semibold">{title}</h2>
      <p className="mx-auto mt-1 max-w-xs text-[0.9375rem] text-muted">{body}</p>
      <div className="mt-5">{cta}</div>
    </section>
  )
}
