import { useUndoToast } from '../../app/useUndoToast'
import { useNoSpend, useTransactions } from '../../db/hooks'
import { toggleNoSpend } from '../../db/repos'
import { dayOfWeek, parseISODate } from '../../domain/dates'
import { spendDates } from '../../domain/garden'
import { noSpendCount, noSpendStrip } from '../../domain/noSpend'
import type { ISODate } from '../../domain/types'
import { Button } from '../../ui/Button'
import { cx } from '../../ui/cx'
import { Icon } from '../../ui/Icon'
import { useFormat } from '../bills/format'

/**
 * No-spend days: tap to mark today, see the week, a gentle count. Deliberately no streak:
 * a streak turns one ordinary day into "breaking" something (PLAN §1.3).
 */
export function NoSpendCard({ today }: { today: ISODate }) {
  const days = useNoSpend()
  const transactions = useTransactions()
  const f = useFormat()
  const undoToast = useUndoToast()
  if (!days || !transactions)
    return <div aria-hidden="true" className="h-48 animate-pulse rounded-3xl bg-surface" />

  const strip = noSpendStrip(days, today)
  const markedToday = strip.at(-1)!.marked
  // A day with spending logged can't be marked (it wouldn't grow the garden anyway), but
  // an old mark can always be taken off.
  const spent = spendDates(transactions)
  const spentToday = spent.has(today)
  const { year, month } = parseISODate(today)
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`
  const count = noSpendCount(days, monthStart, today)

  // "Sunday 25 October" around its day number, in the locale's own order.
  const longDay = (date: ISODate) => {
    const text = f.dayLong(date)
    const n = String(parseISODate(date).day)
    const at = text.search(new RegExp(`(?<!\\d)${n}(?!\\d)`))
    return at < 0
      ? { before: `${text}, `, after: '' }
      : { before: text.slice(0, at), after: text.slice(at + n.length) }
  }

  const toggle = (date: ISODate) =>
    void toggleNoSpend(date).then((on) =>
      undoToast(on ? 'Marked as a no-spend day' : 'No-spend mark removed'),
    )

  return (
    <section aria-labelledby="nospend-title" className="card space-y-4 p-5">
      <div>
        <h2 id="nospend-title" className="text-heading">
          No-spend days
        </h2>
        <p className="text-body text-muted">
          {count === 0
            ? 'A day without spending is a small win. Mark one when it happens.'
            : `${count} this month. Each one counts, in any order.`}
        </p>
      </div>
      <ol className="grid grid-cols-7 gap-1.5" aria-label="The last 7 days">
        {strip.map((d) => (
          <li key={d.date}>
            <button
              type="button"
              aria-pressed={d.marked}
              disabled={!d.marked && spent.has(d.date)}
              onClick={() => toggle(d.date)}
              className={cx(
                'flex min-h-14 w-full flex-col items-center justify-center rounded-2xl text-xs transition-colors disabled:opacity-50',
                d.marked
                  ? 'bg-accent text-accent-contrast'
                  : 'bg-bg text-muted ring-1 ring-line enabled:hover:bg-accent-soft/60',
                d.date === today && !d.marked && 'ring-accent/50',
              )}
            >
              {/* The name comes from the content, so the visible day number is part of it
                  (WCAG 2.5.3, label in name). "Sunday 25 October" is split around the 25. */}
              <span className="sr-only">{longDay(d.date).before}</span>
              <span aria-hidden="true">{f.weekday(dayOfWeek(d.date), 'narrow')}</span>
              <span className="mt-0.5 text-sm font-semibold tabular-nums">
                {parseISODate(d.date).day}
              </span>
              <span className="sr-only">
                {longDay(d.date).after}
                {d.marked ? ', no-spend day' : spent.has(d.date) ? ', spending logged' : ''}
              </span>
            </button>
          </li>
        ))}
      </ol>
      {spentToday && !markedToday ? (
        <p className="rounded-2xl bg-bg px-4 py-3 text-center text-body text-muted">
          Today has spending logged, and that’s fine. Any day can be the next one.
        </p>
      ) : (
        <Button
          block
          variant={markedToday ? 'secondary' : 'primary'}
          aria-pressed={markedToday}
          onClick={() => toggle(today)}
        >
          {markedToday ? (
            <>
              <Icon name="check" size={18} />
              Today is a no-spend day
            </>
          ) : (
            'Mark today as no-spend'
          )}
        </Button>
      )}
    </section>
  )
}
