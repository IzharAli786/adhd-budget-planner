import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import {
  continuedInBrowser,
  dismissInstallBanner,
  INSTALL_FLOW,
  installBannerDismissed,
  promptInstall,
  setContinuedInBrowser,
} from '../../lib/install'
import { Button, buttonClass } from '../../ui/Button'
import { Icon } from '../../ui/Icon'
import { cx } from '../../ui/cx'
import { IconButton } from '../../ui/IconButton'
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
  const [hidden, setHidden] = useState(installBannerDismissed)

  if (!INSTALL_FLOW || hidden || ctx === 'installed' || ctx === 'unsupported') return null
  if ((ctx === 'ios' || ctx === 'in-app') && !continuedInBrowser()) return null

  return (
    // A full-width strip in the info tone (the same recipe as Notice): a status, not an
    // accent action, so the Install button is the one accent thing in it.
    <div className="print-hide border-b border-tone-info-line bg-tone-info-bg pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex max-w-2xl items-center gap-3 px-5 py-2 md:px-10">
        <Icon name="phone" size={20} className="shrink-0 text-tone-info" />
        <p className="min-w-0 flex-1 text-sm text-text">
          {ctx === 'prompt'
            ? 'Install Steady to use it offline, like an app.'
            : 'You’re in the browser. Data here is separate from the installed app.'}
        </p>
        {ctx === 'prompt' ? (
          <Button onClick={() => void promptInstall()}>Install</Button>
        ) : (
          <Link to="/more/install" className={cx(buttonClass('text', 'sm'), '-mr-2.5')}>
            How to install
          </Link>
        )}
        {ctx === 'prompt' && (
          <IconButton
            icon="close"
            label="Not now"
            size="sm"
            onClick={() => {
              dismissInstallBanner()
              setHidden(true)
            }}
            className="-mr-3"
          />
        )}
      </div>
    </div>
  )
}
