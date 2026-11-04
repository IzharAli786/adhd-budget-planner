import { useState } from 'react'
import { useUndoToast } from '../../app/useUndoToast'
import { markDue, markPaid, moveOccurrence, skipOccurrence } from '../../db/repos'
import type { BillEntry } from '../../domain/bills'
import { isValidISODate } from '../../domain/dates'
import type { ISODate } from '../../domain/types'
import { Button } from '../../ui/Button'
import { DateInput } from '../../ui/DateInput'
import { Icon } from '../../ui/Icon'
import { MoneyInput } from '../../ui/MoneyInput'
import { Sheet } from '../../ui/Sheet'
import { useFormat } from './format'

interface OccurrenceSheetProps {
  entry: BillEntry | null
  today: ISODate
  onClose: () => void
  onEdit: (entry: BillEntry) => void
}

/** One bill on one date: pay it, skip it, move it, or edit the series. */
export function OccurrenceSheet({ entry, today, onClose, onEdit }: OccurrenceSheetProps) {
  const f = useFormat()
  return (
    <Sheet
      open={entry !== null}
      onClose={onClose}
      title={entry?.name ?? ''}
      description={entry ? statusLine(entry, today, f) : undefined}
    >
      {entry && (
        <Body
          key={`${entry.billId}|${entry.originalDate}`}
          entry={entry}
          onClose={onClose}
          onEdit={onEdit}
        />
      )}
    </Sheet>
  )
}

function statusLine(e: BillEntry, today: ISODate, f: ReturnType<typeof useFormat>) {
  if (e.status === 'paid') return `Paid · ${f.day(e.date)}`
  if (e.status === 'skipped') return `Skipped · ${f.day(e.date)}`
  const when = e.date < today ? `was due ${f.relative(e.date, today)}` : f.relative(e.date, today)
  return `${f.dayLong(e.date)} · ${when}${e.autopay ? ' · autopay' : ''}`
}

function Body({
  entry,
  onClose,
  onEdit,
}: {
  entry: BillEntry
  onClose: () => void
  onEdit: (entry: BillEntry) => void
}) {
  const f = useFormat()
  const undoToast = useUndoToast()
  const [mode, setMode] = useState<'view' | 'amount' | 'move'>('view')
  const [paidAmount, setPaidAmount] = useState<number | null>(entry.amount)
  const [moveTo, setMoveTo] = useState(entry.date)
  const { billId, originalDate } = entry

  async function run(action: Promise<unknown>, message: string, tone?: 'success') {
    await action
    undoToast(message, tone ? { tone } : undefined)
    onClose()
  }

  const pay = () =>
    paidAmount !== null &&
    void run(markPaid(billId, originalDate, paidAmount), `${entry.name} marked paid`, 'success')

  return (
    <div className="space-y-5 pb-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="type-display text-4xl leading-none">{f.money(entry.amount)}</p>
        {entry.moved && (
          <p className="text-sm text-muted">Moved from {f.day(entry.originalDate)}</p>
        )}
      </div>

      {entry.status === 'due' && mode !== 'move' && (
        <div className="space-y-3">
          {mode === 'amount' && (
            <MoneyInput
              label="Amount paid"
              value={paidAmount}
              onChange={setPaidAmount}
              symbol={f.symbol}
              decimals={f.decimals}
              hint="Only this payment changes. The bill keeps its usual amount."
            />
          )}
          <Button block size="lg" icon="check" onClick={pay} disabled={paidAmount === null}>
            {mode === 'amount' && paidAmount !== null
              ? `Mark paid · ${f.money(paidAmount)}`
              : 'Mark paid'}
          </Button>
          {mode === 'view' && (
            <div className="flex justify-center">
              <Button variant="text" size="sm" onClick={() => setMode('amount')}>
                Paid a different amount?
              </Button>
            </div>
          )}
        </div>
      )}

      {mode === 'move' && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (isValidISODate(moveTo))
              void run(
                moveOccurrence(billId, originalDate, moveTo),
                moveTo === originalDate
                  ? `${entry.name} is back on ${f.day(moveTo)}`
                  : `${entry.name} moved to ${f.day(moveTo)}`,
              )
          }}
        >
          <DateInput format={f.dayFull} label="Move to" value={moveTo} onChange={setMoveTo} />
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setMode('view')}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={!isValidISODate(moveTo)}>
              Move this one
            </Button>
          </div>
        </form>
      )}

      {entry.status !== 'due' && (
        <Button
          block
          size="lg"
          variant="secondary"
          onClick={() =>
            void run(
              markDue(billId, originalDate),
              entry.status === 'paid'
                ? `${entry.name} marked not paid`
                : `${entry.name} is due again`,
            )
          }
        >
          {entry.status === 'paid' ? 'Mark as not paid' : 'Don’t skip it'}
        </Button>
      )}

      {mode === 'view' && (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl ring-1 ring-line">
          {entry.status === 'due' && (
            <ActionRow
              icon="calendar"
              label="Move to another date"
              onClick={() => setMode('move')}
            />
          )}
          {entry.moved && (
            <ActionRow
              icon="undo"
              label={`Back to ${f.day(originalDate)}`}
              onClick={() =>
                void run(
                  moveOccurrence(billId, originalDate, originalDate),
                  `${entry.name} is back on ${f.day(originalDate)}`,
                )
              }
            />
          )}
          {entry.status === 'due' && (
            <ActionRow
              icon="skip"
              label="Skip this one"
              onClick={() =>
                void run(skipOccurrence(billId, originalDate), `Skipped ${entry.name}`)
              }
            />
          )}
          <ActionRow icon="edit" label="Edit bill" onClick={() => onEdit(entry)} />
        </ul>
      )}
    </div>
  )
}

function ActionRow({
  icon,
  label,
  onClick,
}: {
  icon: 'calendar' | 'skip' | 'edit' | 'undo'
  label: string
  onClick: () => void
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex min-h-13 w-full items-center gap-3 px-4 text-left font-medium transition-colors hover:bg-accent-soft/40"
      >
        <Icon name={icon} size={20} className="shrink-0 text-muted" />
        {label}
      </button>
    </li>
  )
}
