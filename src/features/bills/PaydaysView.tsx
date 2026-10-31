import { useId, useMemo, useState } from 'react'
import { useUndoToast } from '../../app/useUndoToast'
import {
  addIncome,
  clearPaydayOverride,
  deleteIncome,
  setPaydayOverride,
  updateIncome,
} from '../../db/repos'
import { paydayEntriesBetween, type PaydayEntry } from '../../domain/bills'
import { addDays, isValidISODate } from '../../domain/dates'
import { primaryIncome } from '../../domain/paySchedule'
import type { IncomeSource, ISODate } from '../../domain/types'
import { Button } from '../../ui/Button'
import { DateInput } from '../../ui/DateInput'
import { Icon } from '../../ui/Icon'
import { EmptyState } from '../../ui/PageHeader'
import { ListGroup, ListRow } from '../../ui/List'
import { Sheet } from '../../ui/Sheet'
import { describeSchedule } from './describe'
import { useFormat } from './format'
import { IncomeForm, type IncomeInput } from './IncomeForm'
import type { BillsData } from './useBillsData'

const UPCOMING_DAYS = 120
const UPCOMING_MAX = 8

type Panel =
  { kind: 'income'; income?: IncomeSource } | { kind: 'move'; payday: PaydayEntry } | null

export function PaydaysView({ data, today }: { data: BillsData; today: ISODate }) {
  const f = useFormat()
  const { incomes, paydayOverrides } = data
  const [panel, setPanel] = useState<Panel>(null)
  const primary = primaryIncome(incomes)

  const upcoming = useMemo(
    () =>
      paydayEntriesBetween(incomes, paydayOverrides, today, addDays(today, UPCOMING_DAYS)).slice(
        0,
        UPCOMING_MAX,
      ),
    [incomes, paydayOverrides, today],
  )
  const next = upcoming.find((p) => p.incomeId === primary?.id) ?? upcoming[0]

  return (
    <div className="space-y-6">
      {incomes.length === 0 ? (
        <EmptyState
          art="sunrise"
          title="When do you get paid?"
          action={
            <Button onClick={() => setPanel({ kind: 'income' })}>
              <Icon name="plus" size={18} />
              Add your pay
            </Button>
          }
        >
          Add your pay and Steady groups bills by the time between paydays, so you see what’s due
          before the next one.
        </EmptyState>
      ) : (
        <>
          <section className="card p-6">
            <p className="text-sm text-muted">Next payday</p>
            {next ? (
              <>
                <p className="mt-1 text-[2rem] leading-tight font-semibold tracking-tight">
                  {f.dayLong(next.date)}
                </p>
                <p className="mt-2 text-body text-muted">
                  {capitalize(f.relative(next.date, today))} ·{' '}
                  <span className="font-medium text-text tabular-nums">{f.money(next.amount)}</span>{' '}
                  from {next.name}
                </p>
              </>
            ) : (
              <p className="mt-1 text-lg font-medium">
                No date yet. Add your next expected payday.
              </p>
            )}
            <Button className="mt-4" onClick={() => setPanel({ kind: 'income' })}>
              <Icon name="plus" size={18} />
              Add income
            </Button>
          </section>

          <ListGroup title="Income">
            {incomes.map((i) => (
              <ListRow
                key={i.id}
                icon="payday"
                label={
                  <>
                    {i.name}
                    {i.id === primary?.id && incomes.length > 1 && (
                      <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 align-middle text-xs font-medium text-accent">
                        Main
                      </span>
                    )}
                  </>
                }
                detail={`${f.money(i.amount)} · ${describeSchedule(i.schedule, f)}`}
                onClick={() => setPanel({ kind: 'income', income: i })}
              />
            ))}
          </ListGroup>

          {upcoming.length > 0 && (
            <section className="space-y-2">
              <h2 className="px-1 eyebrow text-muted">Coming paydays</h2>
              <ul className="card divide-y divide-line overflow-hidden">
                {upcoming.map((p) => (
                  <li
                    key={`${p.incomeId}|${p.nominal}`}
                    className="flex min-h-16 items-center gap-3 py-2 pr-2 pl-4"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{f.day(p.date)}</span>
                      <span className="block truncate text-sm text-muted">
                        {p.name} · <span className="tabular-nums">{f.money(p.amount)}</span>
                        {p.overridden && ` · moved from ${f.day(p.nominal)}`}
                      </span>
                    </span>
                    <Button
                      variant="ghost"
                      onClick={() => setPanel({ kind: 'move', payday: p })}
                      aria-label={`Move the ${p.name} payday on ${f.day(p.date)}`}
                    >
                      Move
                    </Button>
                  </li>
                ))}
              </ul>
              <p className="px-1 text-sm text-muted">
                Paid early, or a bank holiday? Move just that payday.
              </p>
            </section>
          )}
        </>
      )}

      <IncomeEditor
        open={panel?.kind === 'income'}
        income={panel?.kind === 'income' ? panel.income : undefined}
        showPrimary={incomes.length > (panel?.kind === 'income' && panel.income ? 1 : 0)}
        today={today}
        onClose={() => setPanel(null)}
      />
      <MovePaydaySheet
        payday={panel?.kind === 'move' ? panel.payday : null}
        onClose={() => setPanel(null)}
      />
    </div>
  )
}

function IncomeEditor({
  open,
  income,
  showPrimary,
  today,
  onClose,
}: {
  open: boolean
  income?: IncomeSource
  showPrimary: boolean
  today: ISODate
  onClose: () => void
}) {
  const formId = useId()
  const undoToast = useUndoToast()

  async function save(input: IncomeInput) {
    if (income) await updateIncome(income.id, input)
    else await addIncome({ ...input, active: true })
    undoToast(income ? `Saved ${input.name}` : `Added ${input.name}`)
    onClose()
  }

  async function remove() {
    if (!income) return
    await deleteIncome(income.id)
    undoToast(`Deleted ${income.name}`)
    onClose()
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={income ? `Edit ${income.name}` : 'Add income'}
      description={income ? undefined : 'Your pay, benefits, or any money that comes in regularly.'}
    >
      {open && (
        <>
          <IncomeForm
            key={income?.id ?? 'new'}
            id={formId}
            income={income}
            showPrimary={showPrimary}
            today={today}
            onSubmit={(input) => void save(input)}
          />
          <div className="sticky -bottom-2 -mx-6 mt-2 flex flex-col-reverse gap-2 border-t border-line bg-surface px-6 pt-3 pb-6 sm:flex-row sm:items-center">
            {income && (
              <Button
                variant="ghost"
                className="text-muted sm:mr-auto"
                onClick={() => void remove()}
              >
                <Icon name="trash" size={18} />
                Delete
              </Button>
            )}
            <Button type="submit" form={formId} className="sm:ml-auto sm:min-w-32">
              {income ? 'Save' : 'Add income'}
            </Button>
          </div>
        </>
      )}
    </Sheet>
  )
}

function MovePaydaySheet({ payday, onClose }: { payday: PaydayEntry | null; onClose: () => void }) {
  const f = useFormat()
  return (
    <Sheet
      open={payday !== null}
      onClose={onClose}
      title="Move this payday"
      description={
        payday
          ? `${payday.name}, usually ${f.day(payday.nominal)}. Only this one moves.`
          : undefined
      }
    >
      {payday && (
        <MoveBody key={`${payday.incomeId}|${payday.nominal}`} payday={payday} onClose={onClose} />
      )}
    </Sheet>
  )
}

function MoveBody({ payday, onClose }: { payday: PaydayEntry; onClose: () => void }) {
  const f = useFormat()
  const undoToast = useUndoToast()
  const [date, setDate] = useState(payday.date)
  const valid = isValidISODate(date)

  return (
    <form
      className="space-y-4 pb-4"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!valid) return
        await setPaydayOverride(payday.incomeId, payday.nominal, date)
        undoToast(`Payday moved to ${f.day(date)}`)
        onClose()
      }}
    >
      <DateInput format={f.dayFull} label="Paid on" value={date} onChange={setDate} />
      <Button type="submit" block size="lg" disabled={!valid}>
        Move payday
      </Button>
      {payday.overridden && (
        <Button
          variant="ghost"
          block
          onClick={async () => {
            await clearPaydayOverride(payday.incomeId, payday.nominal)
            undoToast(`Payday back on its usual day`)
            onClose()
          }}
        >
          Back to the usual day
        </Button>
      )}
    </form>
  )
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
