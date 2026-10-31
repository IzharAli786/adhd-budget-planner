import { useMemo } from 'react'
import { addDays } from '../../domain/dates'
import type { DateRange } from '../../domain/insights'
import {
  carryOver,
  flowsIn,
  historyStart,
  payPeriodRanges,
  previousPayPeriod,
} from '../../domain/review'
import { Icon } from '../../ui/Icon'
import { useFormat } from '../bills/format'
import { carryLine } from '../review/carry'
import { InsightsSection } from '../review/InsightsSection'
import type { ReviewData } from '../review/useReviewData'

const navButton =
  'inline-flex min-h-11 items-center gap-1 rounded-full px-3 text-sm font-medium text-accent hover:bg-accent-soft/60 disabled:text-muted disabled:opacity-50 disabled:hover:bg-transparent'

/**
 * "‹ Previous period": steps back through earlier pay periods. Looking back is read-only,
 * so the current period's tools (Can this fit?, envelope editing) stay with "now".
 */
export function PeriodNav({
  data,
  current,
  viewing,
  onView,
}: {
  data: ReviewData
  current: DateRange
  viewing: DateRange | null
  onView: (range: DateRange | null) => void
}) {
  const f = useFormat()
  const shown = viewing ?? current
  const prev = previousPayPeriod(data.input, shown.start)
  // Only periods with some history in them: before it, every one would read as empty.
  const canGoBack = prev !== null && prev.end > (data.input.since ?? historyStart(data.input))

  function next() {
    if (!viewing) return
    const after = payPeriodRanges(data.input, {
      start: viewing.end,
      end: addDays(viewing.end, 1),
    })[0]
    onView(after && after.start < current.start ? after : null)
  }

  return (
    <nav
      aria-label="Pay periods"
      className="-mt-3 -mb-2 flex flex-wrap items-center gap-x-1 print-hide"
    >
      <button
        type="button"
        className={`${navButton} -ml-3`}
        disabled={!canGoBack}
        onClick={() => prev && onView({ start: prev.start, end: prev.end })}
      >
        <Icon name="back" size={18} />
        Previous period
      </button>
      {viewing && (
        <>
          <button type="button" className={navButton} onClick={next}>
            Next period
            <Icon name="chevron" size={18} />
          </button>
          <button type="button" className={`${navButton} ml-auto`} onClick={() => onView(null)}>
            Back to now
          </button>
        </>
      )}
      <span className="sr-only" aria-live="polite">
        {viewing
          ? `Showing ${f.day(viewing.start)} to ${f.day(addDays(viewing.end, -1))}`
          : 'Showing this period'}
      </span>
    </nav>
  )
}

/** A finished pay period, read-only: what came in, went out and was carried. */
export function PastPeriod({ data, range }: { data: ReviewData; range: DateRange }) {
  const f = useFormat()
  const flows = useMemo(() => flowsIn(data.input, range), [data, range])
  const carried = useMemo(() => carryOver(data.input, range.start, range.end), [data, range])

  return (
    <>
      <section aria-labelledby="past-title" className="card p-5">
        <p className="text-sm text-muted">
          {f.day(range.start)} – {f.day(addDays(range.end, -1))} · read only
        </p>
        <h2 id="past-title" className="mt-0.5 text-heading">
          Earlier period
        </h2>
        {carried && <p className="mt-2 text-body">{carryLine(carried.amount, f.money)}</p>}
        <dl className="mt-4 divide-y divide-line text-body">
          <Row label="Money in" value={f.money(flows.incomeIn)} />
          <Row label="Spending" value={f.money(flows.spending)} />
          <Row label="Bills paid" value={f.money(flows.billsPaid)} />
          {flows.debtPaid !== 0 && <Row label="Debt payments" value={f.money(flows.debtPaid)} />}
          {flows.saved !== 0 && <Row label="Put into savings" value={f.money(flows.saved)} />}
          <Row
            label={flows.net >= 0 ? 'Left over' : 'More out than in'}
            value={f.money(Math.abs(flows.net))}
            strong
          />
        </dl>
        <p className="mt-3 text-sm text-muted">
          Rebuilt from what you entered: paydays, logged spending and bills marked paid.
        </p>
      </section>
      <InsightsSection data={data} range={range} past />
    </>
  )
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-x-4 py-2.5">
      <dt className={strong ? 'font-semibold' : 'text-muted'}>{label}</dt>
      <dd className={strong ? 'font-semibold tabular-nums' : 'font-medium tabular-nums'}>
        {value}
      </dd>
    </div>
  )
}
