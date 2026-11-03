import { useCallback, useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router'
import { CatchUpProvider } from '../features/catchup/CatchUpProvider'
import { InstallBanner } from '../features/install/InstallGate'
import { QuickAddProvider } from '../features/quickadd/QuickAddProvider'
import { purgeDeleted } from '../db/repos'
import { requestPersist } from '../lib/storage'
import { AppBadge } from './AppBadge'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { TabBar } from './TabBar'
import { UpdateToast } from './UpdateToast'

const WIDE = new Set([
  '/',
  '/home',
  '/envelopes',
  '/savings',
  '/debt',
  '/review',
  '/getting-started',
  '/bills',
  '/plan',
  '/goals',
  '/more',
  '/more/transactions',
  '/more/help',
  // Look back: four tiles and a wide table.
  '/more/review',
])

export function AppShell() {
  // The shell only mounts once setup is done, so this is "after setup", and again on
  // every later open until the browser grants it (PLAN §6). Asking is idempotent.
  // Rows past their 30 days in Recently deleted go for good on open (PLAN §8).
  useEffect(() => {
    void requestPersist()
    void purgeDeleted()
  }, [])
  // Tab screens use the wide content area on desktop (two columns, 3-up strips); the
  // nested settings-style screens keep a calm reading measure.
  const { pathname } = useLocation()
  const wide = WIDE.has(pathname)
  // The path the "works offline" note appeared on; it goes once the person moves on.
  const [offlineAt, setOfflineAt] = useState<string | null>(null)
  const onOfflineReady = useCallback(() => setOfflineAt(window.location.pathname), [setOfflineAt])

  return (
    // Quick-add lives here, not per screen: the floating + and the `n` key work on every tab.
    <QuickAddProvider>
      <CatchUpProvider>
        {/* No room kept for the side rail on paper: the rail itself is hidden in print. */}
        <div className="min-h-dvh md:pl-24 lg:pl-56 print:pl-0!">
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:bg-surface focus:px-4 focus:py-2"
          >
            Skip to content
          </a>
          <InstallBanner />
          <main
            id="main"
            className={cx(
              // Phones: room under the last card for the tab bar AND the floating +, so
              // scrolled to the end, nothing sits beneath the button.
              'mx-auto w-full max-w-md px-4 pt-[max(env(safe-area-inset-top),1.25rem)] pb-[calc(10rem+env(safe-area-inset-bottom))] min-[400px]:px-5',
              'md:max-w-2xl md:px-10 md:pt-12 md:pb-16',
              wide && 'lg:max-w-6xl lg:px-12',
            )}
          >
            {offlineAt === pathname && <OfflineNote onDismiss={() => setOfflineAt(null)} />}
            <Outlet />
          </main>
          <TabBar />
          <UpdateToast onOfflineReady={onOfflineReady} />
          <AppBadge />
        </div>
      </CatchUpProvider>
    </QuickAddProvider>
  )
}

/** A slim, in-flow note: it pushes the page down a line instead of covering anything. */
function OfflineNote({ onDismiss }: { onDismiss: () => void }) {
  return (
    // No live region: it isn't news about anything the person did, just a quiet fact.
    <div className="print-hide mb-4 flex items-center gap-2 rounded-2xl bg-accent-soft py-1 pr-1 pl-3 text-sm">
      <Icon name="check" size={16} className="shrink-0 text-accent" />
      <p className="min-w-0 flex-1">Steady now works offline, even with no connection.</p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl text-muted hover:text-text"
      >
        <Icon name="close" size={16} />
      </button>
    </div>
  )
}
