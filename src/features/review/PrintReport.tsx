import type { ReactNode } from 'react'
import { addDays } from '../../domain/dates'
import { paidShare } from '../../domain/debt'
import { paidBillsIn, type DateRange } from '../../domain/insights'
import { carryOver, flowsIn, type PeriodSummary } from '../../domain/review'
import { fundSaved } from '../../domain/savings'
import type { ISODate } from '../../domain/types'
import type { Formatters } from '../bills/format'
import { insightRows } from './insightRows'
import { InsightsTable } from './InsightsTable'
import type { ReviewData } from './useReviewData'

export type PrintTarget =
  | { kind: 'period'; range: DateRange; title: string; payday: boolean }
  | {
      kind: 'year'
      range: DateRange
      title: string
      rows: PeriodSummary[]
      rowLabel: (r: PeriodSummary) => string
      periods: number
    }

/**
 * The printed Look back: hidden on screen, the only thing on paper (app.css @media print).
 * Plain tables in a fixed order (summary, where it went, bills, funds and debts), sized to
 * fit one or two pages.
 */
export function PrintReport({
  target,
  data,
  f,
  today,
}: {
  target: PrintTarget
  data: ReviewData
  f: Formatters
  today: ISODate
}) {
  const { range } = target
  const flows = flowsIn(data.input, range)
  const carried =
    target.kind === 'period' && target.payday ? carryOver(data.input, range.start, range.end) : null
  const categories = insightRows(data, range, target.kind === 'year' ? target.periods : 1)
  const spent = categories.reduce((a, r) => a + r.actual, 0)
  const paid = paidBillsIn(data.bills, data.occurrences, range)

  return (
    <article className="print-report hidden text-[10pt] leading-snug text-text">
      <header className="mb-5 border-b border-line pb-3">
        <p className="text-caption text-muted">Steady · Look back</p>
        <h1 className="text-title">{target.title}</h1>
        <p className="text-caption text-muted">
          {f.day(range.start)} – {f.day(addDays(range.end, -1))} · printed {f.day(today)}
        </p>
      </header>

      <Block title="Summary">
        <table className="w-full tabular-nums">
          <tbody>
            {carried && <Line label="Carried in at payday" value={f.money(carried.amount)} />}
            <Line label="Money in" value={f.money(flows.incomeIn)} />
            <Line label="Spending" value={f.money(flows.spending)} />
            <Line label="Bills paid" value={f.money(flows.billsPaid)} />
            <Line label="Debt payments" value={f.money(flows.debtPaid)} />
            <Line label="Put into savings" value={f.money(flows.saved)} />
            <Line label="Left over" value={f.money(flows.net)} strong />
          </tbody>
        </table>
      </Block>

      {target.kind === 'year' && (
        <Block title="By period">
          <table className="w-full tabular-nums">
            <thead>
              <tr className="text-left text-muted">
                <th className="py-1 font-medium">Period</th>
                <Num head>In</Num>
                <Num head>Out</Num>
                <Num head>Saved</Num>
                <Num head>Left over</Num>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {target.rows.map((r) => (
                <tr key={r.start}>
                  <th scope="row" className="py-1 text-left font-normal">
                    {target.rowLabel(r)}
                  </th>
                  <Num>{f.money(r.incomeIn)}</Num>
                  <Num>{f.money(r.moneyOut)}</Num>
                  <Num>{f.money(r.saved)}</Num>
                  <Num>{f.money(r.net)}</Num>
                </tr>
              ))}
            </tbody>
          </table>
        </Block>
      )}

      <Block title="Where it went">
        <InsightsTable rows={categories} total={spent} f={f} caption="Spending by group" />
      </Block>

      <Block title="Bills paid">
        {paid.length === 0 ? (
          <p className="text-muted">No bills marked paid.</p>
        ) : target.kind === 'year' ? (
          <BillsByName paid={paid} f={f} />
        ) : (
          <table className="w-full tabular-nums">
            <tbody className="divide-y divide-line">
              {paid.map((e) => (
                <tr key={`${e.billId}|${e.originalDate}`}>
                  <td className="w-28 py-1 text-muted">{f.day(e.date)}</td>
                  <td className="py-1">{e.name}</td>
                  <Num>{f.money(e.amount)}</Num>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Block>

      {(data.funds.length > 0 || data.debts.length > 0) && (
        <Block title="Funds and debts">
          <table className="w-full tabular-nums">
            <tbody className="divide-y divide-line">
              {data.funds.map((fund) => (
                <tr key={fund.id}>
                  <td className="py-1">{fund.name}</td>
                  <td className="py-1 text-muted">Saved</td>
                  <Num>
                    {f.money(fundSaved(fund, data.transactions))}
                    {fund.target !== undefined && ` of ${f.money(fund.target)}`}
                  </Num>
                </tr>
              ))}
              {data.debts.map((d) => (
                <tr key={d.id}>
                  <td className="py-1">{d.name}</td>
                  <td className="py-1 text-muted">
                    Owed ·{' '}
                    {f.percent(Math.round(paidShare(d.balance, d.originalBalance) * 100) / 100)}{' '}
                    paid
                  </td>
                  <Num>{f.money(d.balance)}</Num>
                </tr>
              ))}
            </tbody>
          </table>
        </Block>
      )}

      <p className="mt-6 text-caption text-muted">
        Estimates based on what you entered in Steady. Not financial advice.
      </p>
    </article>
  )
}

function BillsByName({ paid, f }: { paid: { name: string; amount: number }[]; f: Formatters }) {
  const byName = new Map<string, { count: number; total: number }>()
  for (const e of paid) {
    const row = byName.get(e.name) ?? { count: 0, total: 0 }
    byName.set(e.name, { count: row.count + 1, total: row.total + e.amount })
  }
  return (
    <table className="w-full tabular-nums">
      <tbody className="divide-y divide-line">
        {[...byName].map(([name, { count, total }]) => (
          <tr key={name}>
            <td className="py-1">{name}</td>
            <td className="py-1 text-muted">
              {count} {count === 1 ? 'time' : 'times'}
            </td>
            <Num>{f.money(total)}</Num>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-5">
      <h2 className="mb-1.5 text-heading">{title}</h2>
      {children}
    </section>
  )
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <tr className={strong ? 'border-t border-line font-semibold' : undefined}>
      <th scope="row" className="py-1 text-left font-normal">
        {label}
      </th>
      <Num>{value}</Num>
    </tr>
  )
}

function Num({ children, head }: { children: ReactNode; head?: boolean }) {
  return head ? (
    <th className="py-1 text-right font-medium">{children}</th>
  ) : (
    <td className="py-1 text-right">{children}</td>
  )
}
