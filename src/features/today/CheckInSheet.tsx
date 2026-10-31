import { useId, useState } from 'react'
import { useUndoToast } from '../../app/useUndoToast'
import { reconcileCheckIn } from '../../db/repos'
import type { BillEntry } from '../../domain/bills'
import type { Cents } from '../../domain/money'
import { checkInPlan, type CheckInPlan } from '../../domain/reconcile'
import { occurrenceId, type ISODate } from '../../domain/types'
import { Button } from '../../ui/Button'
import { Chip } from '../../ui/Chip'
import { Icon } from '../../ui/Icon'
import { MoneyInput } from '../../ui/MoneyInput'
import { Sheet } from '../../ui/Sheet'
import { useFormat } from '../bills/format'

interface Props {
  open: boolean
  onClose: () => void
  today: ISODate
  /** Unpaid bills safe-to-spend counts right now; the check-in reconciles them. */
  due: readonly BillEntry[]
  /** Called after saving, with what to tell the user. */
  onSaved?: (summary: string) => void
}

export function CheckInSheet({ open, onClose, ...rest }: Props) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="What’s in your account right now?"
      description="The number your banking app shows for the account you spend from."
    >
      {open && <CheckInForm onClose={onClose} {...rest} />}
    </Sheet>
  )
}

const keyOf = (e: BillEntry) => occurrenceId(e.billId, e.originalDate)

function CheckInForm({ onClose, today, due, onSaved }: Omit<Props, 'open'>) {
  const f = useFormat()
  const undoToast = useUndoToast()
  const id = useId()
  const [amount, setAmount] = useState<Cents | null>(null)
  const [negative, setNegative] = useState(false)
  const [tried, setTried] = useState(false)
  const [plan, setPlan] = useState<CheckInPlan | null>(null)
  // "Did these come out yet?" starts at all yes; the user unticks the exceptions.
  const [notYet, setNotYet] = useState<ReadonlySet<string>>(new Set())
  const [saving, setSaving] = useState(false)

  const balance = amount === null ? null : negative ? -amount : amount

  async function commit(p: CheckInPlan) {
    if (balance === null) return
    setSaving(true)
    const yes = p.ask.filter((e) => !notYet.has(keyOf(e)))
    try {
      await reconcileCheckIn({
        balance,
        date: today,
        paid: [
          ...p.autoPaid.map((e) => ({ ...pick(e), auto: true })),
          ...yes.map((e) => ({ ...pick(e), auto: false })),
        ],
      })
    } finally {
      setSaving(false)
    }
    const marked = p.autoPaid.length + yes.length
    const summary =
      marked > 0
        ? `Balance updated · ${marked} ${marked === 1 ? 'bill' : 'bills'} marked paid`
        : 'Balance updated'
    if (onSaved) onSaved(summary)
    else undoToast(summary)
    onClose()
  }

  function next(e: React.FormEvent) {
    e.preventDefault()
    setTried(true)
    if (balance === null) return
    const p = checkInPlan(due, today)
    // Only ask when there is something to ask (PLAN §4.1): one prompt, never a backlog.
    if (p.ask.length === 0) void commit(p)
    else setPlan(p)
  }

  if (plan) {
    const allYes = notYet.size === 0
    return (
      <div className="space-y-4 pb-4">
        <div>
          <h3 className="text-base font-semibold">Did these come out yet?</h3>
          <p className="text-body text-muted">
            Untick any that haven’t left your account, so they stay counted.
          </p>
        </div>
        <ul className="divide-y divide-line rounded-2xl ring-1 ring-line">
          {plan.ask.map((e) => {
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
                  aria-label={`${e.name} came out`}
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
                  {out ? 'Came out' : 'Not yet'}
                </Chip>
              </li>
            )
          })}
        </ul>
        {plan.autoPaid.length > 0 && (
          <p className="text-sm text-muted">
            {plan.autoPaid.length} autopay {plan.autoPaid.length === 1 ? 'bill is' : 'bills are'}{' '}
            marked paid automatically.
          </p>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => setPlan(null)}>
            Back
          </Button>
          <Button disabled={saving} onClick={() => void commit(plan)}>
            {allYes ? 'All yes' : 'Save'}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={next} className="space-y-4 pb-4" noValidate>
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
      <Button type="submit" block size="lg" disabled={saving}>
        Update balance
      </Button>
    </form>
  )
}

const pick = (e: BillEntry) => ({
  billId: e.billId,
  originalDate: e.originalDate,
  amount: e.amount,
})
