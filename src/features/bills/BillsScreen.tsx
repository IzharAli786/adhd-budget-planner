import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useAppSettings } from '../../app/SettingsProvider'
import {
  addedOnMap,
  billEntriesBetween,
  groupByDate,
  groupUpcoming,
  paydayEntriesBetween,
  totalsOf,
  type BillEntry,
} from '../../domain/bills'
import { useFunds, useNotes, useTransactions } from '../../db/hooks'
import { monthGrid } from '../../domain/calendar'
import { addDays, addMonths } from '../../domain/dates'
import { primaryIncome } from '../../domain/paySchedule'
import { expandOccurrences, ruleDates } from '../../domain/recurrence'
import { fundSaved, savingsOnPaydays } from '../../domain/savings'
import type { ISODate, Transaction } from '../../domain/types'
import { TransactionSheet } from '../transactions/TransactionsScreen'
import { AddEntrySheet } from './AddEntrySheet'
import { todayISO } from '../../lib/clock'
import { useToday } from '../../lib/useToday'
import { BigNumber } from '../../ui/BigNumber'
import { Button } from '../../ui/Button'
import { ListGroup, ListRow } from '../../ui/List'
import { EmptyState, PageHeader } from '../../ui/PageHeader'
import { SectionHeader } from '../../ui/Section'
import { Segmented } from '../../ui/Segmented'
import { BillEditor, type BillEditorTarget } from './BillEditor'
import { BillRow } from './BillRow'
import { DaySheet } from './DaySheet'
import { describeRule } from './describe'
import { useFormat } from './format'
import { MonthCalendar } from './MonthCalendar'
import { OccurrenceSheet } from './OccurrenceSheet'
import { PaydaysView } from './PaydaysView'
import { useBillsData, type BillsData } from './useBillsData'

const VIEWS = [
  { value: 'bills', label: 'Bills' },
  { value: 'paydays', label: 'Paydays' },
] as const
type View = (typeof VIEWS)[number]['value']

// How far back "Overdue" looks. Older unpaid bills are almost always paid-and-forgotten.
const OVERDUE_DAYS = 92

export function BillsScreen() {
  const today = useToday()
  const data = useBillsData(today)
  // In the URL, so a reload or the back button keeps the segment (and Today can link here).
  const [params, setParams] = useSearchParams()
  const view: View = params.get('view') === 'paydays' ? 'paydays' : 'bills'
  // ?new=1 ("Add your rent" on Today) opens the bill form straight away: one tap, not two.
  const startNew = params.get('new') === '1'

  return (
    <>
      <PageHeader
        title="Calendar"
        subtitle="Bills, paydays and everything you log. Tap a day to add to it."
      />
      <div className="mb-6 lg:max-w-sm">
        <Segmented
          label="Show"
          value={view}
          options={VIEWS}
          onChange={(v) => setParams(v === 'bills' ? {} : { view: v }, { replace: true })}
        />
      </div>
      {!data.loaded ? (
        <div aria-hidden="true" className="h-64 animate-pulse rounded-3xl bg-surface" />
      ) : view === 'bills' ? (
        <BillsView
          data={data}
          today={today}
          startNew={startNew}
          // Dropped once the form is open, so Back or a reload doesn't open it again.
          onStarted={() => setParams({}, { replace: true })}
          onShowPaydays={() => setParams({ view: 'paydays' }, { replace: true })}
        />
      ) : (
        <div className="lg:max-w-2xl">
          <PaydaysView data={data} today={today} />
        </div>
      )}
    </>
  )
}

type Panel =
  | { kind: 'day'; date: ISODate }
  | { kind: 'add'; date: ISODate }
  | { kind: 'entry'; tx: Transaction; date: ISODate }
  | { kind: 'occurrence'; billId: string; originalDate: ISODate }
  | { kind: 'editor'; target: BillEditorTarget }
  | null

function BillsView({
  data,
  today,
  startNew = false,
  onStarted,
  onShowPaydays,
}: {
  data: BillsData
  today: ISODate
  startNew?: boolean
  onStarted?: () => void
  onShowPaydays: () => void
}) {
  const f = useFormat()
  const { settings } = useAppSettings()
  const { bills, occurrences, incomes, paydayOverrides, period, laterEnd } = data
  const [month, setMonth] = useState(today)
  const [panel, setPanel] = useState<Panel>(() =>
    startNew ? { kind: 'editor', target: { defaultDate: today } } : null,
  )
  useEffect(() => {
    if (startNew) onStarted?.()
  }, [startNew, onStarted])
  const funds = useFunds()
  const transactions = useTransactions()
  const notes = useNotes()

  const groups = useMemo(() => {
    const entries = billEntriesBetween(bills, occurrences, addDays(today, -OVERDUE_DAYS), laterEnd)
    const addedOn = addedOnMap(bills, (at) => todayISO(new Date(at)))
    return groupUpcoming(entries, today, period, laterEnd, addedOn)
  }, [bills, occurrences, today, period, laterEnd])

  const grid = monthGrid(month, settings.weekStart)
  const gridFrom = grid.weeks[0]![0]!
  const gridTo = addDays(grid.weeks.at(-1)!.at(-1)!, 1)
  const calendar = useMemo(
    () => ({
      bills: groupByDate(billEntriesBetween(bills, occurrences, gridFrom, gridTo)),
      paydays: groupByDate(paydayEntriesBetween(incomes, paydayOverrides, gridFrom, gridTo)),
    }),
    [bills, occurrences, incomes, paydayOverrides, gridFrom, gridTo],
  )
  const savings = useMemo(() => {
    if (!funds || !transactions) return undefined
    const saved = new Map(funds.map((fund) => [fund.id, fundSaved(fund, transactions)]))
    const paydays = [...calendar.paydays.values()].flat()
    return savingsOnPaydays(paydays, funds, primaryIncome(incomes)?.id, saved)
  }, [funds, transactions, calendar.paydays, incomes])
  const logged = useMemo(
    () =>
      groupByDate((transactions ?? []).filter((t) => t.date >= gridFrom && t.date < gridTo)) as Map<
        ISODate,
        Transaction[]
      >,
    [transactions, gridFrom, gridTo],
  )
  const noteDays = useMemo(
    () => new Set((notes ?? []).flatMap((n) => (n.date ? [n.date] : []))),
    [notes],
  )

  // The sheet reads its occurrence live, so a change made elsewhere (another tab) shows.
  const openEntry = useMemo(() => {
    if (panel?.kind !== 'occurrence') return null
    const bill = bills.find((b) => b.id === panel.billId)
    if (!bill) return null
    const occ = expandOccurrences(
      bill,
      addDays(panel.originalDate, -400),
      addDays(panel.originalDate, 400),
      occurrences.filter((o) => o.billId === bill.id),
    ).find((o) => o.originalDate === panel.originalDate)
    return occ ? { ...occ, name: bill.name, autopay: bill.autopay } : null
  }, [panel, bills, occurrences])

  // A series with nothing left from today on (the old half of a "from here on" split) is
  // history, not a bill. Checking real dates, not until >= today: a split at tomorrow
  // ends the old half today, and listing Rent twice for that day reads as a duplicate.
  const current = bills.filter(
    (b) => b.until === undefined || ruleDates(b.rule, today, addDays(b.until, 1)).length > 0,
  )
  const dueSoon = totalsOf([...groups.overdue, ...groups.thisPeriod])
  const open = (e: BillEntry) =>
    setPanel({ kind: 'occurrence', billId: e.billId, originalDate: e.originalDate })
  const addBill = (date?: ISODate) =>
    setPanel({ kind: 'editor', target: { defaultDate: date ?? today } })

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:items-start lg:gap-8">
      {/* Sticky only when summary + calendar fit the window: on a short laptop a sticky
          column taller than the viewport would hide the calendar's last weeks. */}
      <div className="space-y-6 lg:[@media(min-height:52rem)]:sticky lg:[@media(min-height:52rem)]:top-10">
        {bills.length === 0 ? (
          <EmptyState
            art="calendar"
            title="No bills yet"
            action={
              <Button icon="plus" onClick={() => addBill()}>
                Add your first bill
              </Button>
            }
          >
            Start with the biggest one, usually rent. Steady keeps it out of your spending money
            until it’s paid.
          </EmptyState>
        ) : (
          <section className="card @container p-5 sm:p-6">
            <p className="text-sm text-muted">
              {period.fromPayday ? 'Left to pay before payday' : 'Left to pay this month'}
            </p>
            <BigNumber text={f.money(dueSoon.due)} maxRem={2.75} className="mt-1" />
            <p className="mt-3 text-body text-muted">
              {summaryLine(dueSoon.dueCount, dueSoon.paidCount, period, f)}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
              <Button icon="plus" onClick={() => addBill()}>
                Add bill
              </Button>
              {!period.fromPayday && incomes.length === 0 && (
                <Button variant="text" size="sm" onClick={onShowPaydays}>
                  Add your payday to plan by pay period
                </Button>
              )}
            </div>
          </section>
        )}

        <MonthCalendar
          month={month}
          today={today}
          weekStart={settings.weekStart}
          bills={calendar.bills}
          paydays={calendar.paydays}
          savings={savings}
          notes={noteDays}
          logged={logged}
          onMonthChange={(d) => setMonth(d === 0 ? today : addMonths(grid.month, d))}
          onSelectDay={(date) => setPanel({ kind: 'day', date })}
        />
      </div>

      {bills.length > 0 && (
        <div className="mt-6 space-y-6 lg:mt-0">
          {groups.overdue.length > 0 && (
            <BillGroup title="Overdue" entries={groups.overdue} today={today} onOpen={open} />
          )}
          <BillGroup
            title={period.fromPayday ? 'This pay period' : 'This month'}
            entries={groups.thisPeriod}
            today={today}
            onOpen={open}
            empty={
              period.fromPayday ? 'Nothing else due before payday.' : 'Nothing else due this month.'
            }
          />
          {groups.later.length > 0 && (
            <BillGroup title="Later" entries={groups.later} today={today} onOpen={open} />
          )}

          <ListGroup title={`All bills · ${current.length}`}>
            {current
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((b) => (
                <ListRow
                  key={b.id}
                  label={b.name}
                  detail={`${f.money(b.amount)} · ${describeRule(b.rule, f)}${b.autopay ? ' · autopay' : ''}`}
                  onClick={() => setPanel({ kind: 'editor', target: { bill: b } })}
                />
              ))}
          </ListGroup>
        </div>
      )}

      <DaySheet
        date={panel?.kind === 'day' ? panel.date : null}
        today={today}
        bills={panel?.kind === 'day' ? (calendar.bills.get(panel.date) ?? []) : []}
        paydays={panel?.kind === 'day' ? (calendar.paydays.get(panel.date) ?? []) : []}
        savings={panel?.kind === 'day' ? (savings?.get(panel.date) ?? []) : []}
        entries={panel?.kind === 'day' ? (logged.get(panel.date) ?? []) : []}
        onClose={() => setPanel(null)}
        onOpenBill={open}
        onAdd={(date) => setPanel({ kind: 'add', date })}
        onEditEntry={(tx) => setPanel({ kind: 'entry', tx, date: tx.date })}
      />
      <AddEntrySheet
        date={panel?.kind === 'add' ? panel.date : null}
        // Back to the day, so what was just added shows right there.
        onClose={() => setPanel((p) => (p?.kind === 'add' ? { kind: 'day', date: p.date } : p))}
        onAddBill={addBill}
      />
      <TransactionSheet
        tx={panel?.kind === 'entry' ? panel.tx : null}
        onClose={() => setPanel((p) => (p?.kind === 'entry' ? { kind: 'day', date: p.date } : p))}
      />
      <OccurrenceSheet
        entry={openEntry}
        today={today}
        onClose={() => setPanel(null)}
        onEdit={(e) => {
          const bill = bills.find((b) => b.id === e.billId)
          if (bill) setPanel({ kind: 'editor', target: { bill, originalDate: e.originalDate } })
        }}
      />
      <BillEditor
        target={panel?.kind === 'editor' ? panel.target : null}
        today={today}
        onClose={() => setPanel(null)}
      />
    </div>
  )
}

function summaryLine(
  dueCount: number,
  paidCount: number,
  period: { end: ISODate; fromPayday: boolean },
  f: ReturnType<typeof useFormat>,
) {
  const bills = dueCount === 0 ? 'All paid' : dueCount === 1 ? '1 bill' : `${dueCount} bills`
  const paid = paidCount > 0 && dueCount > 0 ? ` · ${paidCount} paid` : ''
  if (!period.fromPayday) return `${bills}${paid}`
  return `${bills}${paid} · payday ${f.day(period.end)}`
}

function BillGroup({
  title,
  entries,
  today,
  onOpen,
  empty,
}: {
  title: string
  entries: BillEntry[]
  today: ISODate
  onOpen: (e: BillEntry) => void
  empty?: string
}) {
  const f = useFormat()
  const t = totalsOf(entries)
  return (
    <section className="space-y-2">
      <SectionHeader
        title={title}
        aside={
          entries.length > 0 && (
            <p>
              {t.due > 0 ? (
                <>
                  <span className="font-medium text-text">{f.money(t.due)}</span> to pay
                </>
              ) : (
                'All paid'
              )}
              {t.paid > 0 && t.due > 0 && ` · ${f.money(t.paid)} paid`}
            </p>
          )
        }
      />
      {entries.length === 0 ? (
        <p className="card-quiet px-5 py-5 text-body text-muted">{empty}</p>
      ) : (
        <ul className="card divide-y divide-line overflow-hidden py-1">
          {entries.map((e) => (
            <BillRow
              key={`${e.billId}|${e.originalDate}`}
              entry={e}
              today={today}
              onOpen={onOpen}
            />
          ))}
        </ul>
      )}
    </section>
  )
}
