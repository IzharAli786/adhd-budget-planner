import { lazy, Suspense, useMemo } from 'react'
import { addDays } from '../../domain/dates'
import type { DateRange } from '../../domain/insights'
import { useFormat } from '../bills/format'
import { insightRows } from './insightRows'
import type { ReviewData } from './useReviewData'

const InsightsCharts = lazy(() => import('./InsightsCharts'))

/** Row keys that are not envelopes: what the money went to beside them. */
const KINDS = new Set(['bills', 'debt', 'savings'])

/** Plan's "Insights": where this period's money went, as a donut and plan-vs-actual bars. */
export function InsightsSection({
  data,
  range,
  past = false,
}: {
  data: ReviewData
  range: DateRange
  /** A finished period reads "went", the current one "is going". */
  past?: boolean
}) {
  const f = useFormat()
  const rows = useMemo(() => insightRows(data, range), [data, range])
  const spent = rows.some((r) => r.actual > 0)
  const by = data.envelopesEnabled && data.envelopes.length > 0 ? 'envelope' : 'kind'
  // The total counts bills and debt payments too (beside the envelopes, or as groups), so
  // it is "Money out", not "Spent", whenever they are in it.
  const outside = by === 'kind' || rows.some((r) => KINDS.has(r.key) && r.actual > 0)
  const totalLabel = outside ? 'Money out' : 'Spent'

  return (
    <section aria-labelledby="insights-title" className="card p-5 sm:p-6">
      <h2 id="insights-title" className="text-heading">
        Insights
      </h2>
      <p className="mt-0.5 mb-5 text-body text-muted">
        {past ? 'Where that period’s money went' : 'Where this period’s money is going'}, by {by}
        {outside && by === 'envelope' ? ', with bills and debt payments' : ''}.
      </p>
      {spent ? (
        <Suspense
          fallback={<div aria-hidden="true" className="h-56 animate-pulse rounded-2xl bg-bg" />}
        >
          <InsightsCharts
            rows={rows}
            f={f}
            caption={`${outside ? 'Money out' : 'Spending'} by ${by}, ${f.day(range.start)} to ${f.day(addDays(range.end, -1))}`}
            centerLabel={totalLabel}
          />
        </Suspense>
      ) : (
        <p className="rounded-2xl bg-bg px-4 py-3 text-body text-muted">
          {past
            ? 'Nothing was logged in that period.'
            : 'Nothing spent yet in this period. Log spending or mark a bill paid and it shows here.'}
        </p>
      )}
    </section>
  )
}
