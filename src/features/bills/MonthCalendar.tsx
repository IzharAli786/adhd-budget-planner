import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { monthGrid, weekdayOrder, isSameMonth } from '../../domain/calendar'
import type { BillEntry, PaydayEntry } from '../../domain/bills'
import type { PaydaySaving } from '../../domain/savings'
import { addDays, addMonths, dayOfWeek, mod } from '../../domain/dates'
import type { ISODate } from '../../domain/types'
import { Button } from '../../ui/Button'
import { cx } from '../../ui/cx'
import { IconButton } from '../../ui/IconButton'
import { Marker } from '../../ui/Marker'
import { calendarDayLabel } from './describe'
import { useFormat } from './format'

interface MonthCalendarProps {
  /** Any date in the month shown. */
  month: ISODate
  today: ISODate
  weekStart: number
  bills: Map<ISODate, BillEntry[]>
  paydays: Map<ISODate, PaydayEntry[]>
  /** What each payday sets aside for savings funds. */
  savings?: ReadonlyMap<ISODate, PaydaySaving[]>
  /** Days that have a note. */
  notes?: ReadonlySet<ISODate>
  /** Entries logged per day (spending, income, savings, debt payments). */
  logged?: ReadonlyMap<ISODate, readonly unknown[]>
  onMonthChange: (delta: -1 | 1 | 0) => void
  onSelectDay: (date: ISODate) => void
}

const EMPTY_SAVINGS: ReadonlyMap<ISODate, PaydaySaving[]> = new Map()
const EMPTY_NOTES: ReadonlySet<ISODate> = new Set()
const EMPTY_LOGGED: ReadonlyMap<ISODate, readonly unknown[]> = new Map()

const ARROWS: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }

/**
 * Month view: a dot for bills, a diamond for debt minimums, a ring for paydays and a dash
 * for a note. Shape, not only colour, tells them apart (PLAN §8), and every day button
 * speaks its full content. What a payday sets aside is spoken and shown in the day sheet,
 * not drawn: it falls on every main payday, so a mark of its own would only add clutter.
 * Keyboard: one Tab stop for the whole month (roving tabindex), arrows move by day and
 * week, Home/End to the week's ends, Page Up/Down by month, as in the ARIA date grid.
 */
export function MonthCalendar({
  month,
  today,
  weekStart,
  bills,
  paydays,
  savings = EMPTY_SAVINGS,
  notes = EMPTY_NOTES,
  logged = EMPTY_LOGGED,
  onMonthChange,
  onSelectDay,
}: MonthCalendarProps) {
  const f = useFormat()
  const { weeks, month: first } = monthGrid(month, weekStart)
  const showingToday = isSameMonth(first, today)
  const dates = weeks.flat()
  const [focusDate, setFocusDate] = useState<ISODate | null>(null)
  const pendingFocus = useRef(false)
  const gridRef = useRef<HTMLDivElement>(null)
  const tabDate =
    focusDate !== null && dates.includes(focusDate) ? focusDate : showingToday ? today : first

  // Runs after the render that shows `focusDate`, which may be a new month.
  useEffect(() => {
    if (!pendingFocus.current || focusDate === null) return
    pendingFocus.current = false
    gridRef.current?.querySelector<HTMLElement>(`[data-date="${focusDate}"]`)?.focus()
  }, [focusDate, first])

  function onDayKey(e: KeyboardEvent, date: ISODate) {
    const back = mod(dayOfWeek(date) - weekStart, 7)
    const target =
      e.key in ARROWS
        ? addDays(date, ARROWS[e.key]!)
        : e.key === 'Home'
          ? addDays(date, -back)
          : e.key === 'End'
            ? addDays(date, 6 - back)
            : e.key === 'PageUp'
              ? addMonths(date, -1)
              : e.key === 'PageDown'
                ? addMonths(date, 1)
                : null
    if (target === null) return
    e.preventDefault()
    if (!dates.includes(target)) onMonthChange(target < first ? -1 : 1)
    pendingFocus.current = true
    setFocusDate(target)
  }

  // "Paid" joins the key when some day on the grid shows the grey (all-paid) mark.
  const anyPaid = dates.some((d) => {
    const live = (bills.get(d) ?? []).filter((b) => b.status !== 'skipped')
    const fullyPaid = (list: BillEntry[]) =>
      list.length > 0 && list.every((b) => b.status === 'paid')
    return (
      fullyPaid(live.filter((b) => b.debtId === undefined)) ||
      fullyPaid(live.filter((b) => b.debtId !== undefined))
    )
  })

  return (
    <section aria-label="Calendar" className="card p-4 sm:p-5">
      <div className="mb-2 flex items-center gap-1">
        <h2 className="flex-1 pl-2 text-base font-semibold" aria-live="polite">
          {f.month(first)}
        </h2>
        {!showingToday && (
          <Button variant="text" size="sm" onClick={() => onMonthChange(0)}>
            Today
          </Button>
        )}
        <IconButton icon="back" label="Previous month" onClick={() => onMonthChange(-1)} />
        <IconButton icon="chevron" label="Next month" onClick={() => onMonthChange(1)} />
      </div>

      <div aria-hidden="true" className="grid grid-cols-7 pb-1 text-center text-xs text-muted">
        {weekdayOrder(weekStart).map((d) => (
          <span key={d}>{f.weekday(d, 'narrow')}</span>
        ))}
      </div>

      <div
        ref={gridRef}
        role="group"
        aria-label={f.month(first)}
        className="grid grid-cols-7 gap-y-0.5"
      >
        {dates.map((date) => {
          const live = (bills.get(date) ?? []).filter((b) => b.status !== 'skipped')
          const dayBills = live.filter((b) => b.debtId === undefined)
          const dayDebts = live.filter((b) => b.debtId !== undefined)
          const dayPaydays = paydays.get(date) ?? []
          const saving = (savings.get(date) ?? []).reduce((a, s) => a + s.amount, 0)
          const hasNote = notes.has(date)
          const loggedCount = logged.get(date)?.length ?? 0
          const inMonth = isSameMonth(date, first)
          const isToday = date === today
          const allPaid = (list: BillEntry[]) =>
            list.length > 0 && list.every((b) => b.status === 'paid')
          return (
            <button
              key={date}
              type="button"
              data-date={date}
              tabIndex={date === tabDate ? 0 : -1}
              onClick={() => {
                setFocusDate(date)
                onSelectDay(date)
              }}
              onKeyDown={(e) => onDayKey(e, date)}
              aria-label={calendarDayLabel(date, today, live, dayPaydays.length, f, {
                saving,
                note: hasNote,
                logged: loggedCount,
              })}
              aria-current={isToday ? 'date' : undefined}
              className={cx(
                'relative mx-auto flex h-12 w-full max-w-12 flex-col items-center justify-center rounded-2xl text-body tabular-nums transition-colors',
                'hover:bg-accent-soft/50',
                // Not on today: two text colours on one element would fight in the cascade.
                // Full text-muted, not faded: these days are tappable, so they need AA
                // contrast (axe caught /60). Lighter weight keeps them visually secondary.
                !inMonth && !isToday && 'font-light text-muted',
                isToday && 'bg-accent font-semibold text-accent-contrast hover:bg-accent',
              )}
            >
              <span>{Number(date.slice(8))}</span>
              <span aria-hidden="true" className="flex h-1.5 items-center gap-[3px]">
                {dayBills.length > 0 && (
                  <Marker kind="bill" paid={allPaid(dayBills)} inverse={isToday} />
                )}
                {dayDebts.length > 0 && (
                  <Marker kind="debt" paid={allPaid(dayDebts)} inverse={isToday} />
                )}
                {dayPaydays.length > 0 && <Marker kind="payday" inverse={isToday} />}
                {loggedCount > 0 && <Marker kind="logged" inverse={isToday} />}
                {hasNote && <Marker kind="note" inverse={isToday} />}
              </span>
            </button>
          )
        })}
      </div>

      {/* Only the marks this month uses, so the key stays short. */}
      <div
        aria-hidden="true"
        className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-xs text-muted"
      >
        <span className="inline-flex items-center gap-1.5">
          <Marker kind="bill" size="md" /> Bill
        </span>
        {anyPaid && (
          <span className="inline-flex items-center gap-1.5">
            <Marker kind="bill" size="md" paid /> Paid
          </span>
        )}
        {dates.some((d) => bills.get(d)?.some((b) => b.debtId !== undefined)) && (
          <span className="inline-flex items-center gap-1.5">
            <Marker kind="debt" size="md" /> Debt minimum
          </span>
        )}
        <span className="inline-flex items-center gap-1.5">
          <Marker kind="payday" size="md" /> Payday
        </span>
        {dates.some((d) => (logged.get(d)?.length ?? 0) > 0) && (
          <span className="inline-flex items-center gap-1.5">
            <Marker kind="logged" size="md" /> Logged
          </span>
        )}
        {dates.some((d) => notes.has(d)) && (
          <span className="inline-flex items-center gap-1.5">
            <Marker kind="note" size="md" /> Note
          </span>
        )}
      </div>
    </section>
  )
}
