import { useEffect } from 'react'
import { Outlet } from 'react-router'
import { CatchUpProvider } from '../features/catchup/CatchUpProvider'
import { InstallBanner } from '../features/install/InstallGate'
import { QuickAddProvider } from '../features/quickadd/QuickAddProvider'
import { purgeDeleted } from '../db/repos'
import { requestPersist } from '../lib/storage'
import { AppBadge } from './AppBadge'
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

  return (
    // Quick-add lives here, not per screen: the floating + and the `n` key work on every tab.
    <QuickAddProvider>
      <CatchUpProvider>
        <div className="min-h-dvh md:pl-24 lg:pl-56">
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:bg-surface focus:px-4 focus:py-2"
          >
            Skip to content
          </a>
          <InstallBanner />
          <main
            id="main"
            className="mx-auto w-full max-w-md px-5 pt-[max(env(safe-area-inset-top),1.25rem)] pb-[calc(6.5rem+env(safe-area-inset-bottom))] md:max-w-2xl md:px-10 md:pt-10 md:pb-16"
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
