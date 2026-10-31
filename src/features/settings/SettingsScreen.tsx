import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useAppSettings } from '../../app/SettingsProvider'
import { THEMES, type ColorMode, type MotionPreference, type Theme } from '../../domain/settings'
import { askBadgePermission, badgeEnabled, badgePlatform } from '../../lib/badge'
import { formatBytes, requestPersist, storageStatus, type StorageStatus } from '../../lib/storage'
import { Button } from '../../ui/Button'
import { cx } from '../../ui/cx'
import { Icon } from '../../ui/Icon'
import { PageHeader } from '../../ui/PageHeader'
import { Segmented } from '../../ui/Segmented'
import { Switch } from '../../ui/Switch'

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
      <PageHeader title="Appearance & settings" back={{ to: '/more', label: 'More' }} />
      <div className="space-y-8">
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

        <Section title="Tools">
          <div className="card flex items-center gap-3 px-4 py-2">
            <div className="min-w-0 flex-1 py-1.5">
              <p className="font-medium">Show more tools</p>
              <p className="text-sm text-muted">
                Adds Plan and Goals. Turning it off hides them; nothing is deleted.
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

        <StorageCard />
      </div>
    </>
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
            <Icon name="check" size={13} strokeWidth={2.75} />
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
          <span
            className={cx(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
              status.persisted ? 'bg-accent text-accent-contrast' : 'bg-accent-soft text-accent',
            )}
          >
            <Icon name={status.persisted ? 'check' : 'shield'} size={19} />
          </span>
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
