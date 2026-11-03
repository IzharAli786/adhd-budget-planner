import { useLayoutEffect, useRef, type KeyboardEvent } from 'react'
import { Link } from 'react-router'
import { cx } from '../../ui/cx'
import { Icon } from '../../ui/Icon'

export interface MonthTab {
  /** 'YYYY-MM' */
  key: string
  /** "Nov" */
  short: string
  /** "November" */
  long: string
}

export const tabId = (key: string) => `envelopes-tab-${key}`
export const PANEL_ID = 'envelopes-month'

/**
 * Twelve tabs, one per month of this year, then "Year" for the yearly review. Arrow keys,
 * Home and End move between months (roving tabindex). On a phone the row scrolls inside
 * itself, never the page, and starts with the chosen month in view.
 */
export function MonthTabs({
  months,
  value,
  current,
  onChange,
}: {
  months: readonly MonthTab[]
  value: string
  /** Today's month: a dot, and aria-current for screen readers. */
  current: string
  onChange: (key: string) => void
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const index = months.findIndex((m) => m.key === value)

  // Bring the chosen month into view without scrolling the page itself.
  useLayoutEffect(() => {
    const box = scroller.current
    const tab = box && (document.getElementById(tabId(value)) as HTMLElement | null)
    if (!box || !tab || box.scrollWidth <= box.clientWidth) return
    box.scrollLeft = tab.offsetLeft - (box.clientWidth - tab.offsetWidth) / 2
  }, [value])

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const last = months.length - 1
    const next =
      e.key === 'ArrowRight'
        ? Math.min(last, index + 1)
        : e.key === 'ArrowLeft'
          ? Math.max(0, index - 1)
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? last
              : null
    if (next === null) return
    e.preventDefault()
    const key = months[next]!.key
    onChange(key)
    document.getElementById(tabId(key))?.focus()
  }

  return (
    <div
      ref={scroller}
      className="card-quiet flex overflow-x-auto rounded-full p-1 [scrollbar-width:thin]"
    >
      <div role="tablist" aria-label="Months" onKeyDown={onKeyDown} className="flex flex-1 gap-0.5">
        {months.map((m, i) => {
          const selected = m.key === value
          return (
            <button
              key={m.key}
              id={tabId(m.key)}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={PANEL_ID}
              tabIndex={i === index ? 0 : -1}
              aria-current={m.key === current ? 'date' : undefined}
              onClick={() => onChange(m.key)}
              className={cx(
                'relative inline-flex min-h-11 min-w-13 flex-1 shrink-0 items-center justify-center rounded-full px-3 text-sm font-medium whitespace-nowrap transition-colors',
                selected
                  ? 'bg-surface font-semibold text-text shadow-card ring-1 ring-line'
                  : 'text-muted hover:text-text',
              )}
            >
              <span aria-hidden="true">{m.short}</span>
              <span className="sr-only">{m.long}</span>
              {m.key === current && (
                <span
                  aria-hidden="true"
                  className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-accent"
                />
              )}
            </button>
          )
        })}
      </div>
      <span aria-hidden="true" className="mx-1 my-2.5 w-px shrink-0 bg-line" />
      <Link
        to="/review"
        className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium whitespace-nowrap text-accent hover:bg-accent-soft/60"
      >
        <Icon name="history" size={16} />
        Year
      </Link>
    </div>
  )
}
