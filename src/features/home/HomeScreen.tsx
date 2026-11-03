import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useAppSettings } from '../../app/SettingsProvider'
import { addDays } from '../../domain/dates'
import { moneyFor, periodAt } from '../../domain/today'
import type { ISODate } from '../../domain/types'
import { useNow } from '../../lib/useNow'
import { useToday } from '../../lib/useToday'
import { buttonClass } from '../../ui/Button'
import { Icon } from '../../ui/Icon'
import { EmptyState, PageHeader } from '../../ui/PageHeader'
import { useFormat, type Formatters } from '../bills/format'
import { PaydayNote } from '../notes/PaydayNote'
import { BudgetChart } from '../plan/BudgetChart'
import { IncomeVsSpending, LeftToSpendBar, SpendingDonut } from '../plan/MoneyShape'
import { MathSheet } from '../today/MathSheet'
import { useTodayModel } from '../today/useTodayModel'

const navButton =
  'inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-accent hover:bg-accent-soft/60'

/** "November" from "November 2026", for the chart titles. */
const monthName = (f: Formatters, date: ISODate) =>
  f
    .month(date)
    .replace(/\s*\d{4}\s*/, ' ')
    .trim()

/** A section title over its card, the same on every Home block. */
const sectionTitle = 'px-1 type-display text-[1.375rem] leading-tight'

// Home (Full mode): pick any month (or pay period) and see its whole picture as charts.
// The same engine as Today's hero, so the current period here can never disagree with it.
export function HomeScreen() {
  const today = useToday()
  const now = useNow()
  const model = useTodayModel(today, now)
  const { settings } = useAppSettings()
  const f = useFormat()
  // The period being looked at, by any date inside it; null is the current one.
  const [at, setAt] = useState<ISODate | null>(null)
  const [math, setMath] = useState(false)
  const input = model.input
  const span = useMemo(() => (input ? periodAt(input, at ?? today) : null), [input, at, today])
  const money = useMemo(() => (input && span ? moneyFor(input, span) : null), [input, span])
  const current = at === null || (span !== null && today >= span.start && today < span.end)
  const past = span !== null && span.end <= today
  const month = settings.planBy === 'month'
  const name = span
    ? month
      ? f.month(span.start)
      : `${f.day(span.start)} – ${f.day(addDays(span.end, -1))}`
    : ''
  const short = span ? (month ? monthName(f, span.start) : name) : ''

  return (
    <>
      <PageHeader
        title="Home"
        subtitle={
          month
            ? 'One month at a time: what came in, where it went, and what’s left.'
            : 'One pay period at a time: what came in, where it went, and what’s left.'
        }
      />
      {!model.loaded || !model.plan || !input ? (
        <div aria-hidden="true" className="h-64 animate-pulse rounded-3xl bg-surface" />
      ) : !span || !money ? (
        <EmptyState
          art="sunrise"
          title="Add your payday first"
          action={
            <Link to="/bills?view=paydays" className={buttonClass()}>
              Add your payday
            </Link>
          }
        >
          Planning by pay period needs a payday. Or switch to calendar months in Money basics.
        </EmptyState>
      ) : (
        <div className="space-y-10">
          <nav
            aria-label={month ? 'Months' : 'Pay periods'}
            className="card-quiet -mt-2 flex items-center gap-2 p-1.5"
          >
            <button
              type="button"
              className={navButton}
              aria-label={month ? 'Previous month' : 'Previous pay period'}
              onClick={() => setAt(addDays(span.start, -1))}
            >
              <Icon name="back" size={20} />
            </button>
            <p
              className="min-w-0 flex-1 text-center type-display text-heading sm:text-[1.375rem]"
              aria-live="polite"
            >
              {name}
            </p>
            <button
              type="button"
              className={navButton}
              aria-label={month ? 'Next month' : 'Next pay period'}
              onClick={() => setAt(span.end)}
            >
              <Icon name="chevron" size={20} />
            </button>
            {!current && (
              <button
                type="button"
                onClick={() => setAt(null)}
                className="min-h-11 shrink-0 rounded-full px-3 text-sm font-medium whitespace-nowrap text-accent hover:bg-accent-soft/60"
              >
                {month ? 'This month' : 'Now'}
              </button>
            )}
          </nav>

          <Block id="ivs-title" title="Income vs spending">
            <div className="card p-5 sm:p-7">
              <IncomeVsSpending safe={money} f={f} />
            </div>
          </Block>

          {settings.envelopesEnabled && (
            <Block id="bva-title" title={`Budget vs actuals — ${short}`}>
              <div className="card px-4 py-6 sm:p-8">
                {money.envelopes.some((e) => e.budget > 0 || e.spent + e.linkedDue > 0) ? (
                  <BudgetChart rows={money.envelopes} f={f} label={`Budget vs actuals, ${name}`} />
                ) : (
                  <div className="space-y-3">
                    <p className="text-body text-muted">
                      Give an envelope a budget and add spending to it; planned and actual show up
                      here side by side.
                    </p>
                    <Link to="/envelopes" className={buttonClass('secondary')}>
                      Open envelopes
                    </Link>
                  </div>
                )}
              </div>
            </Block>
          )}

          <div className="space-y-10 lg:grid lg:grid-cols-2 lg:items-start lg:gap-8 lg:space-y-0">
            <Block id="dist-title" title="Spending distribution">
              <div className="card p-5 sm:p-7">
                <SpendingDonut safe={money} f={f} />
              </div>
            </Block>
            <Block id="left-title" title="Left to spend">
              <div className="card p-5 sm:p-7">
                <LeftToSpendBar safe={money} f={f} past={past} onSeeMath={() => setMath(true)} />
              </div>
            </Block>
          </div>

          {/* Keyed by period: a half-typed note never follows you to another month. */}
          <PaydayNote key={span.start} periodStart={span.start} />

          <MathSheet open={math} onClose={() => setMath(false)} safe={money} today={today} />
        </div>
      )}
    </>
  )
}

function Block({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-4">
      <h2 id={id} className={sectionTitle}>
        {title}
      </h2>
      {children}
    </section>
  )
}
