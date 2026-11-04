import { useMemo, useState } from 'react'
import { paidShare } from '../../domain/debt'
import { useToday } from '../../lib/useToday'
import { Button } from '../../ui/Button'
import { DATA_COLOR } from '../../ui/dataColors'
import { Notice } from '../../ui/Notice'
import { EmptyState } from '../../ui/PageHeader'
import { ProgressBar } from '../../ui/Progress'
import { StatusBadge, TAG } from '../../ui/status'
import { useFormat } from '../bills/format'
import { DebtEditor, type DebtEditorTarget } from './DebtEditor'
import { PayoffPlan } from './PayoffPlan'
import { useDebtsOwed, type OwedDebt } from './useDebtsOwed'

/** Debts list, editor and payoff plan. Lives in Goals (Full) and More > Debt payoff (Simple). */
export function DebtsSection() {
  // Owed, not the entered balance: payments and ticked minimums since then count, the same
  // number Today's "Still owed" shows.
  const rows = useDebtsOwed()
  const today = useToday()
  const [editing, setEditing] = useState<DebtEditorTarget>(null)
  // Ids are random UUIDs, so table order is too. Sort by name: the list stays put when a
  // debt is added, and simulation ties (input order) don't shuffle between renders.
  const debts = useMemo(
    () =>
      rows && [...rows].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)),
    [rows],
  )
  const owing = debts?.some((d) => d.owed > 0) ?? false

  if (debts === undefined)
    return <div aria-hidden="true" className="h-48 animate-pulse rounded-3xl bg-surface" />

  return (
    <div className="space-y-6">
      {debts.length === 0 ? (
        <EmptyState
          art="path"
          title="No debts added"
          action={
            <Button icon="plus" onClick={() => setEditing({})}>
              Add a debt
            </Button>
          }
        >
          <p>Add a card or loan to see when you could be debt-free and which one to focus on.</p>
        </EmptyState>
      ) : (
        <>
          <ul className="card divide-y divide-line overflow-hidden">
            {debts.map((d) => (
              // The editor's "Balance today" starts from what is owed today, as the row says.
              <DebtRow key={d.id} debt={d} onEdit={() => setEditing({ debt: asOwed(d) })} />
            ))}
          </ul>
          <Button variant="secondary" block icon="plus" onClick={() => setEditing({})}>
            Add a debt
          </Button>
          {owing ? (
            <PayoffPlan debts={debts} today={today} />
          ) : (
            <Notice tone="success">Everything here is paid off. Nice work.</Notice>
          )}
        </>
      )}
      <DebtEditor target={editing} today={today} onClose={() => setEditing(null)} />
    </div>
  )
}

/** The debt as of today: its balance is what is owed now. */
const asOwed = ({ owed, ...debt }: OwedDebt) => ({ ...debt, balance: owed })

function DebtRow({ debt, onEdit }: { debt: OwedDebt; onEdit: () => void }) {
  const f = useFormat()
  const pct = Math.floor(paidShare(debt.owed, debt.originalBalance) * 100)
  return (
    <li>
      <button
        type="button"
        onClick={onEdit}
        className="block w-full px-5 py-4 text-left transition-colors hover:bg-accent-soft/40 active:bg-accent-soft/70"
      >
        {/* Wraps instead of truncating: at 150% text the APR line is the useful part. */}
        <span className="flex flex-wrap items-baseline gap-x-3">
          <span className="min-w-0 flex-1 font-medium break-words">{debt.name}</span>
          <span className="ml-auto font-semibold tabular-nums">{f.money(debt.owed)}</span>
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
          <span className="min-w-0 flex-1">
            {f.percent(debt.aprBps / 10_000)} APR · {f.money(debt.minPayment)} on the{' '}
            {f.ordinal(debt.dueDay)}
          </span>
          {debt.owed === 0 ? (
            <StatusBadge status={TAG.paidOff} className="ml-auto" />
          ) : (
            <span className="ml-auto tabular-nums">{f.percent(pct / 100)} paid</span>
          )}
        </span>
        {/* Decorative: the row already says how much is paid, in words. */}
        <span aria-hidden="true" className="mt-3 block">
          <ProgressBar value={pct / 100} label={`${debt.name} paid off`} color={DATA_COLOR.debt} />
        </span>
      </button>
    </li>
  )
}
