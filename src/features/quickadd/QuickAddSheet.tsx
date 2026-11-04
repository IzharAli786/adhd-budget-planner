import { useEffect, useId, useState } from 'react'
import { useAppSettings } from '../../app/SettingsProvider'
import { useEnvelopes, useRecentTransactions } from '../../db/hooks'
import { addDays } from '../../domain/dates'
import type { Cents } from '../../domain/money'
import { frequentEntries, suggestEnvelope, type QuickAddKind } from '../../domain/quickAdd'
import type { Id, ISODate } from '../../domain/types'
import { todayISO } from '../../lib/clock'
import { useToday } from '../../lib/useToday'
import { Button } from '../../ui/Button'
import { Chip } from '../../ui/Chip'
import { DateInput } from '../../ui/DateInput'
import { EnvelopeDot } from '../../ui/EnvelopeDot'
import { Field, inputClass } from '../../ui/Field'
import { MoneyInput } from '../../ui/MoneyInput'
import { Segmented } from '../../ui/Segmented'
import { Sheet } from '../../ui/Sheet'
import { useFormat } from '../bills/format'
import { useQuickAdd } from './QuickAddProvider'

const KINDS = [
  { value: 'spend', label: 'Spent' },
  { value: 'income', label: 'Got money' },
] as const

type Day = 'today' | 'yesterday' | ISODate

const resolveDay = (day: Day, today: ISODate): ISODate =>
  day === 'today' ? today : day === 'yesterday' ? addDays(today, -1) : day

/** Floating + and the `n` key open this: amount first, everything else optional. */
export function QuickAddSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Track spending">
      {/* Mounted only while open, so every opening starts from a clean form. */}
      {open && <QuickAddForm onDone={onClose} />}
    </Sheet>
  )
}

function QuickAddForm({ onDone }: { onDone: () => void }) {
  const f = useFormat()
  const today = useToday()
  const { settings } = useAppSettings()
  const { save } = useQuickAdd()
  const recent = useRecentTransactions(200)
  const envelopes = useEnvelopes()
  const amountId = useId()
  const noteId = useId()
  const [amount, setAmount] = useState<Cents | null>(null)
  const [kind, setKind] = useState<QuickAddKind>('spend')
  const [note, setNote] = useState('')
  // 'today' / 'yesterday' stay RELATIVE until save: a sheet opened at 23:58 and saved
  // at 00:01 logs on the new day, like the chip it shows. Only a picked date is fixed.
  const [day, setDay] = useState<Day>('today')
  const [pickDate, setPickDate] = useState(false)
  const [envelopeId, setEnvelopeId] = useState<Id | null>(null)
  const [tried, setTried] = useState(false)
  const [saving, setSaving] = useState(false)

  // Amount first (PLAN §4.4): the dialog would otherwise focus its Close button.
  useEffect(() => {
    document.getElementById(amountId)?.focus()
  }, [amountId])

  // Envelopes are for spending only. "Got money" is always income: an envelope here used
  // to turn it into a refund (lowering that envelope's spending instead of adding to Money
  // in), and the note-based suggestion picked one without being asked. Refunds now have
  // their own explicit choice on the envelope's "+ Add spend" sheet.
  const showEnvelopes =
    kind === 'spend' && settings.envelopesEnabled && (envelopes?.length ?? 0) > 0
  const suggested = showEnvelopes && note ? suggestEnvelope(note, recent ?? []) : null
  const chosenEnvelope = envelopeId ?? suggested
  const chips = frequentEntries(recent ?? [], 4)
  const yesterday = addDays(today, -1)
  const date = resolveDay(day, today)
  const pickDay = (d: Day) => {
    setDay(d)
    setPickDate(false)
  }

  async function submit(entry: { amount: Cents; note: string; envelopeId?: Id }) {
    setSaving(true)
    try {
      // Read the clock at save time too: useToday's midnight tick can lag by a second.
      const done = await save({ ...entry, date: resolveDay(day, todayISO()) })
      if (done) onDone()
    } finally {
      setSaving(false)
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setTried(true)
    if (amount === null || amount === 0) return
    void submit({
      amount: kind === 'spend' ? -amount : amount,
      note,
      ...(showEnvelopes && chosenEnvelope ? { envelopeId: chosenEnvelope } : {}),
    })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5 pb-4" noValidate>
      <MoneyInput
        id={amountId}
        label="Amount"
        value={amount}
        onChange={setAmount}
        symbol={f.symbol}
        decimals={f.decimals}
        error={tried && !amount ? 'Enter an amount, like 12.50' : undefined}
      />
      <Segmented label="Money" value={kind} options={KINDS} onChange={setKind} />
      <Field id={noteId} label="What for (optional)">
        <input
          id={noteId}
          type="text"
          value={note}
          autoComplete="off"
          enterKeyHint="done"
          placeholder={kind === 'spend' ? 'Coffee, groceries…' : 'Refund, gift…'}
          onChange={(e) => setNote(e.target.value)}
          className={inputClass}
        />
      </Field>

      <fieldset className="space-y-2">
        <legend className="mb-1.5 text-sm font-medium">When</legend>
        <div className="flex flex-wrap gap-2">
          <Chip selected={!pickDate && date === today} onClick={() => pickDay('today')}>
            Today
          </Chip>
          <Chip selected={!pickDate && date === yesterday} onClick={() => pickDay('yesterday')}>
            Yesterday
          </Chip>
          <Chip selected={pickDate} onClick={() => setPickDate(true)}>
            Other day
          </Chip>
        </div>
        {pickDate && (
          <DateInput
            format={f.dayFull}
            label="Date"
            value={date}
            max={today}
            onChange={(d) => d && setDay(d)}
          />
        )}
      </fieldset>

      {showEnvelopes && (
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">Envelope</legend>
          <div className="flex flex-wrap gap-2">
            {envelopes!.map((env) => (
              <Chip
                key={env.id}
                selected={chosenEnvelope === env.id}
                leading={<EnvelopeDot color={env.color} />}
                onClick={() => setEnvelopeId(env.id)}
              >
                {env.name}
              </Chip>
            ))}
          </div>
          {suggested && envelopeId === null && (
            <p className="mt-1.5 text-sm text-muted">Suggested from what you logged before.</p>
          )}
        </fieldset>
      )}

      <Button type="submit" block size="lg" disabled={saving}>
        {kind === 'spend' ? 'Log it' : 'Add it'}
      </Button>

      {chips.length > 0 && (
        <section aria-labelledby={`${amountId}-again`}>
          <h3 id={`${amountId}-again`} className="mb-2 text-sm font-medium text-muted">
            Or log one again
          </h3>
          <div className="flex flex-wrap gap-2">
            {chips.map((c) => (
              <Chip
                key={`${c.note}|${c.amount}`}
                disabled={saving}
                aria-label={`Log ${c.note} ${f.money(c.amount)} again`}
                onClick={() =>
                  void submit({
                    amount: -c.amount,
                    note: c.note,
                    ...(c.envelopeId ? { envelopeId: c.envelopeId } : {}),
                  })
                }
              >
                {c.note}
                <span className="text-muted tabular-nums">{f.money(c.amount)}</span>
              </Chip>
            ))}
          </div>
        </section>
      )}
    </form>
  )
}
