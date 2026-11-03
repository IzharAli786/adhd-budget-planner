import { useId, useRef, useState } from 'react'
import { useUndoToast } from '../../app/useUndoToast'
import { setEnvelopeBudgetFrom } from '../../db/repos'
import type { BillEntry } from '../../domain/bills'
import { budgetFor } from '../../domain/categories'
import { parseAmount, type Cents } from '../../domain/money'
import type { EnvelopeUsage } from '../../domain/safeToSpend'
import type { Envelope, ISODate, Transaction } from '../../domain/types'
import { cx } from '../../ui/cx'
import { useFormat } from '../bills/format'
import { CalendarLink, EntryActions, EntryLine, textButton } from './EntryLine'

interface Props {
  env: Envelope
  /** This month's numbers; undefined only while the money engine has none yet. */
  usage: EnvelopeUsage | undefined
  /** 'YYYY-MM' */
  month: string
  /** "November" */
  monthName: string
  entries: readonly Transaction[]
  bills: readonly BillEntry[]
  rowDay: (date: ISODate) => string
  onAddSpend: () => void
  onRename: () => void
  onDelete: () => void
  onEdit: (tx: Transaction) => void
}

type Row =
  | { kind: 'tx'; date: ISODate; tx: Transaction }
  | { kind: 'bill'; date: ISODate; bill: BillEntry }

/**
 * One envelope for one month: its name and actions, the month's budget beside a bar of
 * what is used, then every entry that counts against it, oldest first.
 */
export function EnvelopeCard({
  env,
  usage,
  month,
  monthName,
  entries,
  bills,
  rowDay,
  onAddSpend,
  onRename,
  onDelete,
  onEdit,
}: Props) {
  const f = useFormat()
  const titleId = useId()
  const budget = usage?.budget ?? budgetFor(env, `${month}-01`)
  // Everything on the card, paid or still to come, so the rows add up to "spent".
  const used = usage ? usage.spent + usage.linkedDue : 0
  const rows: Row[] = [
    ...entries.map((tx) => ({ kind: 'tx' as const, date: tx.date, tx })),
    ...bills.map((bill) => ({ kind: 'bill' as const, date: bill.date, bill })),
  ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))

  return (
    <section aria-labelledby={titleId} className="card p-5 sm:px-8 sm:pt-7 sm:pb-6">
      <div className="flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <h2
          id={titleId}
          className="min-w-0 type-display text-[1.375rem] leading-tight break-words"
        >
          {env.name}
        </h2>
        <div className="-mx-2.5 flex shrink-0 flex-wrap items-center sm:gap-1">
          <button
            type="button"
            onClick={onAddSpend}
            aria-label={`Add spend to ${env.name}`}
            className={textButton}
          >
            <span aria-hidden="true" className="mr-1">
              +
            </span>
            Add spend
          </button>
          <button
            type="button"
            onClick={onRename}
            aria-label={`Rename ${env.name}`}
            className={textButton}
          >
            Rename
          </button>
          {!env.isDefault && (
            <button
              type="button"
              onClick={onDelete}
              aria-label={`Delete ${env.name}`}
              className={textButton}
            >
              Delete
            </button>
          )}
        </div>
      </div>

      <BudgetRow env={env} month={month} monthName={monthName} budget={budget} used={used} />

      {rows.length > 0 ? (
        <ul aria-label={`${env.name} in ${monthName}`} className="mt-4">
          {rows.map((row) =>
            row.kind === 'tx' ? (
              <TxLine key={row.tx.id} tx={row.tx} rowDay={rowDay} onEdit={onEdit} />
            ) : (
              <EntryLine
                key={`${row.bill.billId}|${row.bill.originalDate}`}
                name={row.bill.name}
                tag="Bill"
                sub={
                  row.bill.status === 'paid'
                    ? `${rowDay(row.bill.date)} · paid`
                    : rowDay(row.bill.date)
                }
                amount={f.money(row.bill.amount)}
                actions={<CalendarLink label={row.bill.name} />}
              />
            ),
          )}
        </ul>
      ) : (
        <p className="mt-5 text-body text-muted">
          {env.isDefault
            ? `Nothing here for ${monthName} yet. Spending without an envelope lands here.`
            : `Nothing here for ${monthName} yet.`}
        </p>
      )}
    </section>
  )
}

function TxLine({
  tx,
  rowDay,
  onEdit,
}: {
  tx: Transaction
  rowDay: (date: ISODate) => string
  onEdit: (tx: Transaction) => void
}) {
  const f = useFormat()
  const refund = tx.amount > 0
  const label = tx.note || (refund ? 'Refund' : 'Spending')
  return (
    <EntryLine
      name={label}
      sub={refund ? `${rowDay(tx.date)} · refund` : rowDay(tx.date)}
      amount={refund ? `+${f.money(tx.amount)}` : f.money(-tx.amount)}
      actions={<EntryActions tx={tx} label={label} onEdit={onEdit} />}
    />
  )
}

const toText = (cents: Cents, decimals: number) =>
  (cents / 10 ** decimals).toFixed(decimals).replace(/\.0+$/, '')

/**
 * "Budget for November" with the bar beside it. The budget saves on blur or Enter, from
 * this month on (earlier months keep theirs), with Undo in the toast.
 */
function BudgetRow({
  env,
  month,
  monthName,
  budget,
  used,
}: {
  env: Envelope
  month: string
  monthName: string
  budget: Cents
  used: Cents
}) {
  const f = useFormat()
  const undoToast = useUndoToast()
  const inputId = useId()
  // null while not editing: the field then shows the saved budget, so Undo shows at once.
  const [draft, setDraft] = useState<string | null>(null)
  const saving = useRef(false)
  const text = draft ?? (budget > 0 ? toText(budget, f.decimals) : '')
  const left = Math.max(0, budget - used)
  const over = budget > 0 ? Math.max(0, used - budget) : 0
  const share = budget > 0 ? Math.min(1, used / budget) : 0
  const invalid = draft !== null && draft.trim() !== '' && parseAmount(draft, f.decimals) === null

  async function commit() {
    if (draft === null || saving.current) return
    const next = draft.trim() === '' ? 0 : parseAmount(draft, f.decimals)
    if (next === null) return // Stays as typed, flagged, until it reads as an amount.
    if (next === budget) return setDraft(null)
    // Enter then blur must not save twice (two undo steps for one change).
    saving.current = true
    try {
      await setEnvelopeBudgetFrom(env.id, month, next)
    } finally {
      saving.current = false
    }
    // Cleared after the save, so the field never flashes the old budget in between.
    setDraft(null)
    undoToast(
      next === 0
        ? `No budget for ${env.name} from ${monthName}`
        : `${env.name}: ${f.money(next)} a month from ${monthName}`,
    )
  }

  return (
    <div className="mt-4">
      <label htmlFor={inputId} className="text-sm font-semibold text-muted">
        Budget for {monthName}
      </label>
      <div className="mt-1.5 grid grid-cols-[minmax(6.5rem,1fr)_4.4fr] items-center gap-3 sm:gap-4">
        <input
          id={inputId}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          enterKeyHint="done"
          value={text}
          placeholder="0"
          aria-invalid={invalid || undefined}
          aria-describedby={`${inputId}-used`}
          onFocus={() => setDraft(text)}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void commit()
            } else if (e.key === 'Escape' && draft !== null) {
              // Esc puts the saved budget back instead of closing anything.
              e.preventDefault()
              setDraft(budget > 0 ? toText(budget, f.decimals) : '')
            }
          }}
          className={cx(
            'min-h-12 w-full min-w-0 rounded-xl border border-line bg-surface px-4 text-body font-medium text-text tabular-nums outline-none transition-colors',
            'placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/20 aria-invalid:border-accent',
          )}
        />
        <div className="min-w-0">
          <div
            role="progressbar"
            aria-label={`${env.name} used`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(share * 100)}
            className="h-3 overflow-hidden rounded-full bg-accent-soft"
          >
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out"
              style={{ width: `${share * 100}%` }}
            />
          </div>
          <p
            id={`${inputId}-used`}
            className="mt-2 flex flex-wrap justify-between gap-x-3 text-sm font-semibold text-muted tabular-nums"
          >
            <span>{f.money(used)} spent</span>
            <span>
              {budget === 0
                ? 'No budget yet'
                : over > 0
                  ? `${f.money(over)} over`
                  : `${f.money(left)} left`}
            </span>
          </p>
        </div>
      </div>
      {invalid && (
        <p className="mt-1.5 text-sm font-medium text-accent">
          Enter an amount like 180{f.decimals ? '.50' : ''}
        </p>
      )}
    </div>
  )
}
