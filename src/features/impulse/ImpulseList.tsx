import { useState, type FormEvent } from 'react'
import { useUndoToast } from '../../app/useUndoToast'
import { useImpulse } from '../../db/hooks'
import { addImpulse, decideImpulse, deleteImpulse, waitAgain } from '../../db/repos'
import {
  countdownLabel,
  msLeft,
  readyItems,
  savedByWaiting,
  waitingItems,
} from '../../domain/impulse'
import type { Cents, ImpulseItem } from '../../domain/types'
import { todayISO } from '../../lib/clock'
import { useNow } from '../../lib/useNow'
import { Button } from '../../ui/Button'
import { Field, inputClass } from '../../ui/Field'
import { Icon } from '../../ui/Icon'
import { IconButton } from '../../ui/IconButton'
import { MoneyInput } from '../../ui/MoneyInput'
import { Notice } from '../../ui/Notice'
import { useToast } from '../../ui/Toast'
import { useFormat } from '../bills/format'
import { useQuickAdd } from '../quickadd/QuickAddProvider'

/**
 * The 48-hour list: write it down, wait, then decide with a clear head. Shared by More
 * (Simple mode) and Goals (Full mode), so both read the same rows.
 */
export function ImpulseList() {
  const items = useImpulse()
  const now = useNow()
  const f = useFormat()
  if (!items)
    return <div aria-hidden="true" className="h-40 animate-pulse rounded-3xl bg-surface" />

  const ready = readyItems(items, now)
  const waiting = waitingItems(items, now)
  const saved = savedByWaiting(items)

  return (
    <div className="space-y-5">
      {ready.length > 0 && <ReadyCard items={ready} />}
      <AddForm />
      {waiting.length > 0 && (
        <section aria-labelledby="impulse-waiting" className="space-y-2">
          <h3 id="impulse-waiting" className="px-1 eyebrow text-muted">
            Waiting
          </h3>
          <ul className="card divide-y divide-line overflow-hidden">
            {waiting.map((item) => (
              <WaitingRow key={item.id} item={item} left={countdownLabel(msLeft(item, now))} />
            ))}
          </ul>
        </section>
      )}
      {saved > 0 && (
        <Notice tone="success" icon="leaf">
          <p>
            <span className="font-semibold tabular-nums">{f.money(saved)}</span> saved by waiting.
          </p>
        </Notice>
      )}
    </div>
  )
}

function AddForm() {
  const f = useFormat()
  const [name, setName] = useState('')
  const [amount, setAmount] = useState<Cents | null>(null)
  // MoneyInput keeps its own text; a new key clears it after each add.
  const [round, setRound] = useState(0)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim() || !amount) return
    await addImpulse({ name: name.trim(), amount })
    setName('')
    setAmount(null)
    setRound((r) => r + 1)
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="card space-y-4 p-5">
      <p className="text-body text-muted">
        Want something? Add it here and give it 48 hours. If you still want it then, go for it.
      </p>
      <Field id="impulse-name" label="What is it?">
        <input
          id="impulse-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="off"
          placeholder="Headphones"
          className={inputClass}
        />
      </Field>
      <MoneyInput
        key={round}
        label="About how much?"
        value={amount}
        onChange={setAmount}
        symbol={f.symbol}
        decimals={f.decimals}
      />
      <Button type="submit" block icon="clock" disabled={!name.trim() || !amount}>
        Start the 48 hours
      </Button>
    </form>
  )
}

function WaitingRow({ item, left }: { item: ImpulseItem; left: string }) {
  const f = useFormat()
  const undoToast = useUndoToast()
  return (
    <li className="flex min-h-14 items-center gap-3 py-2 pr-2 pl-4">
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{item.name}</span>
        <span className="flex items-center gap-1 text-sm text-muted">
          <Icon name="clock" size={14} className="shrink-0" />
          {left}
        </span>
      </span>
      <span className="font-medium tabular-nums">{f.money(item.amount)}</span>
      <IconButton
        icon="close"
        tone="danger"
        size="sm"
        label={`Remove ${item.name}`}
        onClick={() => void deleteImpulse(item.id).then(() => undoToast('Removed'))}
      />
    </li>
  )
}

function ReadyCard({ items }: { items: ImpulseItem[] }) {
  const f = useFormat()
  const toast = useToast()
  const undoToast = useUndoToast()
  const { save } = useQuickAdd()
  const ids = items.map((i) => i.id)

  function bought(item: ImpulseItem) {
    void decideImpulse([item.id], 'bought').then(() =>
      toast.show({
        message: `Enjoy it. Log ${f.money(item.amount)} as spending?`,
        duration: 10_000,
        action: {
          label: 'Log it',
          onAction: () => void save({ amount: -item.amount, note: item.name, date: todayISO() }),
        },
      }),
    )
  }

  return (
    <section
      aria-labelledby="impulse-ready"
      className="animate-fade-in space-y-4 rounded-3xl bg-tone-progress-bg p-5 ring-1 ring-tone-progress-line ring-inset"
    >
      <div>
        <p className="flex items-center gap-1.5 eyebrow text-tone-progress">
          <Icon name="clock" size={14} className="shrink-0" />
          48 hours are up
        </p>
        <h3 id="impulse-ready" className="mt-1 text-lg font-medium">
          Still want {items.length === 1 ? 'it' : 'them'}?
        </h3>
      </div>
      <ul className="space-y-3">
        {items.map((item) => (
          <li key={item.id} className="rounded-2xl bg-surface p-4 ring-1 ring-line">
            <p className="flex justify-between gap-3">
              <span className="min-w-0 truncate font-medium">{item.name}</span>
              <span className="font-medium tabular-nums">{f.money(item.amount)}</span>
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() =>
                  void decideImpulse([item.id], 'skipped').then(() =>
                    undoToast(`Skipped. ${f.money(item.amount)} saved by waiting.`),
                  )
                }
              >
                Skip it
              </Button>
              <Button variant="secondary" onClick={() => bought(item)}>
                Bought it
              </Button>
              <Button
                variant="quiet"
                onClick={() =>
                  void waitAgain([item.id]).then(() => undoToast('Asking again in 48 hours'))
                }
              >
                Later
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {items.length > 1 && (
        // Batch decisions (PLAN §1): coming back to five expired items should take one tap.
        <div className="flex flex-wrap gap-2 border-t border-tone-progress-line pt-4">
          <Button
            onClick={() =>
              void decideImpulse(ids, 'skipped').then(() =>
                undoToast(
                  `Skipped ${items.length}. ${f.money(items.reduce((a, i) => a + i.amount, 0))} saved by waiting.`,
                ),
              )
            }
          >
            Skip all {items.length}
          </Button>
          <Button
            variant="quiet"
            onClick={() => void waitAgain(ids).then(() => undoToast('Asking again in 48 hours'))}
          >
            Ask me later
          </Button>
        </div>
      )}
    </section>
  )
}
