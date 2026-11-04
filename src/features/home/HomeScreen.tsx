import { useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useAppSettings } from '../../app/SettingsProvider'
import { addDays } from '../../domain/dates'
import { moneyFor } from '../../domain/today'
import type { ISODate } from '../../domain/types'
import { useNow } from '../../lib/useNow'
import { useToday } from '../../lib/useToday'
import { Button, buttonClass } from '../../ui/Button'
import { cx } from '../../ui/cx'
import { IconButton } from '../../ui/IconButton'
import { EmptyState, PageHeader } from '../../ui/PageHeader'
import { useFormat } from '../bills/format'
import { PaydayNote } from '../notes/PaydayNote'
import { BudgetChart } from '../plan/BudgetChart'
import { IncomeVsSpending, LeftToSpendBar, SpendingDonut } from '../plan/MoneyShape'
import { MathSheet } from '../today/MathSheet'
import { useTodayModel } from '../today/useTodayModel'
import { periodNav } from './periodNav'

// Home (Full mode): pick any month (or pay period) and see its whole picture as charts.
// The same engine as Today's hero, so the current period here can never disagree with it.
// The blocks lay out by the width of Home's own column (an @container), not the window's:
// between 640 and 768px the column is still phone-narrow.
export function HomeScreen() {
  const today = useToday()
  const now = useNow()
  const model = useTodayModel(today, now)
  const { settings } = useAppSettings()
  const f = useFormat()
  // The period being looked at, by any date inside it; null is the current one.
  const [at, setAt] = useState<ISODate | null>(null)
  const [math, setMath] = useState(false)
  const labelRef = useRef<HTMLParagraphElement>(null)
  const input = model.input
  const nav = useMemo(
    () => (input ? periodNav(input, at ?? today, today) : null),
    [input, at, today],
  )
  const span = nav?.span ?? null
  const money = useMemo(() => (input && span ? moneyFor(input, span) : null), [input, span])
  const current = span !== null && today >= span.start && today < span.end
  const past = span !== null && span.end <= today
  const month = settings.planBy === 'month'
  const unit = month ? 'month' : 'pay period'
  // A pay period's two dates each stay whole: on a phone it breaks after the dash.
  const dates = span && !month ? [f.day(span.start), f.day(addDays(span.end, -1))] : null
  const name = !span ? 'No pay period here' : dates ? dates.join(' – ') : f.month(span.start)
  const short = span ? (month ? f.monthName(span.start) : name) : ''

  function backToNow() {
    setAt(null)
    // The button hides once it has done its job, so focus goes to what it changed.
    labelRef.current?.focus()
  }

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
      {!model.loaded || !input || !nav ? (
        <div aria-hidden="true" className="h-64 animate-pulse rounded-3xl bg-surface" />
      ) : !span && at === null ? (
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
        <div className="@container space-y-10">
          {/* Three columns, the outer two equal, so the title sits in the true centre. */}
          <nav
            aria-label={month ? 'Months' : 'Pay periods'}
            className="card-quiet -mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-1 p-1.5"
          >
            {/* aria-disabled, not disabled: an arrow that runs out while focused keeps the focus. */}
            <IconButton
              icon="back"
              label={month ? 'Previous month' : 'Previous pay period'}
              aria-disabled={!nav.prev}
              onClick={() => nav.prev && setAt(nav.prev.start)}
              className="justify-self-start"
            />
            <p
              ref={labelRef}
              tabIndex={-1}
              className="min-w-0 rounded-full text-center type-display text-heading @xl:text-[1.375rem]"
              aria-live="polite"
            >
              {dates ? (
                <>
                  <span className="whitespace-nowrap">{dates[0]}&nbsp;–</span>{' '}
                  <span className="whitespace-nowrap">{dates[1]}</span>
                </>
              ) : (
                name
              )}
            </p>
            <div className="flex items-center justify-end gap-1">
              {/* Always there, so nothing shifts when it shows; hidden while on this period. */}
              <Button
                variant="text"
                size="sm"
                onClick={backToNow}
                disabled={current}
                aria-hidden={current || undefined}
                className={cx(current && 'invisible')}
              >
                {month ? 'This month' : 'Now'}
              </Button>
              <IconButton
                icon="chevron"
                label={month ? 'Next month' : 'Next pay period'}
                aria-disabled={!nav.next}
                onClick={() => nav.next && setAt(nav.next.start)}
              />
            </div>
          </nav>

          {!span || !money ? (
            <p className="text-body text-muted">
              Nothing to show for these dates. “Now” goes back to this pay period.
            </p>
          ) : (
            <>
              <Block id="ivs-title" title="Income vs spending">
                <div className="card p-5 @xl:p-7">
                  <IncomeVsSpending safe={money} f={f} today={today} past={past} unit={unit} />
                </div>
              </Block>

              {settings.envelopesEnabled && (
                <Block id="bva-title" title={`Budget vs. actuals — ${short}`}>
                  <div className="card px-4 py-6 @xl:p-8">
                    {money.envelopes.some((e) => e.budget > 0 || e.spent + e.linkedDue > 0) ? (
                      <BudgetChart rows={money.envelopes} f={f} labelledBy="bva-title" />
                    ) : (
                      <div className="space-y-3">
                        <p className="text-body text-muted">
                          Give an envelope a budget and add spending to it; planned and actual show
                          up here side by side.
                        </p>
                        <Link to="/envelopes" className={buttonClass('secondary')}>
                          Open envelopes
                        </Link>
                      </div>
                    )}
                  </div>
                </Block>
              )}

              <div className="space-y-10 @2xl:grid @2xl:grid-cols-2 @2xl:items-start @2xl:gap-8 @2xl:space-y-0">
                <Block id="dist-title" title="Spending distribution">
                  <div className="card p-5 @xl:p-7">
                    <SpendingDonut
                      safe={money}
                      f={f}
                      when={month ? `in ${short}` : 'this pay period'}
                      soFar={current}
                    />
                  </div>
                </Block>
                <Block id="left-title" title="Left to spend">
                  <div className="card p-5 @xl:p-7">
                    <LeftToSpendBar
                      safe={money}
                      f={f}
                      past={past}
                      onSeeMath={() => setMath(true)}
                    />
                  </div>
                </Block>
              </div>

              <Block id="notes-title" title={`Notes for this ${unit}`}>
                <div className="card p-5 @xl:p-7">
                  {/* Keyed by period: a half-typed note never follows you to another one. */}
                  <PaydayNote
                    key={span.start}
                    periodStart={span.start}
                    variant="inline"
                    labelledBy="notes-title"
                  />
                </div>
              </Block>

              <MathSheet open={math} onClose={() => setMath(false)} safe={money} past={past} />
            </>
          )}
        </div>
      )}
    </>
  )
}

function Block({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-4">
      <h2 id={id} className="section-title">
        {title}
      </h2>
      {children}
    </section>
  )
}
