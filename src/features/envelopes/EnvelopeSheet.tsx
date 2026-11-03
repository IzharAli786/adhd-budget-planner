import { useId, useState, type FormEvent } from 'react'
import { useUndoToast } from '../../app/useUndoToast'
import { addEnvelope, updateEnvelope } from '../../db/repos'
import { ENVELOPE_COLORS, nextEnvelopeColor } from '../../domain/categories'
import type { Cents, Envelope } from '../../domain/types'
import { Button } from '../../ui/Button'
import { cx } from '../../ui/cx'
import { envelopeColor } from '../../ui/EnvelopeDot'
import { Field, inputClass } from '../../ui/Field'
import { MoneyInput } from '../../ui/MoneyInput'
import { Sheet } from '../../ui/Sheet'
import { useFormat } from '../bills/format'

/** "+ Add envelope": a name, the budget for the month being looked at, and a colour. */
export function EnvelopeSheet({
  open,
  envelopes,
  month,
  monthName,
  currentMonth,
  onClose,
}: {
  open: boolean
  envelopes: readonly Envelope[]
  /** 'YYYY-MM' the budget is for. */
  month: string
  /** "November". */
  monthName: string
  /** 'YYYY-MM' of today. */
  currentMonth: string
  onClose: () => void
}) {
  return (
    <Sheet open={open} onClose={onClose} title="New envelope">
      {open && (
        <NewEnvelopeForm
          envelopes={envelopes}
          month={month}
          monthName={monthName}
          currentMonth={currentMonth}
          onDone={onClose}
        />
      )}
    </Sheet>
  )
}

function NewEnvelopeForm({
  envelopes,
  month,
  monthName,
  currentMonth,
  onDone,
}: {
  envelopes: readonly Envelope[]
  month: string
  monthName: string
  currentMonth: string
  onDone: () => void
}) {
  const f = useFormat()
  const undoToast = useUndoToast()
  const nameId = useId()
  const [name, setName] = useState('')
  const [budget, setBudget] = useState<Cents | null>(null)
  const [color, setColor] = useState<string>(() => nextEnvelopeColor(envelopes))

  async function submit(e: FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    const cents = budget ?? 0
    // Made while looking at this month: the budget is simply its budget. Made from another
    // month's tab: it starts that month, and the months before stay empty.
    await addEnvelope(
      month === currentMonth
        ? { name: trimmed, color, budget: cents }
        : { name: trimmed, color, budget: 0, monthBudgets: { [month]: cents } },
    )
    undoToast(`Added ${trimmed}`)
    onDone()
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-5 pb-4">
      <Field id={nameId} label="Name">
        <input
          id={nameId}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Groceries, coffee, travel…"
          autoComplete="off"
          className={inputClass}
        />
      </Field>
      <MoneyInput
        label={`Budget for ${monthName}`}
        hint="Leave it empty if you’d rather just watch where the money goes."
        value={budget}
        onChange={setBudget}
        symbol={f.symbol}
        decimals={f.decimals}
      />
      <ColorPicker value={color} onChange={setColor} />
      <Button type="submit" block disabled={!name.trim()}>
        Add envelope
      </Button>
    </form>
  )
}

/** "Rename": only the name, so it is one field and one tap. */
export function RenameSheet({
  envelope,
  onClose,
}: {
  envelope: Envelope | null
  onClose: () => void
}) {
  return (
    <Sheet
      open={envelope !== null}
      onClose={onClose}
      title={envelope ? `Rename ${envelope.name}` : 'Rename'}
    >
      {envelope && <RenameForm key={envelope.id} envelope={envelope} onDone={onClose} />}
    </Sheet>
  )
}

function RenameForm({ envelope, onDone }: { envelope: Envelope; onDone: () => void }) {
  const undoToast = useUndoToast()
  const nameId = useId()
  const [name, setName] = useState(envelope.name)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    if (trimmed !== envelope.name) {
      await updateEnvelope(envelope.id, { name: trimmed }, `Rename ${envelope.name}`)
      undoToast(`Renamed to ${trimmed}`)
    }
    onDone()
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-5 pb-4">
      <Field
        id={nameId}
        label="Name"
        hint={envelope.isDefault ? 'This one catches spending without an envelope.' : undefined}
      >
        <input
          id={nameId}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="off"
          // The sheet is opened for this one field, so focus is expected here.
          autoFocus
          className={inputClass}
        />
      </Field>
      <Button type="submit" block disabled={!name.trim()}>
        Save name
      </Button>
    </form>
  )
}

const COLOR_NAMES: Record<string, string> = {
  clay: 'Clay',
  sage: 'Sage',
  ocean: 'Ocean',
  sand: 'Sand',
  rose: 'Rose',
  plum: 'Plum',
  teal: 'Teal',
  slate: 'Slate',
  olive: 'Olive',
  amber: 'Amber',
}

/** Radio swatches: the dot colour shown next to this envelope in charts. */
function ColorPicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium">Colour</legend>
      <div className="-ml-1.5 flex flex-wrap">
        {ENVELOPE_COLORS.map((c) => (
          <label
            key={c}
            className="relative inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-full"
          >
            <input
              type="radio"
              name="envelope-color"
              value={c}
              checked={value === c}
              onChange={() => onChange(c)}
              aria-label={COLOR_NAMES[c] ?? c}
              className="peer sr-only"
            />
            <span
              aria-hidden="true"
              className={cx(
                'h-7 w-7 rounded-full ring-offset-2 ring-offset-surface transition-shadow',
                'peer-focus-visible:ring-2 peer-focus-visible:ring-accent',
                value === c && 'ring-2 ring-text',
              )}
              style={{ backgroundColor: envelopeColor(c) }}
            />
          </label>
        ))}
      </div>
    </fieldset>
  )
}
