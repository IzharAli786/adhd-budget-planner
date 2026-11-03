import { useId, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { useAppSettings } from '../../app/SettingsProvider'
import { useUndoToast } from '../../app/useUndoToast'
import { useDebts, useEnvelopes, useFunds } from '../../db/hooks'
import { addBill, addIncome, addToFund, addTransaction } from '../../db/repos'
import { dayOfMonthOf } from './entryKinds'
import type { Cents, Id, ISODate } from '../../domain/types'
import { Button } from '../../ui/Button'
import { Chip } from '../../ui/Chip'
import { Field, inputClass } from '../../ui/Field'
import { MoneyInput } from '../../ui/MoneyInput'
import { Sheet } from '../../ui/Sheet'
import { Switch } from '../../ui/Switch'
import { useFormat } from './format'
import { ENTRY_KINDS, type EntryKind } from './entryKinds'

/**
 * "Add to this day" (PLAN-v2 item 2): one form for everything that can sit on a date.
 * - Expense and income count in safe to spend for the period the date falls in.
 * - A bill opens the full bill form (repeats, autopay, envelope).
 * - Savings and debt payments go to their own sections and never touch safe to spend.
 */
export function AddEntrySheet({
  date,
  envelopeId,
  onClose,
  onAddBill,
}: {
  date: ISODate | null
  /** Start as an expense in this envelope ("+ Add spend" on an envelope). */
  envelopeId?: Id
  onClose: () => void
  onAddBill: (date: ISODate) => void
}) {
  const f = useFormat()
  return (
    <Sheet
      open={date !== null}
      onClose={onClose}
      title="Add to this day"
      description={date ? f.dayLong(date) : ''}
    >
      {date && (
        <AddEntryForm
          key={date}
          date={date}
          envelopeId={envelopeId}
          onClose={onClose}
          onAddBill={onAddBill}
        />
      )}
    </Sheet>
  )
}

function AddEntryForm({
  date,
  envelopeId: initialEnvelope,
  onClose,
  onAddBill,
}: {
  date: ISODate
  envelopeId?: Id
  onClose: () => void
  onAddBill: (date: ISODate) => void
}) {
  const f = useFormat()
  const { settings } = useAppSettings()
  const envelopes = useEnvelopes()
  const funds = useFunds()
  const debts = useDebts()
  const undoToast = useUndoToast()
  const noteId = useId()
  const [kind, setKind] = useState<EntryKind>('expense')
  const [amount, setAmount] = useState<Cents | null>(null)
  const [note, setNote] = useState('')
  const [envelopeId, setEnvelopeId] = useState<Id | undefined>(initialEnvelope)
  const [fundId, setFundId] = useState<Id | undefined>()
  const [debtId, setDebtId] = useState<Id | undefined>()
  const [repeat, setRepeat] = useState(false)
  const [tried, setTried] = useState(false)

  const fund = funds?.find((x) => x.id === (fundId ?? funds[0]?.id))
  const debt = debts?.find((x) => x.id === (debtId ?? debts[0]?.id))
  const missing = kind === 'saving' && !fund ? 'fund' : kind === 'debt' && !debt ? 'debt' : null

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setTried(true)
    if (!amount || missing) return
    const what = note.trim()
    if (kind === 'expense' && repeat) {
      // A monthly expense is a bill: it then shows on every month and can be ticked.
      await addBill({
        name: what || 'Monthly cost',
        amount,
        rule: { freq: 'monthly', interval: 1, day: dayOfMonthOf(date), anchor: date },
        autopay: false,
        ...(envelopeId ? { envelopeId } : {}),
      })
      undoToast(`Added ${what || 'monthly cost'}, every month`)
    } else if (kind === 'income' && repeat) {
      await addIncome({
        name: what || 'Income',
        amount,
        schedule: { kind: 'monthly', day: dayOfMonthOf(date) },
        weekendRule: 'none',
        primary: false,
        active: true,
      })
      undoToast(`Added ${what || 'income'}, every month`)
    } else if (kind === 'expense' || kind === 'income') {
      await addTransaction({
        date,
        amount: kind === 'expense' ? -amount : amount,
        note: what,
        ...(kind === 'expense' && envelopeId ? { envelopeId } : {}),
      })
      undoToast(`Added ${what || (kind === 'expense' ? 'expense' : 'income')}`)
    } else if (kind === 'saving' && fund) {
      await addToFund(fund, amount, date)
      undoToast(`Saved ${f.money(amount)} for ${fund.name}`)
    } else if (kind === 'debt' && debt) {
      await addTransaction({
        date,
        amount: -amount,
        note: what || debt.name,
        debtId: debt.id,
      })
      undoToast(`Paid ${f.money(amount)} off ${debt.name}`)
    }
    onClose()
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5 pb-4" noValidate>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">What is it?</legend>
        <div className="flex flex-wrap gap-2">
          {ENTRY_KINDS.map((k) => (
            <Chip
              key={k.value}
              selected={kind === k.value}
              onClick={() => (k.value === 'bill' ? onAddBill(date) : setKind(k.value))}
            >
              {k.label}
            </Chip>
          ))}
        </div>
        <p className="mt-2 text-sm text-muted">{ENTRY_KINDS.find((k) => k.value === kind)?.hint}</p>
      </fieldset>

      {missing ? (
        <p className="card-quiet p-4 text-body">
          {missing === 'fund' ? 'No savings funds yet. ' : 'No debts listed yet. '}
          <Link
            to={missing === 'fund' ? '/goals' : '/more/debts'}
            className="font-medium text-accent"
          >
            {missing === 'fund' ? 'Start a fund in Goals' : 'Add a debt'}
          </Link>
        </p>
      ) : (
        <>
          <MoneyInput
            label="Amount"
            value={amount}
            onChange={setAmount}
            symbol={f.symbol}
            decimals={f.decimals}
            error={tried && !amount ? 'Enter an amount' : undefined}
          />

          {(kind === 'expense' || kind === 'income' || kind === 'debt') && (
            <Field id={noteId} label={kind === 'debt' ? 'Note (optional)' : 'What for'}>
              <input
                id={noteId}
                type="text"
                value={note}
                autoComplete="off"
                placeholder={
                  kind === 'expense'
                    ? 'Groceries, coffee, car insurance…'
                    : kind === 'income'
                      ? 'Side job, refund, gift…'
                      : ''
                }
                onChange={(e) => setNote(e.target.value)}
                className={inputClass}
              />
            </Field>
          )}

          {kind === 'expense' && settings.envelopesEnabled && (envelopes?.length ?? 0) > 0 && (
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium">Envelope</legend>
              <div className="flex flex-wrap gap-2">
                {envelopes!.map((env) => (
                  <Chip
                    key={env.id}
                    selected={envelopeId === env.id}
                    onClick={() => setEnvelopeId(envelopeId === env.id ? undefined : env.id)}
                  >
                    {env.name}
                  </Chip>
                ))}
              </div>
            </fieldset>
          )}

          {kind === 'saving' && funds && funds.length > 1 && (
            <Picker legend="Into which fund?" items={funds} value={fund?.id} onChange={setFundId} />
          )}
          {kind === 'debt' && debts && debts.length > 1 && (
            <Picker legend="Which debt?" items={debts} value={debt?.id} onChange={setDebtId} />
          )}

          {(kind === 'expense' || kind === 'income') && (
            <div className="flex items-center justify-between gap-4 rounded-2xl bg-bg px-4 py-3">
              <span className="text-body">
                Repeat every month
                <span className="block text-sm text-muted">
                  {kind === 'expense'
                    ? 'Becomes a monthly bill you can tick off.'
                    : 'Becomes a monthly income on this day.'}
                </span>
              </span>
              <Switch label="Repeat every month" checked={repeat} onChange={setRepeat} />
            </div>
          )}

          <Button type="submit" block>
            Add
          </Button>
        </>
      )}
    </form>
  )
}

function Picker({
  legend,
  items,
  value,
  onChange,
}: {
  legend: string
  items: readonly { id: Id; name: string }[]
  value: Id | undefined
  onChange: (id: Id) => void
}) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {items.map((x) => (
          <Chip key={x.id} selected={value === x.id} onClick={() => onChange(x.id)}>
            {x.name}
          </Chip>
        ))}
      </div>
    </fieldset>
  )
}
