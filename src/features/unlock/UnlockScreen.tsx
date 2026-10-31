import { useId, useRef, useState, type FormEvent } from 'react'
import { checkCode, CODE_LENGTH, CODE_PREFIX, codeBody, formatCodeBody } from '../../unlock/unlock'
import { Button } from '../../ui/Button'
import { cx } from '../../ui/cx'
import { inputClass } from '../../ui/Field'
import { Icon } from '../../ui/Icon'
import { InstallBanner } from '../install/InstallGate'

export const DEMO_URL = import.meta.env.VITE_DEMO_URL || 'https://demo.steadyplanner.app'

/** After this many misses each try takes a second. Cosmetic: it only slows guessing a bit. */
export const FREE_TRIES = 5
const SLOW_DOWN_MS = 1000

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * The first screen of the full app (PLAN §7). Kind by design: a wrong code is almost
 * always a typo or a look-alike character, never treated as an attempt to cheat.
 */
export function UnlockScreen({ onUnlock }: { onUnlock: (hashPrefix: string) => Promise<unknown> }) {
  const inputId = useId()
  const [value, setValue] = useState('')
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const misses = useRef(0)
  const inputRef = useRef<HTMLInputElement>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (checking) return
    setChecking(true)
    setError(null)
    try {
      if (misses.current >= FREE_TRIES) await wait(SLOW_DOWN_MS)
      const result = await checkCode(value)
      if (result.ok) {
        await onUnlock(result.hashPrefix)
        return
      }
      if (result.reason === 'incomplete') {
        const n = codeBody(value).length
        setError(
          n === 0
            ? 'Type or paste the code from your PDF. It starts with STEADY.'
            : `That’s ${n} of ${CODE_LENGTH} characters. The rest is in your PDF, after STEADY.`,
        )
      } else {
        misses.current += 1
        setError(
          misses.current >= FREE_TRIES
            ? 'Still no match. Copy the code straight from the PDF and paste it here, dashes and all.'
            : 'That code didn’t match. Look-alikes like 8 and B are easy to mix up. Try once more?',
        )
      }
      inputRef.current?.focus()
    } finally {
      setChecking(false)
    }
  }

  return (
    <>
      {/* Install comes first (PLAN §6); on Android and desktop that is just this banner. */}
      <InstallBanner />
      <div className="flex min-h-dvh flex-col px-5 pt-[max(env(safe-area-inset-top),2rem)] pb-[max(env(safe-area-inset-bottom),1.5rem)]">
        <main className="animate-fade-in mx-auto flex w-full max-w-sm flex-1 flex-col justify-center">
          <img
            src="/icon.svg"
            alt=""
            width={56}
            height={56}
            className="mb-6 rounded-2xl shadow-card"
          />
          <h1 className="text-[2rem] leading-tight font-semibold tracking-tight">
            Welcome to Steady
          </h1>
          <p className="mt-2 text-base text-muted">
            Enter the code from your PDF to unlock the app. You only need to do this once.
          </p>

          <form
            noValidate
            onSubmit={(e) => void submit(e)}
            className="mt-8 rounded-3xl bg-surface p-5 shadow-card ring-1 ring-line"
          >
            <label htmlFor={inputId} className="block text-sm font-medium">
              Unlock code
            </label>
            <div className="relative mt-1.5">
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 left-4 flex items-center font-medium tracking-wider text-muted"
              >
                {CODE_PREFIX}-
              </span>
              <input
                ref={inputRef}
                id={inputId}
                type="text"
                value={value}
                // Pasting the whole "STEADY-…" code, lower case or with spaces, all work:
                // formatCodeBody strips the prefix and regroups what is left.
                onChange={(e) => setValue(formatCodeBody(e.target.value))}
                placeholder="XXXX-XXXX-XXXX-XXXX"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="characters"
                spellCheck={false}
                enterKeyHint="go"
                aria-invalid={error ? true : undefined}
                aria-describedby={`${inputId}-msg`}
                className={cx(
                  inputClass,
                  'pl-[5.5rem] font-medium tracking-wider tabular-nums uppercase placeholder:normal-case placeholder:tracking-normal',
                )}
              />
            </div>
            <p
              id={`${inputId}-msg`}
              aria-live="polite"
              className={cx(
                'mt-2 min-h-5 text-sm',
                error ? 'font-medium text-accent' : 'text-muted',
              )}
            >
              {error ?? '16 letters and numbers. Dashes are added for you.'}
            </p>
            <Button type="submit" size="lg" block className="mt-4" disabled={checking}>
              {checking ? 'Checking…' : 'Unlock'}
            </Button>
          </form>

          <p className="mt-6 flex items-center gap-2 text-sm text-muted">
            <Icon name="shield" size={18} className="shrink-0" />
            Your numbers stay on this device. There’s no account and no tracking.
          </p>
        </main>

        <footer className="mx-auto mt-8 w-full max-w-sm text-center">
          <a
            href={DEMO_URL}
            target="_blank"
            rel="noopener"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-[0.9375rem] font-medium text-accent hover:bg-accent-soft/60"
          >
            No code? Try the free demo
            <Icon name="external" size={16} />
          </a>
        </footer>
      </div>
    </>
  )
}
