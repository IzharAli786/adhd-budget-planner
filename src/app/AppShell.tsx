import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router'
import { CatchUpProvider } from '../features/catchup/CatchUpProvider'
import { InstallBanner } from '../features/install/InstallGate'
import { QuickAddProvider } from '../features/quickadd/QuickAddProvider'
import { purgeDeleted } from '../db/repos'
import { requestPersist } from '../lib/storage'
import { AppBadge } from './AppBadge'
import { cx } from '../ui/cx'
import { TabBar } from './TabBar'
import { UpdateToast } from './UpdateToast'

export function AppShell() {
  // The shell only mounts once setup is done, so this is "after setup", and again on
  // every later open until the browser grants it (PLAN §6). Asking is idempotent.
  // Rows past their 30 days in Recently deleted go for good on open (PLAN §8).
  useEffect(() => {
    void requestPersist()
    void purgeDeleted()
  }, [])
  // Today and Bills earn two columns on wide screens, Look back its four tiles and wide
  // table; reading screens keep a calm measure.
  const { pathname } = useLocation()
  const wide = pathname === '/' || pathname === '/bills' || pathname === '/more/review'

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
              'mx-auto w-full max-w-md px-4 pt-[max(env(safe-area-inset-top),1.25rem)] pb-[calc(6.5rem+env(safe-area-inset-bottom))] min-[400px]:px-5',
              'md:max-w-2xl md:px-10 md:pt-12 md:pb-16',
              wide && 'lg:max-w-5xl',
            )}
          >
            <Outlet />
          </main>
          <TabBar />
          <UpdateToast />
          <AppBadge />
        </div>
      </CatchUpProvider>
    </QuickAddProvider>
  )
}
