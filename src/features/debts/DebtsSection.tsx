import { useMemo, useState } from 'react'
import { useDebts } from '../../db/hooks'
import { paidShare } from '../../domain/debt'
import type { Debt } from '../../domain/types'
import { useToday } from '../../lib/useToday'
import { Button } from '../../ui/Button'
import { EmptyState } from '../../ui/PageHeader'
import { Icon } from '../../ui/Icon'
import { useFormat } from '../bills/format'
import { aprText } from './DebtForm'
import { DebtEditor, type DebtEditorTarget } from './DebtEditor'
import { PayoffPlan } from './PayoffPlan'

/** Debts list, editor and payoff plan. Lives in Goals (Full) and More > Debt payoff (Simple). */
export function DebtsSection() {
  const rows = useDebts()
  const today = useToday()
  const [editing, setEditing] = useState<DebtEditorTarget>(null)
  // Ids are random UUIDs, so table order is too. Sort by name: the list stays put when a
  // debt is added, and simulation ties (input order) don't shuffle between renders.
  const debts = useMemo(
    () =>
      rows && [...rows].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)),
    [rows],
  )
  const owing = debts?.some((d) => d.balance > 0) ?? false

  if (debts === undefined)
    return <div aria-hidden="true" className="h-48 animate-pulse rounded-3xl bg-surface" />

  return (
    <div className="space-y-6">
      {debts.length === 0 ? (
        <EmptyState
          art="path"
          title="No debts added"
          action={
            <Button onClick={() => setEditing({})}>
              <Icon name="plus" size={18} />
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
              <DebtRow key={d.id} debt={d} onEdit={() => setEditing({ debt: d })} />
            ))}
          </ul>
          <Button variant="secondary" block onClick={() => setEditing({})}>
            <Icon name="plus" size={18} />
            Add a debt
          </Button>
          {owing ? (
            <PayoffPlan debts={debts} today={today} />
          ) : (
            <p className="rounded-3xl bg-accent-soft/60 px-5 py-4 text-body">
              Everything here is paid off. Nice work.
            </p>
          )}
        </>
      )}
      <DebtEditor target={editing} today={today} onClose={() => setEditing(null)} />
    </div>
  )
}

function DebtRow({ debt, onEdit }: { debt: Debt; onEdit: () => void }) {
  const f = useFormat()
  const pct = Math.floor(paidShare(debt.balance, debt.originalBalance) * 100)
  return (
    <li>
      <button
        type="button"
        onClick={onEdit}
        className="block w-full px-5 py-4 text-left transition-colors hover:bg-accent-soft/40 active:bg-accent-soft/70"
      >
        <span className="flex items-baseline gap-3">
          <span className="min-w-0 flex-1 truncate font-medium">{debt.name}</span>
          <span className="font-semibold tabular-nums">{f.money(debt.balance)}</span>
        </span>
        <span className="mt-0.5 flex items-baseline gap-3 text-sm text-muted">
          <span className="min-w-0 flex-1 truncate">
            {aprText(debt.aprBps)}% APR · {f.money(debt.minPayment)} on the {f.ordinal(debt.dueDay)}
          </span>
          <span className="tabular-nums">{debt.balance === 0 ? 'Paid off' : `${pct}% paid`}</span>
        </span>
        <span aria-hidden="true" className="mt-3 block h-1.5 overflow-hidden rounded-full bg-bg">
          <span
            className="block h-full rounded-full bg-accent transition-[width] duration-500"
            style={{ width: `${pct}%` }}
          />
        </span>
      </button>
    </li>
  )
}
