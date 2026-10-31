import { useState } from 'react'
import { useNavigate } from 'react-router'
import { DEMO_CAP, DEMO_DAYS, startDemo } from '../../db/demo'
import { seedDemo } from '../../db/seed/demo'
import { cx } from '../../ui/cx'
import { Icon, type IconName } from '../../ui/Icon'

/**
 * The demo's first screen (PLAN §7): two ways in, nothing else to read first. Sample
 * data is the primary path because most visitors want to see a filled-in app in seconds.
 */
export function DemoEntry() {
  const navigate = useNavigate()
  const [busy, setBusy] = useState<'sample' | 'own' | null>(null)
  const [failed, setFailed] = useState(false)

  async function choose(kind: 'sample' | 'own') {
    setBusy(kind)
    setFailed(false)
    try {
      if (kind === 'sample') await seedDemo()
      else await startDemo('own')
      // The gate re-renders on the new demo state; this only picks the first screen.
      navigate(kind === 'sample' ? '/' : '/setup', { replace: true })
    } catch {
      setFailed(true)
      setBusy(null)
    }
  }

  return (
    <div className="flex min-h-[calc(100dvh-var(--demo-banner-h,0px))] flex-col px-5 pt-8 pb-[max(env(safe-area-inset-bottom),1.5rem)]">
      <main className="animate-fade-in mx-auto flex w-full max-w-md flex-1 flex-col justify-center">
        <img
          src="/icon.svg"
          alt=""
          width={56}
          height={56}
          className="mb-6 rounded-2xl shadow-card"
        />
        <h1 className="type-display text-[2rem] leading-tight">Try Steady</h1>
        <p className="mt-2 text-base text-muted">
          See how much you can spend today, and until payday. Free, and nothing leaves this device.
        </p>

        <div className="mt-8 space-y-3">
          <Choice
            primary
            icon="sparkle"
            title="Look around with sample data"
            body="A made-up household: paid every two weeks, a few bills, two savings goals and two debts. Change anything."
            busy={busy === 'sample'}
            disabled={busy !== null}
            onClick={() => void choose('sample')}
          />
          <Choice
            icon="payday"
            title="Try with my own numbers"
            body="Three quick questions, about a minute. You can bring this setup into the full app later."
            busy={busy === 'own'}
            disabled={busy !== null}
            onClick={() => void choose('own')}
          />
        </div>

        <p aria-live="polite" className="mt-3 min-h-5 text-sm font-medium text-accent">
          {failed && 'That didn’t start. Private browsing can block storage; try a normal tab.'}
        </p>

        <p className="mt-4 flex items-start gap-2 text-sm text-muted">
          <Icon name="info" size={18} className="mt-0.5 shrink-0" />
          <span>
            The demo holds up to {DEMO_CAP} entries and starts fresh after {DEMO_DAYS} days.
            Estimates only, not financial advice.
          </span>
        </p>
      </main>
    </div>
  )
}

function Choice({
  primary = false,
  icon,
  title,
  body,
  busy,
  disabled,
  onClick,
}: {
  primary?: boolean
  icon: IconName
  title: string
  body: string
  busy: boolean
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-busy={busy || undefined}
      className={cx(
        'flex w-full items-start gap-4 rounded-3xl p-5 text-left transition-[filter,background-color,transform] active:scale-[0.99] disabled:opacity-60',
        primary
          ? 'bg-accent text-accent-contrast shadow-card hover:brightness-105'
          : 'bg-surface shadow-card ring-1 ring-line hover:bg-accent-soft/40',
      )}
    >
      <span
        className={cx(
          'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl',
          primary ? 'bg-accent-contrast/15' : 'bg-accent-soft text-accent',
        )}
      >
        <Icon name={icon} size={22} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[1.0625rem] font-semibold">
          {busy ? 'Getting it ready…' : title}
        </span>
        <span className={cx('mt-0.5 block text-[0.9375rem]', !primary && 'text-muted')}>
          {body}
        </span>
      </span>
      <Icon name="chevron" size={18} className="mt-3 shrink-0 opacity-70" />
    </button>
  )
}
