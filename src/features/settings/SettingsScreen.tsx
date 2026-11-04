import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useAppSettings } from '../../app/SettingsProvider'
import { getChangesSinceBackup, getMeta } from '../../db/repos'
import { accentTokens, checkAccent, HEX_COLOR, type Mode } from '../../domain/accent'
import { DISPLAY_NAME_MAX } from '../../domain/greeting'
import {
  THEMES,
  type ColorMode,
  type DateStyle,
  type MotionPreference,
  type Theme,
  type WeekStart,
} from '../../domain/settings'
import type { Instant } from '../../domain/types'
import { todayISO } from '../../lib/clock'
import { askBadgePermission, badgeEnabled, badgePlatform } from '../../lib/badge'
import { formatBytes, requestPersist, storageStatus, type StorageStatus } from '../../lib/storage'
import { useMediaQuery } from '../../lib/useMediaQuery'
import { Button } from '../../ui/Button'
import { cx } from '../../ui/cx'
import { Field, inputClass } from '../../ui/Field'
import { Icon } from '../../ui/Icon'
import { IconTile } from '../../ui/IconTile'
import { ListGroup, ListRow } from '../../ui/List'
import { PageHeader } from '../../ui/PageHeader'
import { Segmented } from '../../ui/Segmented'
import { Switch } from '../../ui/Switch'
import { relativeDays } from '../backup/relative'
import { makeFormatters, useFormat } from '../bills/format'
import { LocalePickers } from '../setup/LocaleLine'

const THEME_LABELS: Record<Theme, string> = {
  clay: 'Clay',
  sage: 'Sage',
  ocean: 'Ocean',
  blush: 'Blush',
  sand: 'Sand',
  midnight: 'Midnight',
}

const MODES = [
  { value: 'auto', label: 'Auto' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
] as const satisfies readonly { value: ColorMode; label: string }[]

const TEXT_SIZES = [
  { value: 100, label: 'A', name: 'Default text size' },
  { value: 115, label: <span className="text-[1.1em]">A</span>, name: 'Large text, 115%' },
  { value: 130, label: <span className="text-[1.25em]">A</span>, name: 'Larger text, 130%' },
  { value: 150, label: <span className="text-[1.4em]">A</span>, name: 'Largest text, 150%' },
] as const

const MOTION = [
  { value: 'auto', label: 'Like my device' },
  { value: 'off', label: 'Less' },
  { value: 'on', label: 'Full' },
] as const satisfies readonly { value: MotionPreference; label: string }[]

export function SettingsScreen() {
  const { settings, update } = useAppSettings()
  const isMidnight = settings.theme === 'midnight'
  const themeGroup = useRef<HTMLDivElement>(null)

  // Radio-group keyboard contract, same as <Segmented>: arrows move AND select.
  function onThemeKey(e: KeyboardEvent<HTMLDivElement>) {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]
    if (!step) return
    e.preventDefault()
    const i = Math.max(0, THEMES.indexOf(settings.theme))
    const next = THEMES[(i + step + THEMES.length) % THEMES.length]!
    void update({ theme: next })
    themeGroup.current?.querySelector<HTMLElement>(`[data-theme='${next}']`)?.focus()
  }

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="How Steady looks and works. Change any of it, any time."
      />
      <div className="space-y-8">
        <NameSection />

        <ListGroup title="Money">
          <ListRow
            icon="info"
            label="Getting started"
            detail="Currency, starting balance, roll over, and what each section does"
            to="/getting-started"
          />
          <ListRow
            icon="wallet"
            label="Money basics"
            detail="Cushion, month or payday, and when tracking starts"
            to="/more/basics"
          />
        </ListGroup>

        <Section title="Theme" id="theme-label">
          <div
            ref={themeGroup}
            role="radiogroup"
            aria-labelledby="theme-label"
            onKeyDown={onThemeKey}
            className="grid grid-cols-3 gap-3 sm:grid-cols-6"
          >
            {THEMES.map((theme) => (
              <ThemeSwatch
                key={theme}
                theme={theme}
                selected={settings.theme === theme}
                onSelect={() => void update({ theme })}
              />
            ))}
          </div>
          <AccentPicker />
        </Section>

        <Section title="Light or dark">
          <Segmented
            label="Light or dark"
            value={isMidnight ? 'dark' : settings.mode}
            options={MODES}
            onChange={(mode) => void update({ mode })}
          />
          {isMidnight && <p className="mt-2 text-sm text-muted">Midnight is always dark.</p>}
        </Section>

        <Section title="Text size">
          <Segmented
            label="Text size"
            value={settings.largeText}
            options={TEXT_SIZES}
            onChange={(largeText) => void update({ largeText })}
          />
        </Section>

        <Section title="Motion">
          <Segmented
            label="Motion"
            value={settings.reducedMotion}
            options={MOTION}
            onChange={(reducedMotion) => void update({ reducedMotion })}
          />
        </Section>

        <RegionSection />

        <Section title="Tools">
          <div className="card flex items-center gap-3 px-4 py-2">
            <div className="min-w-0 flex-1 py-1.5">
              <p className="font-medium">Show more tools</p>
              <p className="text-sm text-muted">
                Home, Goals, Savings, Debt, Envelopes and the yearly review. Turn it off for a
                simpler app; nothing is deleted.
              </p>
            </div>
            <Switch
              label="Show more tools"
              checked={!settings.simpleMode}
              onChange={(on) => void update({ simpleMode: !on })}
            />
          </div>
        </Section>

        <BadgeSetting />

        <BackupsGroup />

        <StorageCard />
      </div>
    </>
  )
}

/** Backups live on their own screen (save, restore, erase everything); this is the way in. */
function BackupsGroup() {
  const lastBackupAt = useLiveQuery(() => getMeta<Instant>('lastBackupAt'))
  const changes = useLiveQuery(getChangesSinceBackup)
  return (
    <ListGroup title="Backups">
      <ListRow
        icon="shield"
        label="Backup, restore & erase"
        detail={
          lastBackupAt
            ? `Last backup ${relativeDays(lastBackupAt)}${changes ? ` · ${changes} ${changes === 1 ? 'change' : 'changes'} since` : ''}`
            : 'No backup yet'
        }
        to="/more/backup"
      />
    </ListGroup>
  )
}

/** Optional first name for Today's greeting. Settings only: setup stays four questions. */
function NameSection() {
  const { settings, update } = useAppSettings()
  const id = useId()
  // Local while typing: the saved row comes back through IndexedDB a moment later, and
  // feeding that into the field would move the caret.
  const [name, setName] = useState(settings.displayName)
  return (
    <Section title="You">
      <div className="card p-5">
        <Field
          id={id}
          label="Your name (optional)"
          hint="Only used to say hello on Today. It stays on this device."
        >
          <input
            id={id}
            type="text"
            value={name}
            maxLength={DISPLAY_NAME_MAX}
            autoComplete="given-name"
            placeholder="e.g. Sam"
            aria-describedby={`${id}-hint`}
            onChange={(e) => {
              setName(e.target.value)
              void update({ displayName: e.target.value.trim() })
            }}
            className={inputClass}
          />
        </Field>
      </div>
    </Section>
  )
}

/**
 * A custom accent on top of the theme. A colour that would make accent text or buttons
 * hard to read is refused, and the nearest readable shade of it is offered instead.
 */
function AccentPicker() {
  const { settings, update } = useAppSettings()
  const id = useId()
  const custom = settings.accent
  // Judged and shown in the mode on screen, so a dark-mode pick isn't held to light mode.
  const osDark = useMediaQuery('(prefers-color-scheme: dark)')
  const mode: Mode =
    settings.theme === 'midnight' ||
    settings.mode === 'dark' ||
    (settings.mode === 'auto' && osDark)
      ? 'dark'
      : 'light'
  const other: Mode = mode === 'light' ? 'dark' : 'light'
  const tokens = custom ? accentTokens(custom, settings.theme) : null
  const fallback = useMemo(() => themeAccent(settings.theme, mode), [settings.theme, mode])
  const shown = tokens?.[mode].accent ?? fallback
  const [draft, setDraft] = useState('')
  const [suggestion, setSuggestion] = useState<string | null>(null)
  const otherShade =
    tokens !== null && settings.theme !== 'midnight' && tokens[other].accent !== tokens[mode].accent

  function pick(color: string) {
    setDraft(color)
    if (!HEX_COLOR.test(color)) return
    const check = checkAccent(color, settings.theme, mode)
    if (check.ok) {
      setSuggestion(null)
      void update({ accent: color.toLowerCase() })
    } else setSuggestion(check.suggestion)
  }

  return (
    <div className="card mt-3 p-5">
      <div className="flex flex-wrap items-center gap-4">
        <input
          id={id}
          type="color"
          // A refused colour stays in the well so the person sees what was refused.
          value={suggestion && HEX_COLOR.test(draft) ? draft : shown}
          onChange={(e) => pick(e.target.value)}
          className="h-11 w-16 shrink-0 cursor-pointer rounded-xl border border-line bg-surface p-1"
        />
        <div className="min-w-0 flex-1">
          <label htmlFor={id} className="block font-medium">
            Accent colour
          </label>
          <p className="text-sm text-muted">
            {custom
              ? `Your own colour${otherShade ? `, with a ${other === 'dark' ? 'lighter' : 'deeper'} shade of it in ${other} mode` : ''}.`
              : 'Using the theme’s colour. Pick any colour that stays easy to read.'}
          </p>
        </div>
        {custom && (
          <Button
            variant="ghost"
            onClick={() => {
              setSuggestion(null)
              void update({ accent: null })
            }}
          >
            Use the theme’s colour
          </Button>
        )}
      </div>
      <div aria-live="polite">
        {suggestion && (
          <div className="mt-4 rounded-2xl bg-bg p-4">
            <p className="text-body">
              That colour would be hard to read as text and on buttons here, so it wasn’t used. The
              nearest shade that reads well:
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <span
                aria-hidden="true"
                className="h-9 w-9 shrink-0 rounded-xl ring-1 ring-line"
                style={{ background: suggestion }}
              />
              <span className="font-mono text-sm">{suggestion}</span>
              <Button variant="secondary" size="md" onClick={() => pick(suggestion)}>
                Use this shade
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// The theme's own accent as the picker's starting point. Read from the stylesheet, so it
// is whatever app.css says, for the mode on screen.
function themeAccent(theme: Theme, mode: Mode): string {
  const probe = document.createElement('span')
  probe.dataset.theme = theme
  probe.hidden = true
  document.body.append(probe)
  const value = getComputedStyle(probe)
    .getPropertyValue(mode === 'dark' ? '--d-accent' : '--l-accent')
    .trim()
    .toLowerCase()
  probe.remove()
  return HEX_COLOR.test(value) ? value : '#a9502b'
}

const DATE_STYLE_OPTIONS = [
  { value: 'words', label: 'Words' },
  { value: 'numbers', label: 'Numbers' },
] as const satisfies readonly { value: DateStyle; label: string }[]

const WEEK_DAYS: WeekStart[] = [1, 2, 3, 4, 5, 6, 0]

/**
 * Locale, currency, week start and date style (PLAN §8), with a live preview line so a
 * change shows its effect right here, before going back to Today.
 */
function RegionSection() {
  const { settings, update } = useAppSettings()
  const f = useFormat()
  const weekId = useId()
  const today = todayISO()
  // Each option shows today in its own style, so the choice is visible, not described.
  // Day names are words in the (English, v1) UI, not part of the chosen format.
  const dayName = (d: WeekStart) => makeFormatters('en-IE', 'EUR', 2).weekday(d, 'long')
  const sample = (style: DateStyle) =>
    makeFormatters(settings.locale, settings.currency, settings.decimals, style).day(today)

  return (
    <Section title="Region & format">
      <div className="space-y-4 rounded-[1.5rem] bg-surface p-5 shadow-card ring-1 ring-line">
        <p aria-live="polite" className="rounded-2xl bg-bg px-4 py-3 text-[0.9375rem] tabular-nums">
          <span className="sr-only">Preview: </span>
          {f.day(today)} · {f.money(123456)} · week starts {dayName(settings.weekStart)}
        </p>
        <LocalePickers sameDecimalsOnly />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id={weekId} label="Week starts on">
            <select
              id={weekId}
              value={settings.weekStart}
              onChange={(e) => void update({ weekStart: Number(e.target.value) as WeekStart })}
              className={`${inputClass} appearance-none`}
            >
              {WEEK_DAYS.map((d) => (
                <option key={d} value={d}>
                  {dayName(d)}
                </option>
              ))}
            </select>
          </Field>
          <div className="space-y-1.5">
            <p aria-hidden="true" className="text-sm font-medium">
              Dates
            </p>
            <Segmented
              label="Date style"
              value={settings.dateStyle}
              options={DATE_STYLE_OPTIONS.map((o) => ({
                value: o.value,
                label: sample(o.value),
                name: `${o.label}, like ${sample(o.value)}`,
              }))}
              onChange={(dateStyle) => void update({ dateStyle })}
            />
          </div>
        </div>
      </div>
    </Section>
  )
}

function Section({ title, id, children }: { title: string; id?: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 id={id} className="px-1 eyebrow text-muted">
        {title}
      </h2>
      {children}
    </section>
  )
}

// The swatch sets data-theme on itself, so the theme's own --l-*/--d-* tokens from app.css
// paint it: the preview can never drift from the real theme.
function ThemeSwatch({
  theme,
  selected,
  onSelect,
}: {
  theme: Theme
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      tabIndex={selected ? 0 : -1}
      onClick={onSelect}
      data-theme={theme}
      className={cx(
        'group flex flex-col items-center gap-2 rounded-2xl p-2 transition-colors',
        selected ? 'bg-accent-soft/70' : 'hover:bg-accent-soft/40',
      )}
    >
      {/* A tiny preview: a light card and a dark card on their own backgrounds. */}
      <span
        className={cx(
          'relative block h-16 w-full overflow-hidden rounded-xl ring-1 ring-line transition-shadow',
          selected && 'ring-2 ring-[var(--l-accent)]',
        )}
        style={{
          background:
            theme === 'midnight'
              ? 'radial-gradient(120% 100% at 50% 0%, color-mix(in oklab, var(--d-accent) 28%, var(--d-bg)), var(--d-bg))'
              : 'linear-gradient(135deg, var(--l-bg) 50%, var(--d-bg) 50%)',
        }}
      >
        <MiniCard surface="var(--l-surface)" accent="var(--l-accent)" className="top-2 left-2" />
        <MiniCard
          surface="var(--d-surface)"
          accent="var(--d-accent)"
          className="right-2 bottom-2"
        />
        {selected && (
          <span
            className="absolute top-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-full shadow-sm"
            style={{ background: 'var(--l-accent)', color: 'var(--l-surface)' }}
          >
            <Icon name="check" size={14} weight="bold" />
          </span>
        )}
      </span>
      <span className="text-sm font-medium">{THEME_LABELS[theme]}</span>
    </button>
  )
}

function MiniCard({
  surface,
  accent,
  className,
}: {
  surface: string
  accent: string
  className: string
}) {
  return (
    <span
      className={cx(
        'absolute flex h-7 w-12 flex-col justify-center gap-1 rounded-lg px-1.5 shadow-sm',
        className,
      )}
      style={{ background: surface }}
    >
      <span className="h-1.5 w-7 rounded-full" style={{ background: accent }} />
      <span className="h-1 w-5 rounded-full opacity-30" style={{ background: accent }} />
    </span>
  )
}

// Bills due within 2 days plus 48h items ready to decide, on the home-screen icon.
// On by default in Chromium; iOS needs the notification permission, so it is opt-in.
function BadgeSetting() {
  const { settings, update } = useAppSettings()
  const [denied, setDenied] = useState(false)
  const platform = badgePlatform()
  if (platform === 'none') return null
  const on = badgeEnabled(platform, settings.appBadge)

  async function toggle(next: boolean) {
    setDenied(false)
    if (next && platform === 'ios' && !(await askBadgePermission())) {
      setDenied(true)
      return
    }
    await update({ appBadge: next })
  }

  return (
    <Section title="Reminders">
      <div className="card px-4 py-2">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1 py-1.5">
            <p className="font-medium">Number on the app icon</p>
            <p className="text-sm text-muted">
              Bills due in the next 2 days, plus 48h items ready to decide.
              {platform === 'ios' &&
                ' Your iPhone asks to allow notifications first; Steady only uses it for this number.'}
            </p>
          </div>
          <Switch label="Number on the app icon" checked={on} onChange={(v) => void toggle(v)} />
        </div>
        {denied && (
          <p className="pb-2 text-sm text-muted">
            Notifications are off for Steady. You can allow them in your iPhone’s Settings.
          </p>
        )}
      </div>
    </Section>
  )
}

function StorageCard() {
  const [status, setStatus] = useState<StorageStatus | null>(null)
  const [asked, setAsked] = useState(false)

  useEffect(() => {
    let live = true
    void storageStatus().then((s) => live && setStatus(s))
    return () => {
      live = false
    }
  }, [])

  if (!status?.supported) return null

  return (
    <section className="space-y-3">
      <h2 className="px-1 eyebrow text-muted">Storage</h2>
      <div className="card p-5">
        <div className="flex items-start gap-3">
          <IconTile icon="shield" tone={status.persisted ? 'success' : 'neutral'} />
          <div className="min-w-0 flex-1">
            <p className="font-medium">
              {status.persisted ? 'Protected storage is on' : 'Storage can be cleared'}
            </p>
            <p className="text-sm text-muted">
              {status.persisted
                ? 'Your browser will not clear Steady’s data to free up space.'
                : 'If your device runs low on space, the browser may clear it. Keep backups.'}
              {status.usage !== undefined &&
                ` Using ${formatBytes(status.usage)}${status.quota ? ` of ${formatBytes(status.quota)} available` : ''}.`}
            </p>
          </div>
        </div>
        {!status.persisted && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button
              variant="secondary"
              onClick={async () => {
                await requestPersist()
                setAsked(true)
                setStatus(await storageStatus())
              }}
            >
              Ask to protect it
            </Button>
            {asked && (
              <p className="text-sm text-muted">
                Not granted yet. Installing the app usually helps.
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
