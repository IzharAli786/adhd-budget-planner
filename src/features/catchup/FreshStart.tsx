import { useId, useState } from 'react'
import { useUndoToast } from '../../app/useUndoToast'
import { applyFreshStart, recordCarryOver } from '../../db/repos'
import type { BillEntry } from '../../domain/bills'
import type { FreshStart as FreshStartPlan } from '../../domain/catchUp'
import { occurrenceId, type Cents, type ISODate } from '../../domain/types'
import { Button } from '../../ui/Button'
import { Chip } from '../../ui/Chip'
import { Icon } from '../../ui/Icon'
import { MoneyInput } from '../../ui/MoneyInput'
import { useFormat } from '../bills/format'

const keyOf = (e: BillEntry) => occurrenceId(e.billId, e.originalDate)
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const pick = (e: BillEntry, auto: boolean) => ({
  billId: e.billId,
  originalDate: e.originalDate,
  amount: e.amount,
  auto,
})

interface Props {
  gap: FreshStartPlan
  today: ISODate
  /** Done or set aside: Today goes back to normal. */
  onDone: () => void
}

/**
 * Fresh start after more than a week away (PLAN §4.5). One number absorbs the whole
 * gap: no reconstructing what was spent, no invented transactions. The screen talks in
 * counts; the bill list only appears if the user asks to pick exceptions.
 */
export function FreshStart({ gap, today, onDone }: Props) {
  const f = useFormat()
  const undoToast = useUndoToast()
  const id = useId()
  const [amount, setAmount] = useState<Cents | null>(null)
  const [negative, setNegative] = useState(false)
  const [tried, setTried] = useState(false)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const [picking, setPicking] = useState(false)
  // "Mark all paid" is the default; the user unticks the ones that didn't go out.
  const [notYet, setNotYet] = useState<ReadonlySet<string>>(new Set())

  const { autoPaid, ask, archive } = gap
  const paidManual = ask.filter((e) => !notYet.has(keyOf(e)))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setTried(true)
    if (amount === null) return
    setSaving(true)
    setFailed(false)
    try {
      await applyFreshStart({
        balance: negative ? -amount : amount,
        date: today,
        paid: [...autoPaid.map((b) => pick(b, true)), ...paidManual.map((b) => pick(b, false))],
        archive,
      })
    } catch {
      // One transaction: nothing was written, so trying again is safe.
      setFailed(true)
      return
    } finally {
      setSaving(false)
    }
    // A fresh start usually spans a payday: keep what was carried in for Look back.
    void recordCarryOver(today).catch(() => {})
    undoToast('Welcome back. You’re all caught up.')
    onDone()
  }

  return (
    <section aria-labelledby="fresh-start" className="card animate-fade-in p-6">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">
        <Icon name="sparkle" size={24} />
      </span>
      <h2 id="fresh-start" className="mt-4 text-xl font-semibold">
        Welcome back. Let’s just update one number.
      </h2>
      <p className="mt-1 text-body text-muted">
        What’s in your account right now? Whatever happened while you were away is already in it, so
        there’s nothing to fill in.
      </p>

      <form onSubmit={(e) => void submit(e)} className="mt-5 space-y-4" noValidate>
        <MoneyInput
          id={id}
          label="Balance"
          value={amount}
          onChange={setAmount}
          symbol={f.symbol}
          decimals={f.decimals}
          error={tried && amount === null ? 'Enter your balance, like 842.50' : undefined}
        />
        <Chip selected={negative} onClick={() => setNegative((n) => !n)}>
          It’s below zero (overdrawn)
        </Chip>

        {(autoPaid.length > 0 || ask.length > 0 || archive.length > 0) && (
          <ul className="space-y-1.5 rounded-2xl bg-accent-soft/50 p-4 text-body">
            {autoPaid.length > 0 && (
              <Line>
                {plural(autoPaid.length, 'autopay bill', 'autopay bills')} will be marked paid
              </Line>
            )}
            {ask.length > 0 && (
              <Line>
                {paidManual.length === ask.length
                  ? `${plural(ask.length, 'other bill', 'other bills')} will be marked paid`
                  : `${paidManual.length} of ${ask.length} other bills will be marked paid`}
              </Line>
            )}
            {archive.length > 0 && (
              <Line>
                {plural(archive.length, 'item', 'items')} from your 48h list will be tucked away
              </Line>
            )}
          </ul>
        )}

        {ask.length > 0 && !picking && (
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="-mx-1 min-h-11 rounded-full px-1 text-body font-medium text-accent"
          >
            Some didn’t go out?
          </button>
        )}
        {picking && (
          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-medium">Untick any that are still to pay</legend>
            <ul className="divide-y divide-line rounded-2xl ring-1 ring-line">
              {ask.map((e) => {
                const k = keyOf(e)
                const out = !notYet.has(k)
                return (
                  <li key={k} className="flex items-center gap-3 px-4 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{e.name}</span>
                      <span className="block text-sm text-muted tabular-nums">
                        {f.money(e.amount)} · {f.day(e.date)}
                      </span>
                    </span>
                    <Chip
                      selected={out}
                      aria-label={`${e.name} paid`}
                      onClick={() =>
                        setNotYet((s) => {
                          const n = new Set(s)
                          if (out) n.add(k)
                          else n.delete(k)
                          return n
                        })
                      }
                    >
                      {out && <Icon name="check" size={16} />}
                      {out ? 'Paid' : 'Not yet'}
                    </Chip>
                  </li>
                )
              })}
            </ul>
          </fieldset>
        )}

        {failed && (
          <p role="alert" className="text-body text-muted">
            That didn’t save. Nothing changed, so you can try again.
          </p>
        )}
        <div className="flex flex-col gap-2 pt-1">
          <Button type="submit" block size="lg" disabled={saving}>
            Update and carry on
          </Button>
          <Button variant="ghost" block className="text-muted" onClick={onDone}>
            Not now
          </Button>
        </div>
      </form>
    </section>
  )
}

function Line({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2.5">
      <Icon name="check" size={18} className="shrink-0 text-accent" />
      <span className="tabular-nums">{children}</span>
    </li>
  )
}
