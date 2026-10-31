import { useMemo, useState } from 'react'
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
import { monthGrid } from '../../domain/calendar'
import { addDays, addMonths } from '../../domain/dates'
import { expandOccurrences, ruleDates } from '../../domain/recurrence'
import type { ISODate } from '../../domain/types'
import { todayISO } from '../../lib/clock'
import { useToday } from '../../lib/useToday'
import { Button } from '../../ui/Button'
import { Icon } from '../../ui/Icon'
import { ListGroup, ListRow } from '../../ui/List'
import { PageHeader } from '../../ui/PageHeader'
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

  return (
    <>
      <PageHeader title="Bills" subtitle="What’s due, and when the money comes in." />
      <div className="mb-6">
        <Segmented
          label="Show"
          value={view}
          options={VIEWS}
          onChange={(v) => setParams(v === 'bills' ? {} : { view: v }, { replace: true })}
        />
      </div>
      {!data.loaded ? (
        <div aria-hidden="true" className="h-64 animate-pulse rounded-[1.75rem] bg-surface" />
      ) : view === 'bills' ? (
        <BillsView
          data={data}
          today={today}
          onShowPaydays={() => setParams({ view: 'paydays' }, { replace: true })}
        />
      ) : (
        <PaydaysView data={data} today={today} />
      )}
    </>
  )
}

type Panel =
  | { kind: 'day'; date: ISODate }
  | { kind: 'occurrence'; billId: string; originalDate: ISODate }
  | { kind: 'editor'; target: BillEditorTarget }
  | null

function BillsView({
  data,
  today,
  onShowPaydays,
}: {
  data: BillsData
  today: ISODate
  onShowPaydays: () => void
}) {
  const f = useFormat()
  const { settings } = useAppSettings()
  const { bills, occurrences, incomes, paydayOverrides, period, laterEnd } = data
  const [month, setMonth] = useState(today)
  const [panel, setPanel] = useState<Panel>(null)

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
    <div className="space-y-6">
      {bills.length === 0 ? (
        <section className="animate-fade-in rounded-[1.75rem] bg-accent-soft px-6 py-8 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-surface text-accent">
            <Icon name="bills" size={24} />
          </span>
          <h2 className="mt-3 text-lg font-semibold">No bills yet</h2>
          <p className="mx-auto mt-1 max-w-xs text-[0.9375rem] text-muted">
            Start with the biggest one, usually rent. Steady keeps it out of your spending money
            until it’s paid.
          </p>
          <Button className="mt-5" onClick={() => addBill()}>
            <Icon name="plus" size={18} />
            Add your first bill
          </Button>
        </section>
      ) : (
        <section className="rounded-[1.75rem] bg-surface p-6 shadow-card ring-1 ring-line">
          <p className="text-sm text-muted">
            {period.fromPayday ? 'Left to pay before payday' : 'Left to pay this month'}
          </p>
          <p
            aria-live="polite"
            className="mt-1 text-[2.75rem] leading-none font-semibold tracking-tight tabular-nums"
          >
            {f.money(dueSoon.due)}
          </p>
          <p className="mt-3 text-[0.9375rem] text-muted">
            {summaryLine(dueSoon.dueCount, dueSoon.paidCount, period, f)}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
            <Button onClick={() => addBill()}>
              <Icon name="plus" size={18} />
              Add bill
            </Button>
            {!period.fromPayday && (
              <button
                type="button"
                onClick={onShowPaydays}
                className="min-h-11 rounded-full px-1 text-sm font-medium text-accent"
              >
                Add your payday to plan by pay period
              </button>
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
        onMonthChange={(d) => setMonth(d === 0 ? today : addMonths(grid.month, d))}
        onSelectDay={(date) => setPanel({ kind: 'day', date })}
      />

      {bills.length > 0 && (
        <>
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
        </>
      )}

      <DaySheet
        date={panel?.kind === 'day' ? panel.date : null}
        today={today}
        bills={panel?.kind === 'day' ? (calendar.bills.get(panel.date) ?? []) : []}
        paydays={panel?.kind === 'day' ? (calendar.paydays.get(panel.date) ?? []) : []}
        onClose={() => setPanel(null)}
        onOpenBill={open}
        onAddBill={addBill}
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
      <div className="flex items-baseline justify-between px-1">
        <h2 className="text-xs font-semibold tracking-wider text-muted uppercase">{title}</h2>
        {entries.length > 0 && (
          <p className="text-sm text-muted tabular-nums">
            {t.due > 0 ? (
              <>
                <span className="font-medium text-text">{f.money(t.due)}</span> to pay
              </>
            ) : (
              'All paid'
            )}
            {t.paid > 0 && t.due > 0 && ` · ${f.money(t.paid)} paid`}
          </p>
        )}
      </div>
      {entries.length === 0 ? (
        <p className="rounded-[1.5rem] bg-surface px-5 py-5 text-[0.9375rem] text-muted ring-1 ring-line">
          {empty}
        </p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-[1.5rem] bg-surface py-1 shadow-card ring-1 ring-line">
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
