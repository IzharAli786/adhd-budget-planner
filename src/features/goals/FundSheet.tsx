import { useState, type FormEvent } from 'react'
import { useUndoToast } from '../../app/useUndoToast'
import { addFund, deleteFund, fundTransactions, updateFund } from '../../db/repos'
import { challengeTotal } from '../../domain/savings'
import type { Cents, ISODate, SavingsFund } from '../../domain/types'
import { Button } from '../../ui/Button'
import { DateInput } from '../../ui/DateInput'
import { Dialog } from '../../ui/Dialog'
import { Field, inputClass } from '../../ui/Field'
import { MoneyInput } from '../../ui/MoneyInput'
import { Segmented } from '../../ui/Segmented'
import { Sheet } from '../../ui/Sheet'
import { useFormat } from '../bills/format'

type Kind = 'none' | '52week' | 'fixed'

interface Props {
  open: boolean
  onClose: () => void
  today: ISODate
  /** Editing this fund; omitted to create one. */
  fund?: SavingsFund
}

/** New / edit savings fund. Mounted only while open so each opening starts fresh. */
export function FundSheet({ open, onClose, today, fund }: Props) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={fund ? `Edit ${fund.name}` : 'New savings fund'}
      description={fund ? undefined : 'Somewhere for money to grow, a little each payday.'}
    >
      {open && <FundForm today={today} fund={fund} onDone={onClose} />}
    </Sheet>
  )
}

function FundForm({
  today,
  fund,
  onDone,
}: {
  today: ISODate
  fund?: SavingsFund
  onDone: () => void
}) {
  const f = useFormat()
  const undoToast = useUndoToast()
  const [name, setName] = useState(fund?.name ?? '')
  const [target, setTarget] = useState<Cents | null>(fund?.target ?? null)
  const [targetDate, setTargetDate] = useState(fund?.targetDate ?? '')
  const [perPeriod, setPerPeriod] = useState<Cents | null>(fund?.perPeriod ?? null)
  const [opening, setOpening] = useState<Cents | null>(null)
  const [kind, setKind] = useState<Kind>(fund?.challenge?.kind ?? 'none')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const unit = 10 ** f.decimals

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    const challenge = kind === 'none' ? undefined : { kind, start: fund?.challenge?.start ?? today }
    const row = {
      name: name.trim(),
      // The 52-week challenge has a natural target (€1,378) when none was given.
      target: target ?? (kind === '52week' ? challengeTotal(unit) : undefined),
      targetDate: targetDate || undefined,
      perPeriod: perPeriod ?? 0,
      challenge,
    }
    if (fund) {
      await updateFund(fund.id, row)
      undoToast(`Saved ${row.name}`)
    } else {
      await addFund({ ...row, openingSaved: opening ?? 0 })
      undoToast(`Added ${row.name}`)
    }
    onDone()
  }

  async function remove() {
    if (!fund) return
    // A fund with history gets a confirm (PLAN §8); an empty one just goes, with undo.
    if (!confirmDelete && (await fundTransactions(fund.id)).length > 0) {
      setConfirmDelete(true)
      return
    }
    await deleteFund(fund.id)
    undoToast(`Deleted ${fund.name}`)
    onDone()
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-5 pb-4">
      <Field id="fund-name" label="Name">
        <input
          id="fund-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Holiday"
          autoComplete="off"
          className={inputClass}
        />
      </Field>
      <Segmented<Kind>
        label="Kind of saving"
        value={kind}
        onChange={setKind}
        options={[
          { value: 'none', label: 'Per payday' },
          { value: '52week', label: '52-week' },
          { value: 'fixed', label: 'Fixed' },
        ]}
      />
      <p className="-mt-2 text-sm text-muted">
        {kind === '52week'
          ? `Week 1 puts away ${f.money(unit)}, week 2 ${f.money(2 * unit)}, up to ${f.money(52 * unit)}. ${f.money(challengeTotal(unit))} in a year.`
          : kind === 'fixed'
            ? 'The same amount every payday, as a challenge to keep.'
            : 'Put away what fits, when it fits.'}
      </p>
      <MoneyInput
        label="Each payday"
        value={perPeriod}
        onChange={setPerPeriod}
        symbol={f.symbol}
        decimals={f.decimals}
        hint="Set aside from safe-to-spend until it’s moved in."
      />
      <MoneyInput
        label="Target (optional)"
        value={target}
        onChange={setTarget}
        symbol={f.symbol}
        decimals={f.decimals}
      />
      <DateInput
        label="Reach it by (optional)"
        value={targetDate}
        onChange={setTargetDate}
        min={today}
      />
      {!fund && (
        <MoneyInput
          label="Already saved (optional)"
          value={opening}
          onChange={setOpening}
          symbol={f.symbol}
          decimals={f.decimals}
        />
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        {fund ? (
          <Button variant="ghost" className="text-muted" onClick={() => void remove()}>
            Delete fund
          </Button>
        ) : (
          <span />
        )}
        <Button type="submit" disabled={!name.trim()}>
          {fund ? 'Save' : 'Add fund'}
        </Button>
      </div>
      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`Delete ${fund?.name}?`}
        description="Its history stays in your entries, and you can bring it back from Recently deleted for 30 days."
        actions={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Keep it
            </Button>
            <Button variant="danger" onClick={() => void remove()}>
              Delete
            </Button>
          </>
        }
      />
    </form>
  )
}
