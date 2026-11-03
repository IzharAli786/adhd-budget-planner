import { useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useAppSettings } from '../../app/SettingsProvider'
import { useUndoToast } from '../../app/useUndoToast'
import { CURRENCY_CODES, currencyDecimals, isSupportedCurrency } from '../../domain/currencies'
import { parseAmount, type Cents } from '../../domain/money'
import { monthSpan } from '../../domain/safeToSpend'
import { useToday } from '../../lib/useToday'
import { cx } from '../../ui/cx'
import { inputClass } from '../../ui/Field'
import { Icon } from '../../ui/Icon'
import { PageHeader } from '../../ui/PageHeader'
import { Switch } from '../../ui/Switch'
import { displayName } from '../setup/LocaleLine'
import { SECTION_GUIDE } from './sections'

/** A card's own title: the display face, one step above body text. */
const cardTitle = 'type-display text-heading'

/**
 * Getting started: the few numbers everything is built on (currency, starting balance,
 * roll over), then a line on what each section is for, in the order the menu lists them.
 * Every setting saves on its own; there is no "Save" to forget.
 */
export function GettingStartedScreen() {
  const { settings, loaded } = useAppSettings()
  // Simple mode hides the bigger tools, so the guide only describes what is on screen.
  const sections = SECTION_GUIDE.filter((s) => !settings.simpleMode || !s.full)

  return (
    <>
      <PageHeader
        title="Getting started"
        subtitle="A short tour, and the few numbers everything is built on."
      />
      {/* The cards show stored values, so they wait for them instead of flashing defaults. */}
      {loaded ? (
        <div className="space-y-4">
          <CurrencyCard />
          <StartingBalanceCard />
          <RolloverCard />
        </div>
      ) : (
        <div aria-hidden="true" className="h-96 animate-pulse rounded-3xl bg-surface" />
      )}

      <section aria-labelledby="section-guide-title" className="mt-10 space-y-3">
        <h2 id="section-guide-title" className="px-1 type-display text-[1.375rem] leading-tight">
          How each section works
        </h2>
        <ul className="card divide-y divide-line px-5 py-3">
          {sections.map((s) => (
            <li key={s.to} className="py-4">
              <h3 className={cardTitle}>{s.label}</h3>
              <p className="mt-0.5 text-sm text-muted">{s.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <Link
        to="/more/basics"
        className="mt-4 inline-flex min-h-11 items-center gap-1 rounded-full px-1 text-sm font-medium text-accent hover:underline"
      >
        More money settings: cushion, month or payday, start date
        <Icon name="chevron" size={16} className="shrink-0" />
      </Link>
    </>
  )
}

/** A settings card: title and one line on the left, an optional control on the right. */
function SettingCard({
  title,
  body,
  trailing,
  children,
}: {
  title: string
  body: ReactNode
  trailing?: (ids: { title: string; body: string }) => ReactNode
  children?: (ids: { title: string; body: string }) => ReactNode
}) {
  const id = useId()
  const ids = { title: `${id}-title`, body: `${id}-body` }
  return (
    <section aria-labelledby={ids.title} className="card p-5">
      <div className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <h2 id={ids.title} className={cardTitle}>
            {title}
          </h2>
          <p id={ids.body} className="mt-0.5 text-body">
            {body}
          </p>
        </div>
        {trailing?.(ids)}
      </div>
      {children?.(ids)}
    </section>
  )
}

function CurrencyCard() {
  const { settings, update } = useAppSettings()
  // By name, the way people look for their own currency ("Euro", "US Dollar").
  const options = useMemo(() => {
    const codes: string[] = [...CURRENCY_CODES]
    // An older install may hold a code that is no longer offered; keep it selectable.
    if (!isSupportedCurrency(settings.currency)) codes.push(settings.currency)
    return codes
      .map((code) => ({ code, name: displayName('currency', code) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'en'))
  }, [settings.currency])

  return (
    <SettingCard title="Your currency" body="Steady shows every amount in this currency.">
      {(ids) => (
        <div className="relative mt-3 w-full sm:w-fit">
          <select
            aria-labelledby={ids.title}
            aria-describedby={ids.body}
            value={settings.currency}
            onChange={(e) =>
              void update({
                currency: e.target.value,
                decimals: currencyDecimals(e.target.value),
              })
            }
            className={cx(
              inputClass,
              'min-h-11 appearance-none pr-11 sm:w-auto sm:field-sizing-content',
            )}
          >
            {options.map((o) => (
              <option key={o.code} value={o.code}>
                {o.name} — {o.code}
              </option>
            ))}
          </select>
          <Icon
            name="down"
            size={18}
            className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-muted"
          />
        </div>
      )}
    </SettingCard>
  )
}

/** "1250.00" for 125000 cents; empty for nothing yet or zero, so the placeholder shows. */
const toText = (cents: Cents | null, decimals: number) =>
  cents ? (cents / 10 ** decimals).toFixed(decimals) : ''

/**
 * The money held before tracking began, saved when the field is left or Enter is pressed.
 * Saving also fixes where tracking starts, if nothing has yet: the first of this month.
 */
function StartingBalanceCard() {
  const { settings, update } = useAppSettings()
  const today = useToday()
  const undoToast = useUndoToast()
  const { decimals } = settings
  const period = settings.planBy === 'payday' ? 'pay period' : 'month'
  // Only a recorded start makes the stored balance the one in use.
  const stored = settings.startDate ? settings.startingBalance : null
  const [text, setText] = useState(() => toText(stored, decimals))
  const [invalid, setInvalid] = useState(false)
  // A change made elsewhere (Money basics, a restore) shows here, unless it is already
  // what the field says, which is the case right after this field saved it.
  const [seen, setSeen] = useState({ stored, decimals })
  if (seen.stored !== stored || seen.decimals !== decimals) {
    setSeen({ stored, decimals })
    const typed = text.trim() === '' ? 0 : parseAmount(text, decimals)
    if (typed !== (stored ?? 0)) setText(toText(stored, decimals))
  }
  // Enter, then leaving the field, must not save (and toast) twice.
  const saving = useRef<Cents | null>(null)

  async function save() {
    const raw = text.trim()
    const cents = raw === '' ? 0 : parseAmount(raw, decimals)
    if (cents === null) {
      setInvalid(true)
      return
    }
    setInvalid(false)
    const unchanged = settings.startDate ? cents === settings.startingBalance : raw === ''
    if (unchanged || saving.current === cents) return
    saving.current = cents
    try {
      await update({
        startingBalance: cents,
        startDate: settings.startDate ?? monthSpan(today).start,
      })
      undoToast('Starting balance saved')
    } finally {
      saving.current = null
    }
  }

  return (
    <SettingCard
      title="Starting balance"
      body={`What’s in your account when you begin. It’s counted once, in the first ${period} you track, and never in the ones after.`}
    >
      {(ids) => (
        <div className="mt-4">
          <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            enterKeyHint="done"
            aria-labelledby={ids.title}
            aria-describedby={invalid ? `${ids.body} ${ids.title}-error` : ids.body}
            aria-invalid={invalid || undefined}
            placeholder={(0).toFixed(decimals)}
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              setInvalid(false)
            }}
            onBlur={() => void save()}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return
              e.preventDefault()
              void save()
            }}
            className={cx(inputClass, 'tabular-nums sm:w-1/4 sm:min-w-48')}
          />
          {invalid && (
            <p id={`${ids.title}-error`} className="mt-1.5 text-sm font-medium text-accent">
              Enter an amount like {decimals ? `250.${'0'.repeat(decimals)}` : '250'}
            </p>
          )}
        </div>
      )}
    </SettingCard>
  )
}

function RolloverCard() {
  const { settings, update } = useAppSettings()
  const period = settings.planBy === 'payday' ? 'pay period' : 'month'
  return (
    <SettingCard
      title="Roll over leftover money"
      body={`Whatever is left when a ${period} ends carries into the next one.`}
      trailing={(ids) => (
        <Switch
          label="Roll over leftover money"
          describedBy={ids.body}
          checked={settings.rollover}
          onChange={(rollover) => void update({ rollover })}
        />
      )}
    />
  )
}
