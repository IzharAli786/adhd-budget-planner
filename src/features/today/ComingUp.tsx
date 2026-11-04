import { useMemo } from 'react'
import { useUndoToast } from '../../app/useUndoToast'
import { useNotes } from '../../db/hooks'
import { markDue, markPaid, setNoteDone } from '../../db/repos'
import { billEntriesBetween, paydayEntriesBetween } from '../../domain/bills'
import { addDays } from '../../domain/dates'
import type { ISODate } from '../../domain/types'
import { Checkbox } from '../../ui/Checkbox'
import { cx } from '../../ui/cx'
import { Icon } from '../../ui/Icon'
import { Marker, type MarkerKind } from '../../ui/Marker'
import { BILL_STATUS, StatusBadge } from '../../ui/status'
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

// The marker's shape says what a row is at a glance (dot bill, diamond debt, ring payday,
// dash note); the same words are there in text, and paydays also carry their own icon and
// a "+", so colour is never the only cue.
function markerOf(item: Item): MarkerKind {
  return item.kind === 'bill' ? (item.debt ? 'debt' : 'bill') : item.kind
}

/** The kind of row for screen readers, where no badge says it already. */
function kindWord(item: Item): string | null {
  if (item.kind === 'payday') return 'Payday'
  if (item.kind === 'note') return 'Note'
  return item.debt ? null : 'Bill'
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
      if (item.paid) undoToast(`${item.name} back to due`)
      else undoToast(`${item.name} paid`, { tone: 'success' })
    } else if (item.kind === 'note') {
      await setNoteDone(item.id, !item.done)
      if (item.done) undoToast('Unticked')
      else undoToast('Ticked off', { tone: 'success' })
    }
  }

  return (
    <section aria-labelledby="coming-up" className="space-y-3">
      <Header id="coming-up" title="Coming up" to="/bills" cta="Open calendar" />
      {items.length === 0 ? (
        <p className="card-quiet px-6 py-5 text-body text-muted">
          Nothing dated in the next few weeks. Bills, paydays and notes you add on the calendar show
          up here.
        </p>
      ) : (
        <ul className="card divide-y divide-line px-5 py-2 @xl/today:px-6 @xl/today:py-5">
          {items.map((item) => {
            const pay = item.kind === 'payday'
            const done = item.kind === 'bill' ? item.paid : item.kind === 'note' && item.done
            const overdue = item.kind === 'bill' && !item.paid && item.date < today
            const when = item.date === today ? 'Today' : shortDay(item.date)
            const word = kindWord(item)
            return (
              <li key={item.key} className="flex min-h-11 items-center">
                <span
                  className={cx(
                    'w-16 shrink-0 text-caption leading-tight tabular-nums',
                    overdue ? 'font-semibold text-tone-attention' : 'font-medium text-muted',
                  )}
                >
                  {when}
                </span>
                {pay ? (
                  <span
                    aria-hidden="true"
                    className="inline-flex size-11 shrink-0 items-center justify-center text-tone-success"
                  >
                    <Icon name="payday" size={20} />
                  </span>
                ) : (
                  // The box is 20px to look at; the label around it is the 44px target. Its
                  // name stays the same ticked or not: the checked state speaks for itself.
                  <Checkbox
                    tone="success"
                    checked={done}
                    onCheckedChange={() => void toggle(item)}
                    aria-label={`${item.name}, ${when}`}
                  />
                )}
                {/* A fixed slot, so names line up whatever the marker's shape. */}
                <span className="mr-3 ml-1 flex w-2.5 shrink-0 justify-center">
                  <Marker
                    size="md"
                    kind={markerOf(item)}
                    paid={item.kind === 'bill' && item.paid}
                  />
                </span>
                {/* The name gives way first; badges stay whole and drop under it if need be. */}
                <span className="relative flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 py-1.5">
                  <span className={cx('relative min-w-0 truncate text-body', done && 'text-muted')}>
                    {item.name}
                    {word && <span className="sr-only">, {word}</span>}
                  </span>
                  {overdue && <StatusBadge status={BILL_STATUS.overdue} />}
                  {item.kind === 'bill' && item.debt && (
                    <>
                      {/* Wide: the badge. Narrow: the diamond marker, and the word for readers. */}
                      <span className="hidden @xl/today:inline-flex">
                        <StatusBadge status={BILL_STATUS.debtMinimum} />
                      </span>
                      <span className="sr-only @xl/today:hidden">, Debt minimum</span>
                    </>
                  )}
                  {item.kind === 'bill' && item.autopay && (
                    <>
                      <span className="hidden @xl/today:inline-flex">
                        <StatusBadge status={BILL_STATUS.autopay} />
                      </span>
                      <span className="relative inline-flex shrink-0 text-muted @xl/today:hidden">
                        <Icon name="repeat" size={14} />
                        <span className="sr-only">, Autopay</span>
                      </span>
                    </>
                  )}
                </span>
                {item.kind !== 'note' && (
                  <span
                    className={cx(
                      'ml-3 shrink-0 amount text-base whitespace-nowrap',
                      pay && 'text-tone-success',
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
