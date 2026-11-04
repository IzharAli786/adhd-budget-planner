// Look back's "Savings this year" and "Debt this year". Each shows a short list by default
// and the same numbers as a table on request (PLAN §8); the tables are also what the
// printed year report uses. Calm words only: debt still owed is a fact, not a warning.
import { useId, useState, type ReactNode } from 'react'
import type { DebtsYear, FundYear } from '../../domain/yearSummary'
import { Button } from '../../ui/Button'
import { cx } from '../../ui/cx'
import { DATA_COLOR } from '../../ui/dataColors'
import { ProgressBar } from '../../ui/Progress'
import type { Formatters } from '../bills/format'

const pct = (f: Formatters, share: number) => f.percent(Math.round(share * 100) / 100)
const apr = (f: Formatters, bps: number) => f.percent(Math.round(bps) / 10000)

/** A fund's net move: "+€40.00" in, or "€50.00 taken out" (never "+−€50.00"). */
export const fundMove = (f: Formatters, cents: number) =>
  cents < 0 ? `${f.money(-cents)} taken out` : `+${f.money(cents)}`

function savingsSubtitle(f: Formatters, total: number, when: string) {
  if (total < 0) return `${f.money(-total)} more taken out of your funds than put in ${when}.`
  return `${f.money(total)} moved into your funds ${when}.`
}

export function SavingsYearCard({
  funds,
  f,
  title,
  when,
}: {
  funds: FundYear[]
  f: Formatters
  title: string
  when: string
}) {
  const total = funds.reduce((a, r) => a + r.savedInRange, 0)
  return (
    <YearCard
      id="savings-year"
      title={title}
      subtitle={savingsSubtitle(f, total, when)}
      table={<SavingsTable funds={funds} f={f} caption={title} when={when} />}
    >
      <ul className="space-y-4">
        {funds.map((r) => (
          <li key={r.id}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-body font-medium">{r.name}</span>
              <span className="shrink-0 text-body font-medium tabular-nums">
                {fundMove(f, r.savedInRange)}
              </span>
            </div>
            {r.ofTarget !== null && (
              <ProgressBar
                value={r.ofTarget}
                label={`${r.name}, share of target`}
                color={DATA_COLOR.savings}
                className="mt-2"
              />
            )}
            <p className="mt-1 text-sm text-muted tabular-nums">
              {f.money(r.savedTotal)} saved
              {r.target !== undefined && r.ofTarget !== null
                ? ` of ${f.money(r.target)} · ${pct(f, r.ofTarget)} of the target`
                : ' so far'}
            </p>
          </li>
        ))}
      </ul>
    </YearCard>
  )
}

export function DebtYearCard({
  debts,
  f,
  title,
  when,
}: {
  debts: DebtsYear
  f: Formatters
  title: string
  /** "this year" or "in 2025". */
  when: string
}) {
  return (
    <YearCard
      id="debt-year"
      title={title}
      subtitle="Every payment counts, minimums included."
      table={<DebtTable debts={debts} f={f} caption={title} when={when} />}
    >
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        <Fig label={`Paid ${when}`} value={f.money(debts.paid)} />
        <Fig label="Still owed" value={f.money(debts.owed)} />
        {debts.avgAprBps !== null && (
          <Fig label="Average APR" value={apr(f, debts.avgAprBps)} hint="Weighted by balance" />
        )}
        {debts.owed > 0 && (
          <Fig
            label={`Interest paid ${when} (estimate)`}
            value={`≈ ${f.money(debts.interestEstimate)}`}
            hint="At today’s balances"
          />
        )}
      </dl>
      <ul className="mt-5 divide-y divide-line border-t border-line">
        {debts.rows.map((r) => (
          <li key={r.id} className="flex items-baseline justify-between gap-3 py-3">
            <span className="min-w-0">
              <span className="block truncate text-body font-medium">{r.name}</span>
              <span className="text-sm text-muted tabular-nums">
                {f.money(r.owed)} left · {apr(f, r.aprBps)} APR
              </span>
            </span>
            <span className="shrink-0 text-body font-medium tabular-nums">
              {f.money(r.paidInRange)} paid
            </span>
          </li>
        ))}
      </ul>
    </YearCard>
  )
}

function YearCard({
  id,
  title,
  subtitle,
  table,
  children,
}: {
  id: string
  title: string
  subtitle: string
  table: ReactNode
  children: ReactNode
}) {
  const [showTable, setShowTable] = useState(false)
  const tableId = useId()
  return (
    <section aria-labelledby={`${id}-title`} className="card flex flex-col p-5 sm:p-6">
      <h2 id={`${id}-title`} className="text-heading">
        {title}
      </h2>
      <p className="mt-0.5 mb-4 text-body text-muted">{subtitle}</p>
      {/* The list is for the eye; the table carries the same numbers for everyone. */}
      {!showTable && (
        <div aria-hidden="true" className="flex-1">
          {children}
        </div>
      )}
      <div id={tableId} className={cx(showTable ? 'flex-1' : 'sr-only')}>
        {table}
      </div>
      <div className="mt-2 flex justify-end">
        <Button
          variant="text"
          size="sm"
          bleed
          aria-expanded={showTable}
          aria-controls={tableId}
          onClick={() => setShowTable((s) => !s)}
        >
          {showTable ? 'Show as a list' : 'Show as a table'}
        </Button>
      </div>
    </section>
  )
}

function Fig({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-lg font-semibold tracking-tight tabular-nums">{value}</dd>
      {hint && <dd className="text-caption text-muted">{hint}</dd>}
    </div>
  )
}

const th = 'py-2 text-right font-medium'
const td = 'py-2 pl-3 text-right whitespace-nowrap'

export function SavingsTable({
  funds,
  f,
  caption,
  when,
}: {
  funds: FundYear[]
  f: Formatters
  caption: string
  when: string
}) {
  return (
    <table className="w-full text-sm tabular-nums">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr className="text-left text-muted">
          <th scope="col" className="py-2 font-medium">
            Fund
          </th>
          <th scope="col" className={th}>
            {when === 'this year' ? 'This year' : when.replace(/^in /, 'In ')}
          </th>
          <th scope="col" className={th}>
            Saved
          </th>
          <th scope="col" className={th}>
            Of target
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {funds.map((r) => (
          <tr key={r.id}>
            <th scope="row" className="py-2 pr-2 text-left font-normal">
              {r.name}
            </th>
            <td className={td}>{fundMove(f, r.savedInRange)}</td>
            <td className={td}>
              {f.money(r.savedTotal)}
              {r.target !== undefined && ` of ${f.money(r.target)}`}
            </td>
            <td className={td}>{r.ofTarget === null ? '–' : pct(f, r.ofTarget)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function DebtTable({
  debts,
  f,
  caption,
  when,
}: {
  debts: DebtsYear
  f: Formatters
  caption: string
  when: string
}) {
  return (
    <table className="w-full text-sm tabular-nums">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr className="text-left text-muted">
          <th scope="col" className="py-2 font-medium">
            Debt
          </th>
          <th scope="col" className={th}>
            Paid
          </th>
          <th scope="col" className={th}>
            Still owed
          </th>
          <th scope="col" className={th}>
            APR
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {debts.rows.map((r) => (
          <tr key={r.id}>
            <th scope="row" className="py-2 pr-2 text-left font-normal">
              {r.name}
            </th>
            <td className={td}>{f.money(r.paidInRange)}</td>
            <td className={td}>{f.money(r.owed)}</td>
            <td className={td}>{apr(f, r.aprBps)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="border-t border-line font-medium">
          <th scope="row" className="py-2 text-left">
            Total
          </th>
          <td className={td}>{f.money(debts.paid)}</td>
          <td className={td}>{f.money(debts.owed)}</td>
          <td className={td}>
            {debts.avgAprBps === null ? '–' : `${apr(f, debts.avgAprBps)} avg`}
          </td>
        </tr>
        {debts.owed > 0 && (
          <tr className="text-muted">
            <th scope="row" colSpan={3} className="py-2 text-left font-normal">
              Interest paid {when} (estimate at today’s balances)
            </th>
            <td className={td}>≈ {f.money(debts.interestEstimate)}</td>
          </tr>
        )}
      </tfoot>
    </table>
  )
}
