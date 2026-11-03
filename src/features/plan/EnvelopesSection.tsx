import { useState, type FormEvent } from 'react'
import { useAppSettings } from '../../app/SettingsProvider'
import { useUndoToast } from '../../app/useUndoToast'
import {
  addEnvelope,
  addStarterEnvelopes,
  deleteEnvelope,
  ensureDefaultEnvelope,
  reorderEnvelopes,
  updateEnvelope,
} from '../../db/repos'
import { ENVELOPE_COLORS, nextEnvelopeColor, STARTER_CATEGORIES } from '../../domain/categories'
import type { EnvelopeUsage } from '../../domain/safeToSpend'
import type { DateRange } from '../../domain/insights'
import type { Cents, Envelope, ISODate } from '../../domain/types'
import { Button } from '../../ui/Button'
import { cx } from '../../ui/cx'
import { EnvelopeDot, envelopeColor } from '../../ui/EnvelopeDot'
import { Field, inputClass } from '../../ui/Field'
import { Icon } from '../../ui/Icon'
import { MoneyInput } from '../../ui/MoneyInput'
import { ProgressBar } from '../../ui/Progress'
import { Sheet } from '../../ui/Sheet'
import { Switch } from '../../ui/Switch'
import { useFormat } from '../bills/format'
import { EnvelopeEntriesSheet } from './EnvelopeEntriesSheet'

interface Props {
  envelopes: readonly Envelope[]
  /** This period's numbers per envelope; missing before there is a balance. */
  usage: readonly EnvelopeUsage[]
  /** The current pay period, so a tap on an envelope can list its entries. */
  period?: DateRange
  today?: ISODate
}

/** Envelopes (off by default, PLAN §10 M9): an optional budget per kind of spending. */
export function EnvelopesSection({ envelopes, usage, period, today }: Props) {
  const { settings, update } = useAppSettings()
  const f = useFormat()
  const [editing, setEditing] = useState<Envelope | 'new' | null>(null)
  const [viewing, setViewing] = useState<Envelope | null>(null)
  const [skipped, setSkipped] = useState(readSkipped)
  const on = settings.envelopesEnabled
  // Offered while only Everyday exists: the moment right after turning envelopes on.
  const offerStarters = on && !skipped && envelopes.every((e) => e.isDefault)

  async function toggle(next: boolean) {
    // "Everyday" exists before the switch flips, so untagged spending always has a home.
    if (next) await ensureDefaultEnvelope()
    await update({ envelopesEnabled: next })
  }

  return (
    <section aria-labelledby="envelopes-title" className="space-y-3">
      <div className="flex items-center justify-between gap-3 px-1">
        <h2 id="envelopes-title" className="text-heading">
          Envelopes
        </h2>
        <Switch label="Use envelopes" checked={on} onChange={(v) => void toggle(v)} />
      </div>
      {!on ? (
        <div className="card p-5 text-body text-muted">
          <p>
            Envelopes give each kind of spending a budget, like{' '}
            <span className="text-text">Groceries {f.money(300 * 10 ** f.decimals)}</span>, and show
            planned vs actual as you spend.
          </p>
          <p className="mt-2">
            Off is fine too: everything then shares one Everyday pot. Turn it on any time.
          </p>
        </div>
      ) : (
        <>
          {offerStarters && (
            <StarterOffer
              onSkip={() => {
                writeSkipped()
                setSkipped(true)
              }}
            />
          )}
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
                onOpen={period && today ? () => setViewing(env) : undefined}
              />
            ))}
          </ul>
          <Button variant="secondary" block onClick={() => setEditing('new')}>
            <Icon name="plus" size={18} />
            Add envelope
          </Button>
          <p className="px-1 text-sm text-muted">
            Budgets are your plan; safe to spend only moves when you actually spend. Untagged
            spending uses Everyday; tag it in quick-add with @name, like “12 lunch @food”, or add it
            from the envelope or the calendar.
          </p>
        </>
      )}
      {period && today && (
        <EnvelopeEntriesSheet
          envelope={viewing}
          envelopes={envelopes}
          usage={usage.find((u) => u.id === viewing?.id)}
          period={period}
          today={today}
          onClose={() => setViewing(null)}
        />
      )}
      <EnvelopeSheet
        envelope={editing === 'new' ? null : editing}
        envelopes={envelopes}
        open={editing !== null}
        onClose={() => setEditing(null)}
      />
    </section>
  )
}

const SKIP_KEY = 'steady:starter-categories'
// Per device on purpose: it only hides an offer, and storage can be unavailable (private
// mode), in which case the offer simply shows again. Adding any envelope also hides it.
function readSkipped() {
  try {
    return localStorage.getItem(SKIP_KEY) === 'skipped'
  } catch {
    return false
  }
}
function writeSkipped() {
  try {
    localStorage.setItem(SKIP_KEY, 'skipped')
  } catch {
    // Nothing to do: the offer is hidden for this visit anyway.
  }
}

/** One tap to a sensible set, skippable; budgets stay empty so nothing is decided for you. */
function StarterOffer({ onSkip }: { onSkip: () => void }) {
  const undoToast = useUndoToast()
  const [busy, setBusy] = useState(false)

  async function add() {
    setBusy(true)
    try {
      const added = await addStarterEnvelopes()
      // Nothing added means no undo step, so no Undo to offer either.
      if (added > 0) undoToast(added === 1 ? 'Added 1 category' : `Added ${added} categories`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="starter-title" className="card p-5">
      <h3 id="starter-title" className="text-heading">
        Start with common categories?
      </h3>
      <p className="mt-1 text-body text-muted">
        Ten everyday envelopes, ready to use. Budgets start empty: fill in only the ones you care
        about, rename or delete the rest.
      </p>
      <ul aria-label="Categories it adds" className="mt-4 flex flex-wrap gap-1.5">
        {STARTER_CATEGORIES.map((c) => (
          <li
            key={c.name}
            className="inline-flex items-center gap-1.5 rounded-full bg-bg px-2.5 py-1 text-caption ring-1 ring-line"
          >
            <EnvelopeDot color={c.color} className="h-2 w-2" />
            {c.name}
          </li>
        ))}
      </ul>
      <div className="mt-5 flex flex-wrap gap-2">
        <Button onClick={() => void add()} disabled={busy}>
          Start with common categories
        </Button>
        <Button variant="ghost" onClick={onSkip}>
          I’ll make my own
        </Button>
      </div>
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
  onOpen,
}: {
  env: Envelope
  usage: EnvelopeUsage | undefined
  first: boolean
  last: boolean
  onMove: (dir: -1 | 1) => void
  onEdit: () => void
  /** Opens this period's entries; the whole card is the target. */
  onOpen?: () => void
}) {
  const f = useFormat()
  const { planBy } = useAppSettings().settings
  const used = usage ? usage.spent + usage.linkedDue : 0
  const status = !usage
    ? `${f.money(env.budget)} each ${planBy === 'month' ? 'month' : 'payday'}`
    : env.budget === 0
      ? used > 0
        ? `${f.money(used)} used, no budget yet`
        : 'No budget yet'
      : usage.over > 0
        ? // Calm words instead of red (PLAN §1.3).
          `${f.money(usage.over)} over the plan. That’s okay, it’s just information.`
        : `${f.money(usage.reserved)} left of ${f.money(env.budget)}`

  return (
    <li className="card relative p-4 transition-colors has-[.open-entries:hover]:bg-accent-soft/30">
      <div className="flex items-center gap-1">
        <EnvelopeDot color={env.color} className="ml-1" />
        <div className="min-w-0 flex-1 pl-2">
          <h3 className="truncate font-semibold">
            {onOpen ? (
              // Stretched over the card (::before), under the move and edit buttons.
              <button
                type="button"
                onClick={onOpen}
                aria-haspopup="dialog"
                className="open-entries max-w-full truncate text-left outline-none before:absolute before:inset-0 before:rounded-3xl focus-visible:before:ring-2 focus-visible:before:ring-accent"
              >
                {env.name}
              </button>
            ) : (
              env.name
            )}
          </h3>
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
      {usage && (used > 0 || env.budget > 0) && (
        <p className="mx-1 mt-1.5 flex justify-between gap-3 text-sm text-muted tabular-nums">
          <span>
            {f.money(usage.spent)} spent
            {usage.linkedDue > 0 && ` · ${f.money(usage.linkedDue)} coming`}
          </span>
          {env.budget > 0 && (
            <span>
              {usage.over > 0 ? `${f.money(usage.over)} over` : `${f.money(usage.reserved)} left`}
            </span>
          )}
        </p>
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
      className="relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-muted hover:bg-accent-soft/60 disabled:opacity-30"
    >
      <Icon name={icon} size={18} />
    </button>
  )
}

function EnvelopeSheet({
  envelope,
  envelopes,
  open,
  onClose,
}: {
  envelope: Envelope | null
  envelopes: readonly Envelope[]
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
      {open && <EnvelopeForm envelope={envelope} envelopes={envelopes} onDone={onClose} />}
    </Sheet>
  )
}

function EnvelopeForm({
  envelope,
  envelopes,
  onDone,
}: {
  envelope: Envelope | null
  envelopes: readonly Envelope[]
  onDone: () => void
}) {
  const f = useFormat()
  const { planBy } = useAppSettings().settings
  const undoToast = useUndoToast()
  const [name, setName] = useState(envelope?.name ?? '')
  const [budget, setBudget] = useState<Cents | null>(envelope?.budget ?? null)
  const [color, setColor] = useState(envelope?.color ?? nextEnvelopeColor(envelopes))

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    const row = { name: name.trim(), budget: budget ?? 0, color }
    if (envelope) await updateEnvelope(envelope.id, row, `Edit ${row.name}`)
    else await addEnvelope(row)
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
        label={planBy === 'month' ? 'Budget each month' : 'Budget each payday'}
        value={budget}
        onChange={setBudget}
        symbol={f.symbol}
        decimals={f.decimals}
      />
      <ColorPicker value={color} onChange={setColor} allowTheme={envelope?.isDefault ?? false} />
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

const COLOR_NAMES: Record<string, string> = {
  accent: 'Theme colour',
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

/** Radio swatches: the dot colour shown next to this envelope everywhere. */
function ColorPicker({
  value,
  onChange,
  allowTheme,
}: {
  value: string
  onChange: (color: string) => void
  /** Everyday may keep the theme's own colour. */
  allowTheme: boolean
}) {
  const options =
    allowTheme || value === 'accent' ? ['accent', ...ENVELOPE_COLORS] : ENVELOPE_COLORS
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium">Colour</legend>
      <div className="-ml-1.5 flex flex-wrap">
        {options.map((c) => (
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
