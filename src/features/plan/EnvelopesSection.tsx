import { useState, type FormEvent } from 'react'
import { useAppSettings } from '../../app/SettingsProvider'
import { useUndoToast } from '../../app/useUndoToast'
import {
  addEnvelope,
  deleteEnvelope,
  ensureDefaultEnvelope,
  reorderEnvelopes,
  updateEnvelope,
} from '../../db/repos'
import type { EnvelopeUsage } from '../../domain/safeToSpend'
import type { Cents, Envelope } from '../../domain/types'
import { Button } from '../../ui/Button'
import { Field, inputClass } from '../../ui/Field'
import { Icon } from '../../ui/Icon'
import { MoneyInput } from '../../ui/MoneyInput'
import { ProgressBar } from '../../ui/Progress'
import { Sheet } from '../../ui/Sheet'
import { Switch } from '../../ui/Switch'
import { useFormat } from '../bills/format'

interface Props {
  envelopes: readonly Envelope[]
  /** This period's numbers per envelope; missing before there is a balance. */
  usage: readonly EnvelopeUsage[]
}

/** Envelopes (off by default, PLAN §10 M9): an optional budget per kind of spending. */
export function EnvelopesSection({ envelopes, usage }: Props) {
  const { settings, update } = useAppSettings()
  const [editing, setEditing] = useState<Envelope | 'new' | null>(null)
  const on = settings.envelopesEnabled

  async function toggle(next: boolean) {
    // "Everyday" exists before the switch flips, so untagged spending always has a home.
    if (next) await ensureDefaultEnvelope()
    await update({ envelopesEnabled: next })
  }

  return (
    <section aria-labelledby="envelopes-title" className="space-y-3">
      <div className="flex items-center justify-between gap-3 px-1">
        <h2 id="envelopes-title" className="text-lg font-semibold">
          Envelopes
        </h2>
        <Switch label="Use envelopes" checked={on} onChange={(v) => void toggle(v)} />
      </div>
      {!on ? (
        <div className="rounded-3xl bg-surface p-5 text-[0.9375rem] text-muted shadow-card ring-1 ring-line">
          <p>
            Envelopes give parts of your money a job, like{' '}
            <span className="text-text">Food €300</span> each payday. What’s still in them is set
            aside, so today’s number only shows what’s truly free.
          </p>
          <p className="mt-2">
            Off is fine too: everything then shares one Everyday pot. Turn it on any time.
          </p>
        </div>
      ) : (
        <>
          <ul className="space-y-3">
            {envelopes.map((env, i) => (
              <EnvelopeRow
                key={env.id}
                env={env}
                usage={usage.find((u) => u.id === env.id)}
                first={i === 0}
                last={i === envelopes.length - 1}
                onMove={(dir) => {
                  const ids = envelopes.map((e) => e.id)
                  ids.splice(i, 1)
                  ids.splice(i + dir, 0, env.id)
                  void reorderEnvelopes(ids)
                }}
                onEdit={() => setEditing(env)}
              />
            ))}
          </ul>
          <Button variant="secondary" block onClick={() => setEditing('new')}>
            <Icon name="plus" size={18} />
            Add envelope
          </Button>
          <p className="px-1 text-sm text-muted">
            Whatever’s left at payday goes back into safe to spend. Untagged spending uses Everyday;
            tag it in quick-add with @name, like “12 lunch @food”.
          </p>
        </>
      )}
      <EnvelopeSheet
        envelope={editing === 'new' ? null : editing}
        open={editing !== null}
        onClose={() => setEditing(null)}
      />
    </section>
  )
}

function EnvelopeRow({
  env,
  usage,
  first,
  last,
  onMove,
  onEdit,
}: {
  env: Envelope
  usage: EnvelopeUsage | undefined
  first: boolean
  last: boolean
  onMove: (dir: -1 | 1) => void
  onEdit: () => void
}) {
  const f = useFormat()
  const used = usage ? usage.spent + usage.linkedDue : 0
  const status = !usage
    ? `${f.money(env.budget)} each payday`
    : env.budget === 0
      ? used > 0
        ? `${f.money(used)} used, no budget yet`
        : 'No budget yet'
      : usage.over > 0
        ? // Calm words instead of red (PLAN §1.3).
          `Over by ${f.money(usage.over)}. That’s okay, it comes from what’s free.`
        : `${f.money(usage.reserved)} left of ${f.money(env.budget)}`

  return (
    <li className="rounded-3xl bg-surface p-4 shadow-card ring-1 ring-line">
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1 pl-1">
          <h3 className="truncate font-semibold">{env.name}</h3>
          <p className="text-sm text-muted tabular-nums">{status}</p>
        </div>
        <IconButton
          label={`Move ${env.name} up`}
          icon="up"
          disabled={first}
          onClick={() => onMove(-1)}
        />
        <IconButton
          label={`Move ${env.name} down`}
          icon="down"
          disabled={last}
          onClick={() => onMove(1)}
        />
        <IconButton label={`Edit ${env.name}`} icon="edit" onClick={onEdit} />
      </div>
      {env.budget > 0 && (
        <ProgressBar value={used / env.budget} label={`${env.name} used`} className="mx-1 mt-3" />
      )}
    </li>
  )
}

function IconButton({
  label,
  icon,
  onClick,
  disabled,
}: {
  label: string
  icon: 'up' | 'down' | 'edit'
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-muted hover:bg-accent-soft/60 disabled:opacity-30"
    >
      <Icon name={icon} size={18} />
    </button>
  )
}

function EnvelopeSheet({
  envelope,
  open,
  onClose,
}: {
  envelope: Envelope | null
  open: boolean
  onClose: () => void
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={envelope ? `Edit ${envelope.name}` : 'New envelope'}
      description={envelope?.isDefault ? 'Everyday catches all spending without a tag.' : undefined}
    >
      {open && <EnvelopeForm envelope={envelope} onDone={onClose} />}
    </Sheet>
  )
}

function EnvelopeForm({ envelope, onDone }: { envelope: Envelope | null; onDone: () => void }) {
  const f = useFormat()
  const undoToast = useUndoToast()
  const [name, setName] = useState(envelope?.name ?? '')
  const [budget, setBudget] = useState<Cents | null>(envelope?.budget ?? null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    const row = { name: name.trim(), budget: budget ?? 0 }
    if (envelope) await updateEnvelope(envelope.id, row, `Edit ${row.name}`)
    else await addEnvelope({ ...row, color: 'accent' })
    undoToast(envelope ? `Saved ${row.name}` : `Added ${row.name}`)
    onDone()
  }

  async function remove() {
    if (!envelope) return
    await deleteEnvelope(envelope.id)
    undoToast(`Deleted ${envelope.name}. Its spending now counts as Everyday.`)
    onDone()
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-5 pb-4">
      <Field id="envelope-name" label="Name">
        <input
          id="envelope-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Food"
          autoComplete="off"
          className={inputClass}
        />
      </Field>
      <MoneyInput
        label="Budget each payday"
        value={budget}
        onChange={setBudget}
        symbol={f.symbol}
        decimals={f.decimals}
      />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        {envelope && !envelope.isDefault ? (
          <Button variant="ghost" className="text-muted" onClick={() => void remove()}>
            Delete envelope
          </Button>
        ) : (
          <span />
        )}
        <Button type="submit" disabled={!name.trim()}>
          {envelope ? 'Save' : 'Add envelope'}
        </Button>
      </div>
    </form>
  )
}
