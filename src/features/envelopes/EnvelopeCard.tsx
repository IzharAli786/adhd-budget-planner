import { useId, useRef, useState } from 'react'
import { useUndoToast } from '../../app/useUndoToast'
import { setEnvelopeBudgetFrom } from '../../db/repos'
import type { BillEntry } from '../../domain/bills'
import { budgetFor } from '../../domain/categories'
import { parseAmount, type Cents } from '../../domain/money'
import type { EnvelopeUsage } from '../../domain/safeToSpend'
import type { Envelope, ISODate, Transaction } from '../../domain/types'
import { Button } from '../../ui/Button'
import { cx } from '../../ui/cx'
import { tint } from '../../ui/dataColors'
import { EnvelopeDot, envelopeColor } from '../../ui/EnvelopeDot'
import { FieldError, inputClass } from '../../ui/Field'
import { Icon } from '../../ui/Icon'
import { ProgressBar } from '../../ui/Progress'
import { BILL_STATUS, TAG } from '../../ui/status'
import { useFormat } from '../bills/format'
import { CalendarLink, EntryActions, EntryLine } from './EntryLine'

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
  { kind: 'tx'; date: ISODate; tx: Transaction } | { kind: 'bill'; date: ISODate; bill: BillEntry }

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
    <section aria-labelledby={titleId} className="card p-5 sm:p-6">
      <div className="flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <h2 id={titleId} className="flex min-w-0 items-center gap-2.5 section-title">
          <EnvelopeDot color={env.color} className="size-3" />
          <span className="min-w-0 break-words">{env.name}</span>
        </h2>
        <div className="-mx-3 flex shrink-0 flex-wrap items-center sm:gap-1">
          <Button
            variant="text"
            icon="plus"
            onClick={onAddSpend}
            aria-label={`Add spend to ${env.name}`}
          >
            Add spend
          </Button>
          <Button variant="quiet" onClick={onRename} aria-label={`Rename ${env.name}`}>
            Rename
          </Button>
          {!env.isDefault && (
            <Button
              variant="quiet"
              icon="trash"
              onClick={onDelete}
              aria-label={`Delete ${env.name}`}
            >
              Delete
            </Button>
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
                tag={TAG.bill}
                status={row.bill.status === 'paid' ? BILL_STATUS.paid : undefined}
                sub={rowDay(row.bill.date)}
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
      incoming={refund}
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
    <div className="mt-2">
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
          aria-describedby={invalid ? `${inputId}-used ${inputId}-error` : `${inputId}-used`}
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
          className={cx(inputClass, 'min-w-0 font-medium tabular-nums')}
        />
        <div className="min-w-0">
          {/* The envelope's own colour, also when over: going over is said in words. */}
          <ProgressBar
            size="md"
            value={share}
            label={`${env.name} used`}
            color={envelopeColor(env.color)}
            trackColor={tint(envelopeColor(env.color))}
          />
          <p
            id={`${inputId}-used`}
            className="mt-2 flex flex-wrap justify-between gap-x-3 gap-y-0.5 text-sm font-semibold text-muted tabular-nums"
          >
            <span>{f.money(used)} spent</span>
            {/* ml-auto: when it wraps, the status figure stays on the right edge. */}
            {over > 0 ? (
              <span className="ml-auto inline-flex items-center gap-1 text-tone-attention">
                <Icon name="alert" size={14} className="shrink-0" />
                {f.money(over)} over
              </span>
            ) : (
              <span className="ml-auto">
                {budget === 0 ? 'No budget yet' : `${f.money(left)} left`}
              </span>
            )}
          </p>
        </div>
      </div>
      {invalid && (
        <div className="mt-1.5">
          <FieldError id={`${inputId}-error`}>
            Enter an amount like 180{f.decimals ? '.50' : ''}
          </FieldError>
        </div>
      )}
    </div>
  )
}
