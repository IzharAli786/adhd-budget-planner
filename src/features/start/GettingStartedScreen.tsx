import { useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useAppSettings } from '../../app/SettingsProvider'
import { db } from '../../db/schema'
import { CURRENCY_CODES, currencyDecimals } from '../../domain/currencies'
import { parseAmount, type Cents } from '../../domain/money'
import { monthSpan } from '../../domain/safeToSpend'
import { useToday } from '../../lib/useToday'
import { cx } from '../../ui/cx'
import { FieldError, inputClass } from '../../ui/Field'
import { Icon } from '../../ui/Icon'
import { PageHeader } from '../../ui/PageHeader'
import { Switch } from '../../ui/Switch'
import { useToast } from '../../ui/Toast'
import { displayName } from '../setup/LocaleLine'
import { SECTION_GUIDE } from './sections'

/** A card's own title: the display face, one step above body text. */
const cardTitle = 'card-title'

/**
 * Getting started: the few numbers everything is built on (currency, starting balance,
 * roll over), then a line on what each section is for, in the order the menu lists them.
 * Every setting saves on its own; there is no "Save" to forget.
 */
export function GettingStartedScreen() {
  const { settings, loaded } = useAppSettings()
  // Simple mode hides the bigger tools, so the guide only describes what is on screen.
  const sections = SECTION_GUIDE.filter((s) => !settings.simpleMode || !s.full)
  const amountsStored = useAmountsStored()

  return (
    <>
      <PageHeader
        title="Getting started"
        subtitle="A short tour, and the few numbers everything is built on."
      />
      {/* The cards show stored values, so they wait for them instead of flashing defaults. */}
      {loaded && amountsStored !== undefined ? (
        <div className="space-y-4">
          <CurrencyCard sameDecimalsOnly={amountsStored} />
          <StartingBalanceCard />
          <RolloverCard />
        </div>
      ) : (
        <div aria-hidden="true" className="h-96 animate-pulse rounded-3xl bg-surface" />
      )}

      <section aria-labelledby="section-guide-title" className="mt-10 space-y-3">
        <h2 id="section-guide-title" className="section-title">
          How each section works
        </h2>
        <ul className="card divide-y divide-line px-5 py-4 sm:px-6 sm:py-5">
          {sections.map((s) => (
            <li key={s.to} className="py-3.5">
              <h3 className={cardTitle}>{s.label}</h3>
              <p className="mt-0.5 text-sm text-muted">{s.body}</p>
            </li>
          ))}
        </ul>
      </section>
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
    <section aria-labelledby={ids.title} className="card p-5 sm:p-6">
      <div className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <h2 id={ids.title} className={cardTitle}>
            {title}
          </h2>
          <p id={ids.body} className="mt-0.5 text-base leading-relaxed">
            {body}
          </p>
        </div>
        {trailing?.(ids)}
      </div>
      {children?.(ids)}
    </section>
  )
}

/**
 * Whether any amount is saved yet, undefined while checking. Amounts are stored in the
 * currency's smallest unit, so once one exists a currency with other decimals would change
 * its value (1250 is €12.50 but ¥1,250). Deleted rows count: they can still be restored.
 */
function useAmountsStored(): boolean | undefined {
  const { settings } = useAppSettings()
  const inTables = useLiveQuery(async () => {
    const tables = [
      db.incomes,
      db.bills,
      db.billOccurrences,
      db.envelopes,
      db.transactions,
      db.checkIns,
      db.funds,
      db.debts,
      db.impulse,
    ]
    for (const table of tables) if ((await table.count()) > 0) return true
    return false
  })
  if (settings.startingBalance !== 0 || settings.buffer !== 0) return true
  return inTables
}

function CurrencyCard({ sameDecimalsOnly }: { sameDecimalsOnly: boolean }) {
  const { settings, update } = useAppSettings()
  const hintId = useId()
  // By name, the way people look for their own currency ("Euro", "US Dollar").
  const options = useMemo(() => {
    const codes: string[] = CURRENCY_CODES.filter(
      (c) => !sameDecimalsOnly || currencyDecimals(c) === settings.decimals,
    )
    // An older install may hold a code that is no longer offered; keep it selectable.
    if (!codes.includes(settings.currency)) codes.push(settings.currency)
    return codes
      .map((code) => ({ code, name: displayName('currency', code) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'en'))
  }, [settings.currency, settings.decimals, sameDecimalsOnly])

  return (
    <SettingCard title="Your currency" body="Steady shows every amount in this currency.">
      {(ids) => (
        <>
          <div className="relative mt-3 w-full sm:w-fit">
            <select
              aria-labelledby={ids.title}
              aria-describedby={sameDecimalsOnly ? `${ids.body} ${hintId}` : ids.body}
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
          {sameDecimalsOnly && (
            <p id={hintId} className="mt-2 text-sm text-muted">
              Only currencies with the same decimals are listed, so your saved amounts keep their
              value.
            </p>
          )}
        </>
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
  const toast = useToast()
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
    // Settings writes stay out of the shared undo log, so Undo here puts back these two
    // values itself; reverting "the last change" would undo something unrelated instead.
    const before = { startingBalance: settings.startingBalance, startDate: settings.startDate }
    try {
      await update({
        startingBalance: cents,
        startDate: settings.startDate ?? monthSpan(today).start,
      })
      toast.show({
        message: 'Starting balance saved',
        duration: 10_000,
        action: { label: 'Undo', onAction: () => void update(before) },
      })
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
        <div className="mt-4 mb-3">
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
            <div className="mt-1.5">
              <FieldError id={`${ids.title}-error`}>
                Enter an amount like {decimals ? `250.${'0'.repeat(decimals)}` : '250'}
              </FieldError>
            </div>
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
