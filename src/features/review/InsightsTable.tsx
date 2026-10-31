import type { Formatters } from '../bills/format'
import type { InsightRow } from './insightRows'

/** The same numbers as rows; also used by the printed report. */
export function InsightsTable({
  rows,
  total,
  f,
  caption,
}: {
  rows: InsightRow[]
  total: number
  f: Formatters
  caption: string
}) {
  const anyPlan = rows.some((r) => r.planned !== null)
  return (
    <table className="w-full text-sm tabular-nums">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr className="text-left text-muted">
          <th scope="col" className="py-2 font-medium">
            Name
          </th>
          {anyPlan && (
            <th scope="col" className="py-2 text-right font-medium">
              Planned
            </th>
          )}
          <th scope="col" className="py-2 text-right font-medium">
            Actual
          </th>
          <th scope="col" className="py-2 text-right font-medium">
            Share
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {rows.map((r) => (
          <tr key={r.key}>
            <th scope="row" className="py-2 pr-2 text-left font-normal">
              {r.name}
            </th>
            {anyPlan && (
              <td className="py-2 text-right">
                {r.planned === null ? '–' : r.planned === 0 ? 'No budget yet' : f.money(r.planned)}
              </td>
            )}
            <td className="py-2 text-right">{f.money(r.actual)}</td>
            <td className="py-2 text-right">
              {total > 0 ? f.percent(Math.round((r.actual / total) * 1000) / 1000) : '–'}
            </td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="border-t border-line font-medium">
          <th scope="row" className="py-2 text-left">
            Total
          </th>
          {anyPlan && <td />}
          <td className="py-2 text-right">{f.money(total)}</td>
          <td />
        </tr>
      </tfoot>
    </table>
  )
}
