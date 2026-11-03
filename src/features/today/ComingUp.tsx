import { useMemo } from 'react'
import { useUndoToast } from '../../app/useUndoToast'
import { useNotes } from '../../db/hooks'
import { markDue, markPaid, setNoteDone } from '../../db/repos'
import { billEntriesBetween, paydayEntriesBetween } from '../../domain/bills'
import { addDays } from '../../domain/dates'
import type { ISODate } from '../../domain/types'
import { cx } from '../../ui/cx'
import { Icon } from '../../ui/Icon'
import { useFormat } from '../bills/format'
import { useBillsData } from '../bills/useBillsData'
import { Header, useShortDay } from './Dashboard'

const SHOW = 5
// Far enough to always reach the next monthly payday, short enough to stay "coming up".
const LOOKAHEAD_DAYS = 45
// Unpaid bills from the last two weeks stay at the top until ticked.
const LOOKBACK_DAYS = 14

type Item =
  | {
      key: string
      kind: 'bill'
      date: ISODate
      name: string
      amount: number
      billId: string
      originalDate: ISODate
      paid: boolean
      debt: boolean
      autopay: boolean
    }
  | { key: string; kind: 'payday'; date: ISODate; name: string; amount: number }
  | { key: string; kind: 'note'; date: ISODate; name: string; id: string; done: boolean }

// The dot says what a row is at a glance; the same words are there for screen readers,
// and paydays also carry their own icon and a "+", so colour is never the only cue.
const DOT = {
  bill: 'bg-accent',
  debt: 'bg-(--env-ocean)',
  payday: 'bg-(--env-sage)',
  note: 'bg-muted',
} as const

function kindOf(item: Item): keyof typeof DOT {
  return item.kind === 'bill' ? (item.debt ? 'debt' : 'bill') : item.kind
}

function kindWords(item: Item): string {
  if (item.kind === 'payday') return 'Payday'
  if (item.kind === 'note') return 'Note'
  return [item.debt ? 'Debt minimum' : 'Bill', item.autopay && 'Autopay'].filter(Boolean).join(', ')
}

/**
 * The next few dated things: bills, debt minimums, paydays and day notes, with a tick box
 * for the ones you act on. Ticking a bill marks it paid; that never changes safe to spend,
 * which already counted it. Unpaid bills from the last two weeks come first.
 */
export function ComingUp({ today }: { today: ISODate }) {
  const f = useFormat()
  const shortDay = useShortDay()
  const undoToast = useUndoToast()
  const data = useBillsData(today)
  const notes = useNotes()
  const { bills, occurrences, incomes, paydayOverrides, loaded } = data

  const items = useMemo<Item[]>(() => {
    if (!loaded || !notes) return []
    const to = addDays(today, LOOKAHEAD_DAYS)
    const billItems: Item[] = billEntriesBetween(
      bills,
      occurrences,
      addDays(today, -LOOKBACK_DAYS),
      to,
    )
      .filter((e) => e.status !== 'skipped' && (e.date >= today || e.status === 'due'))
      .map((e) => ({
        key: `b|${e.billId}|${e.originalDate}`,
        kind: 'bill',
        date: e.date,
        name: e.name,
        amount: e.amount,
        billId: e.billId,
        originalDate: e.originalDate,
        paid: e.status === 'paid',
        debt: e.debtId !== undefined,
        autopay: e.autopay,
      }))
    const payItems: Item[] = paydayEntriesBetween(incomes, paydayOverrides, today, to).map((p) => ({
      key: `p|${p.incomeId}|${p.nominal}`,
      kind: 'payday',
      date: p.date,
      name: p.name,
      amount: p.amount,
    }))
    const noteItems: Item[] = notes
      .filter((n) => n.date !== undefined && n.date >= today && n.date < to)
      .map((n) => ({
        key: `n|${n.id}`,
        kind: 'note',
        date: n.date!,
        name: n.text.split('\n')[0]!,
        id: n.id,
        done: n.doneAt !== undefined,
      }))
    const rank = (i: Item) => (i.kind === 'note' ? 0 : i.kind === 'bill' ? 1 : 2)
    return [...billItems, ...payItems, ...noteItems]
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : rank(a) - rank(b)))
      .slice(0, SHOW)
  }, [loaded, notes, bills, occurrences, incomes, paydayOverrides, today])

  // Wait for every source, so the empty state never flashes before the rows arrive.
  if (!loaded || !notes) return null

  async function toggle(item: Item) {
    if (item.kind === 'bill') {
      if (item.paid) await markDue(item.billId, item.originalDate)
      else await markPaid(item.billId, item.originalDate, item.amount)
      undoToast(item.paid ? `${item.name} back to due` : `${item.name} paid`)
    } else if (item.kind === 'note') {
      await setNoteDone(item.id, !item.done)
      undoToast(item.done ? 'Unticked' : 'Ticked off')
    }
  }

  return (
    <section aria-labelledby="coming-up" className="space-y-4">
      <Header id="coming-up" title="Coming up" to="/bills" cta="Open calendar" />
      {items.length === 0 ? (
        <p className="card-quiet px-6 py-5 text-body text-muted">
          Nothing dated in the next few weeks. Bills, paydays and notes you add on the calendar show
          up here.
        </p>
      ) : (
        <ul className="card divide-y divide-line px-5 py-3 sm:px-7 sm:py-5">
          {items.map((item) => {
            const pay = item.kind === 'payday'
            const done = item.kind === 'bill' ? item.paid : item.kind === 'note' && item.done
            const overdue = item.kind === 'bill' && !item.paid && item.date < today
            const when = item.date === today ? 'Today' : shortDay(item.date)
            return (
              <li key={item.key} className="flex min-h-12 items-center py-0.5">
                <span
                  className={cx(
                    'w-16 shrink-0 text-sm tabular-nums',
                    overdue ? 'font-semibold text-text' : 'font-medium text-muted',
                  )}
                >
                  {when}
                  {overdue && <span className="sr-only"> (overdue)</span>}
                </span>
                {pay ? (
                  <span
                    aria-hidden="true"
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center text-accent"
                  >
                    <Icon name="payday" size={20} />
                  </span>
                ) : (
                  // The box is 22px to look at; the label around it is the 44px target.
                  <label className="relative inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center">
                    <input
                      type="checkbox"
                      checked={done}
                      onChange={() => void toggle(item)}
                      aria-label={`${item.name}, ${when}: ${done ? 'done' : 'mark done'}`}
                      className="peer h-[1.375rem] w-[1.375rem] cursor-pointer appearance-none rounded-md border-[1.5px] border-[color-mix(in_oklab,var(--muted)_70%,var(--surface))] bg-surface transition-colors checked:border-accent checked:bg-accent"
                    />
                    <Icon
                      name="check"
                      size={15}
                      strokeWidth={2.6}
                      aria-hidden="true"
                      className="pointer-events-none absolute hidden text-accent-contrast peer-checked:block"
                    />
                  </label>
                )}
                <span
                  aria-hidden="true"
                  className={cx('mr-3 ml-1 h-2 w-2 shrink-0 rounded-full', DOT[kindOf(item)])}
                />
                <span
                  className={cx(
                    'relative min-w-0 flex-1 truncate text-base',
                    done && 'text-muted line-through',
                  )}
                >
                  {item.name}
                  <span className="sr-only">, {kindWords(item)}</span>
                </span>
                {item.kind !== 'note' && (
                  <span
                    className={cx(
                      'ml-3 shrink-0 font-display text-[1.0625rem] font-semibold whitespace-nowrap',
                      pay && 'text-accent',
                      done && 'text-muted',
                    )}
                  >
                    {pay ? '+' : ''}
                    {f.money(item.amount)}
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
