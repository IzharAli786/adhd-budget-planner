import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import {
  continuedInBrowser,
  INSTALL_FLOW,
  promptInstall,
  setContinuedInBrowser,
} from '../../lib/install'
import { Button } from '../../ui/Button'
import { Icon } from '../../ui/Icon'
import { InstallScreen } from './InstallScreen'
import { useInstallContext } from './useInstall'

/**
 * Install-first onboarding (PLAN §6). Only iOS and in-app browsers are blocked by a full
 * screen: that is where a browser tab's data is separate from (or less durable than) the
 * installed app's. On Android and desktop the tab and the app share storage, so an
 * install button in a banner is enough. Skipped in dev so localhost stays usable.
 */
export function InstallGate({ children }: { children: ReactNode }) {
  const ctx = useInstallContext()
  const [continued, setContinued] = useState(continuedInBrowser)

  const blocks = (ctx === 'ios' || ctx === 'in-app') && !continued
  if (import.meta.env.DEV || !INSTALL_FLOW || !blocks) return children

  return (
    <InstallScreen
      onContinue={() => {
        setContinuedInBrowser(true)
        setContinued(true)
      }}
    />
  )
}

/** Persistent reminder in the shell for people who chose the browser, or can install. */
export function InstallBanner() {
  const ctx = useInstallContext()
  const [hidden, setHidden] = useState(false)

  if (!INSTALL_FLOW || hidden || ctx === 'installed' || ctx === 'unsupported') return null
  if ((ctx === 'ios' || ctx === 'in-app') && !continuedInBrowser()) return null

  return (
    <div className="border-b border-line bg-accent-soft pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex max-w-2xl items-center gap-3 px-5 py-2 md:px-10">
        <Icon name="phone" size={18} className="shrink-0 text-accent" />
        <p className="min-w-0 flex-1 text-sm">
          {ctx === 'prompt'
            ? 'Install Steady to use it offline, like an app.'
            : 'You’re in the browser. Data here is separate from the installed app.'}
        </p>
        {ctx === 'prompt' ? (
          <Button className="shrink-0 px-4" onClick={() => void promptInstall()}>
            Install
          </Button>
        ) : (
          <Link
            to="/more/install"
            className="min-h-11 shrink-0 content-center px-2 text-sm font-semibold text-accent"
          >
            How to install
          </Link>
        )}
        {ctx === 'prompt' && (
          <button
            type="button"
            aria-label="Not now"
            onClick={() => setHidden(true)}
            className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full text-muted"
          >
            <Icon name="close" size={18} />
          </button>
        )}
      </div>
    </div>
  )
}
