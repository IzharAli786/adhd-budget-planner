import { Outlet } from 'react-router'
import { InstallBanner } from '../features/install/InstallGate'
import { TabBar } from './TabBar'
import { UpdateToast } from './UpdateToast'

export function AppShell() {
  return (
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
    </div>
  )
}
