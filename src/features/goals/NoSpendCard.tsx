import { useUndoToast } from '../../app/useUndoToast'
import { useNoSpend } from '../../db/hooks'
import { toggleNoSpend } from '../../db/repos'
import { dayOfWeek, parseISODate } from '../../domain/dates'
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
  const f = useFormat()
  const undoToast = useUndoToast()
  if (!days) return <div aria-hidden="true" className="h-48 animate-pulse rounded-3xl bg-surface" />

  const strip = noSpendStrip(days, today)
  const markedToday = strip.at(-1)!.marked
  const { year, month } = parseISODate(today)
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`
  const count = noSpendCount(days, monthStart, today)

  const toggle = (date: ISODate) =>
    void toggleNoSpend(date).then((on) =>
      undoToast(on ? 'Marked as a no-spend day' : 'No-spend mark removed'),
    )

  return (
    <section
      aria-labelledby="nospend-title"
      className="space-y-4 rounded-3xl bg-surface p-5 shadow-card ring-1 ring-line"
    >
      <div>
        <h2 id="nospend-title" className="text-lg font-semibold">
          No-spend days
        </h2>
        <p className="text-[0.9375rem] text-muted">
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
              aria-label={`${f.dayLong(d.date)}${d.marked ? ', no-spend day' : ''}`}
              onClick={() => toggle(d.date)}
              className={cx(
                'flex min-h-14 w-full flex-col items-center justify-center rounded-2xl text-xs transition-colors',
                d.marked
                  ? 'bg-accent text-accent-contrast'
                  : 'bg-bg text-muted ring-1 ring-line hover:bg-accent-soft/60',
                d.date === today && !d.marked && 'ring-accent/50',
              )}
            >
              <span aria-hidden="true">{f.weekday(dayOfWeek(d.date), 'narrow')}</span>
              <span aria-hidden="true" className="mt-0.5 text-sm font-semibold tabular-nums">
                {parseISODate(d.date).day}
              </span>
            </button>
          </li>
        ))}
      </ol>
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
    </section>
  )
}
