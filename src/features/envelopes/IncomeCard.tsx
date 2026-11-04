import { useId } from 'react'
import type { PaydayEntry } from '../../domain/bills'
import type { ISODate, Transaction } from '../../domain/types'
import { Button } from '../../ui/Button'
import { TAG } from '../../ui/status'
import { useFormat } from '../bills/format'
import { CalendarLink, EntryActions, EntryLine } from './EntryLine'

type Row =
  | { kind: 'payday'; date: ISODate; payday: PaydayEntry }
  | { kind: 'tx'; date: ISODate; tx: Transaction }

/**
 * The month's money in, above the envelopes it is shared out into: paydays from the pay
 * schedule (changed on the calendar) and income logged by hand (Edit and × right here).
 */
export function IncomeCard({
  monthName,
  paydays,
  logged,
  rowDay,
  onAdd,
  onEdit,
}: {
  monthName: string
  paydays: readonly PaydayEntry[]
  logged: readonly Transaction[]
  rowDay: (date: ISODate) => string
  onAdd: () => void
  onEdit: (tx: Transaction) => void
}) {
  const f = useFormat()
  const titleId = useId()
  const total =
    paydays.reduce((sum, p) => sum + p.amount, 0) + logged.reduce((sum, t) => sum + t.amount, 0)
  const rows: Row[] = [
    ...paydays.map((payday) => ({ kind: 'payday' as const, date: payday.date, payday })),
    ...logged.map((tx) => ({ kind: 'tx' as const, date: tx.date, tx })),
  ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))

  return (
    <section aria-labelledby={titleId} className="card p-5 sm:p-6">
      <div className="flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <h2 id={titleId} className="section-title">
          Income
        </h2>
        <div className="-mx-3 flex shrink-0 items-center">
          <Button variant="text" icon="plus" onClick={onAdd}>
            Add income
          </Button>
        </div>
      </div>

      <div className="mt-4">
        <p className="text-sm font-semibold text-muted">Money in for {monthName}</p>
        <p className="mt-0.5 type-display text-[1.75rem] leading-tight">{f.money(total)}</p>
      </div>

      {rows.length > 0 ? (
        <ul aria-label={`Income in ${monthName}`} className="mt-3">
          {rows.map((row) =>
            row.kind === 'payday' ? (
              <EntryLine
                key={`${row.payday.incomeId}|${row.payday.nominal}`}
                name={row.payday.name}
                tag={TAG.payday}
                sub={rowDay(row.payday.date)}
                amount={`+${f.money(row.payday.amount)}`}
                incoming
                actions={<CalendarLink label={row.payday.name} to="/bills?view=paydays" />}
              />
            ) : (
              <EntryLine
                key={row.tx.id}
                name={row.tx.note || 'Income'}
                sub={rowDay(row.tx.date)}
                amount={`+${f.money(row.tx.amount)}`}
                incoming
                actions={
                  <EntryActions tx={row.tx} label={row.tx.note || 'Income'} onEdit={onEdit} />
                }
              />
            ),
          )}
        </ul>
      ) : (
        <p className="mt-4 text-body text-muted">
          No money in for {monthName} yet. Paydays show up here by themselves; add anything else
          that comes in.
        </p>
      )}
    </section>
  )
}
