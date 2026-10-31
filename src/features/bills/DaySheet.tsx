import type { BillEntry, PaydayEntry } from '../../domain/bills'
import type { PaydaySaving } from '../../domain/savings'
import type { ISODate } from '../../domain/types'
import { Button } from '../../ui/Button'
import { Icon } from '../../ui/Icon'
import { Sheet } from '../../ui/Sheet'
import { NoteEditor } from '../notes/NoteEditor'
import { BillRow } from './BillRow'
import { useFormat } from './format'

interface DaySheetProps {
  date: ISODate | null
  today: ISODate
  bills: BillEntry[]
  paydays: PaydayEntry[]
  savings?: readonly PaydaySaving[]
  onClose: () => void
  onOpenBill: (entry: BillEntry) => void
  onAddBill: (date: ISODate) => void
}

export function DaySheet({
  date,
  today,
  bills,
  paydays,
  savings = [],
  onClose,
  onOpenBill,
  onAddBill,
}: DaySheetProps) {
  const f = useFormat()
  const empty = bills.length === 0 && paydays.length === 0
  // Debt minimums are bills too (paid the same way), but listed apart so a glance shows
  // what is everyday cost and what is paying something down.
  const regular = bills.filter((b) => b.debtId === undefined)
  const debts = bills.filter((b) => b.debtId !== undefined)
  return (
    <Sheet
      open={date !== null}
      onClose={onClose}
      title={date ? f.dayLong(date) : ''}
      description={date ? (date === today ? 'Today' : capitalize(f.relative(date, today))) : ''}
      actions={
        date && (
          <Button variant={empty ? 'primary' : 'secondary'} block onClick={() => onAddBill(date)}>
            <Icon name="plus" size={18} />
            Add a bill on this day
          </Button>
        )
      }
    >
      {date && (
        <div className="space-y-3">
          {empty && <p className="py-2 text-muted">Nothing due, nothing coming in. A quiet day.</p>}
          {paydays.length > 0 && (
            <ul className="space-y-2">
              {paydays.map((p) => (
                <li
                  key={`${p.incomeId}|${p.nominal}`}
                  className="flex min-h-14 items-center gap-3 rounded-2xl bg-accent-soft px-4"
                >
                  <Icon name="payday" size={20} className="text-accent" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{p.name}</span>
                    <span className="block text-sm text-muted">
                      Payday{p.overridden ? ` · moved from ${f.day(p.nominal)}` : ''}
                    </span>
                  </span>
                  <span className="font-medium tabular-nums">+{f.money(p.amount)}</span>
                </li>
              ))}
            </ul>
          )}
          {savings.length > 0 && (
            <ul aria-label="Savings" className="space-y-2">
              {savings.map((s) => (
                <li
                  key={s.fundId}
                  className="flex min-h-12 items-center gap-3 rounded-2xl px-4 ring-1 ring-line"
                >
                  <Icon name="sprout" size={20} className="text-accent" />
                  <span className="min-w-0 flex-1 text-body">
                    Set aside {f.money(s.amount)} for {s.name}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {regular.length > 0 && (
            <ul className="-mx-2">
              {regular.map((b) => (
                <BillRow
                  key={`${b.billId}|${b.originalDate}`}
                  entry={b}
                  today={today}
                  onOpen={onOpenBill}
                  showDate={false}
                />
              ))}
            </ul>
          )}
          {debts.length > 0 && (
            <section aria-labelledby="day-debts" className="pt-1">
              <h3 id="day-debts" className="eyebrow px-1 text-muted">
                Debt minimums
              </h3>
              <ul className="-mx-2 mt-1">
                {debts.map((b) => (
                  <BillRow
                    key={`${b.billId}|${b.originalDate}`}
                    entry={b}
                    today={today}
                    onOpen={onOpenBill}
                    showDate={false}
                  />
                ))}
              </ul>
            </section>
          )}
          <NoteEditor
            key={date}
            target={{ date }}
            title="Note"
            hint="A reminder for this day, like what a payment is for."
            variant="plain"
            className="mt-2"
          />
        </div>
      )}
    </Sheet>
  )
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
