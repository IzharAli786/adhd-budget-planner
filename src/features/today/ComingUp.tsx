import { useMemo } from 'react'
import { Link } from 'react-router'
import { billEntriesBetween, paydayEntriesBetween } from '../../domain/bills'
import { addDays, dayOfWeek } from '../../domain/dates'
import type { ISODate } from '../../domain/types'
import { cx } from '../../ui/cx'
import { Icon } from '../../ui/Icon'
import { SectionHeader } from '../../ui/Section'
import { useFormat } from '../bills/format'
import { useBillsData } from '../bills/useBillsData'

const SHOW = 3
// Far enough to always reach the next monthly payday, short enough to stay "coming up".
const LOOKAHEAD_DAYS = 45

interface Item {
  key: string
  date: ISODate
  name: string
  amount: number
  kind: 'bill' | 'payday'
  autopay?: boolean
}

/**
 * The next few dated things, bills and paydays together, read-only. A glance, not a
 * to-do list: no checkboxes, no overdue red. Acting on a bill happens on Bills.
 */
export function ComingUp({ today }: { today: ISODate }) {
  const f = useFormat()
  const data = useBillsData(today)
  const { bills, occurrences, incomes, paydayOverrides, loaded } = data

  const items = useMemo<Item[]>(() => {
    if (!loaded) return []
    const to = addDays(today, LOOKAHEAD_DAYS)
    const billItems: Item[] = billEntriesBetween(bills, occurrences, today, to)
      .filter((e) => e.status === 'due')
      .map((e) => ({
        key: `b|${e.billId}|${e.originalDate}`,
        date: e.date,
        name: e.name,
        amount: e.amount,
        kind: 'bill',
        autopay: e.autopay,
      }))
    const payItems: Item[] = paydayEntriesBetween(incomes, paydayOverrides, today, to).map((p) => ({
      key: `p|${p.incomeId}|${p.nominal}`,
      date: p.date,
      name: p.name,
      amount: p.amount,
      kind: 'payday',
    }))
    // Stable sort keeps paydays after bills on the same day: money out, then money in.
    return [...billItems, ...payItems]
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
      .slice(0, SHOW)
  }, [loaded, bills, occurrences, incomes, paydayOverrides, today])

  if (!loaded || items.length === 0) return null

  return (
    <section aria-labelledby="coming-up" className="space-y-2">
      <SectionHeader
        id="coming-up"
        title="Coming up"
        aside={
          <Link
            to="/bills"
            className="-my-3 inline-flex min-h-11 items-center gap-1 rounded-full px-2 font-medium text-accent hover:bg-accent-soft/60"
          >
            All bills
            <Icon name="arrowRight" size={14} />
          </Link>
        }
      />
      <ul className="card-quiet divide-y divide-line overflow-hidden">
        {items.map((item) => {
          const pay = item.kind === 'payday'
          return (
            <li key={item.key} className="flex min-h-14 items-center gap-3 px-4 py-2.5">
              <span className="flex w-10 shrink-0 flex-col items-center leading-tight">
                <span className="text-[0.6875rem] font-medium tracking-wide text-muted uppercase">
                  {f.weekday(dayOfWeek(item.date))}
                </span>
                <span className="font-semibold tabular-nums">{Number(item.date.slice(8))}</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{item.name}</span>
                <span className="block text-caption text-muted">
                  {pay
                    ? `Payday · ${f.relative(item.date, today)}`
                    : capitalize(f.relative(item.date, today)) + (item.autopay ? ' · autopay' : '')}
                </span>
              </span>
              <span className={cx('shrink-0 font-medium tabular-nums', pay && 'text-accent')}>
                {pay ? '+' : ''}
                {f.money(item.amount)}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
