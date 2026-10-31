import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { monthGrid, weekdayOrder, isSameMonth } from '../../domain/calendar'
import type { BillEntry, PaydayEntry } from '../../domain/bills'
import { addDays, addMonths, dayOfWeek, mod } from '../../domain/dates'
import type { ISODate } from '../../domain/types'
import { cx } from '../../ui/cx'
import { Icon } from '../../ui/Icon'
import { calendarDayLabel } from './describe'
import { useFormat } from './format'

interface MonthCalendarProps {
  /** Any date in the month shown. */
  month: ISODate
  today: ISODate
  weekStart: number
  bills: Map<ISODate, BillEntry[]>
  paydays: Map<ISODate, PaydayEntry[]>
  onMonthChange: (delta: -1 | 1 | 0) => void
  onSelectDay: (date: ISODate) => void
}

const ARROWS: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }

/**
 * Month view with a dot per day that has bills and a ring for paydays. Shape, not only
 * colour, tells them apart (PLAN §8), and every day button speaks its full content.
 * Keyboard: one Tab stop for the whole month (roving tabindex), arrows move by day and
 * week, Home/End to the week's ends, Page Up/Down by month, as in the ARIA date grid.
 */
export function MonthCalendar({
  month,
  today,
  weekStart,
  bills,
  paydays,
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

  return (
    <section aria-label="Calendar" className="card p-4 sm:p-5">
      <div className="mb-2 flex items-center gap-1">
        <h2 className="flex-1 pl-2 text-base font-semibold" aria-live="polite">
          {f.month(first)}
        </h2>
        {!showingToday && (
          <button
            type="button"
            onClick={() => onMonthChange(0)}
            className="min-h-11 rounded-full px-3 text-sm font-medium text-accent hover:bg-accent-soft/60"
          >
            Today
          </button>
        )}
        <button
          type="button"
          onClick={() => onMonthChange(-1)}
          aria-label="Previous month"
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-muted hover:bg-accent-soft/60 hover:text-text"
        >
          <Icon name="back" size={20} />
        </button>
        <button
          type="button"
          onClick={() => onMonthChange(1)}
          aria-label="Next month"
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-muted hover:bg-accent-soft/60 hover:text-text"
        >
          <Icon name="chevron" size={20} />
        </button>
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
          const dayBills = (bills.get(date) ?? []).filter((b) => b.status !== 'skipped')
          const dayPaydays = paydays.get(date) ?? []
          const inMonth = isSameMonth(date, first)
          const isToday = date === today
          const allPaid = dayBills.length > 0 && dayBills.every((b) => b.status === 'paid')
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
              aria-label={calendarDayLabel(date, today, dayBills, dayPaydays.length, f)}
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
              <span aria-hidden="true" className="flex h-1.5 items-center gap-1">
                {dayBills.length > 0 && (
                  <span
                    className={cx(
                      'h-1.5 w-1.5 rounded-full',
                      isToday ? 'bg-accent-contrast' : allPaid ? 'bg-muted/50' : 'bg-accent',
                    )}
                  />
                )}
                {dayPaydays.length > 0 && (
                  <span
                    className={cx(
                      'h-1.5 w-1.5 rounded-full border-[1.5px]',
                      isToday ? 'border-accent-contrast' : 'border-text',
                    )}
                  />
                )}
              </span>
            </button>
          )
        })}
      </div>

      <div
        aria-hidden="true"
        className="mt-3 flex items-center justify-center gap-5 text-xs text-muted"
      >
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" /> Bill
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full border-[1.5px] border-text" /> Payday
        </span>
      </div>
    </section>
  )
}
