import { useEffect } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { useToast } from '../ui/Toast'

const HOUR = 60 * 60 * 1000

// registerType 'prompt' (PLAN §6): a new version installs in the background and WAITS.
// The user decides when to switch, so nobody loses a half-typed amount to a reload. If
// they ignore it, the new version takes over at the next cold start anyway.
export function UpdateToast() {
  const toast = useToast()
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      // An installed PWA can stay open for days; look for updates hourly and on focus.
      if (!registration) return
      // update() rejects when offline or mid-install; that is routine, not an error.
      const check = () => {
        if (navigator.onLine && !registration.installing) registration.update().catch(() => {})
      }
      setInterval(check, HOUR)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check()
      })
    },
  })

  useEffect(() => {
    if (!offlineReady) return
    toast.show({ message: 'Steady now works offline.' })
    setOfflineReady(false)
  }, [offlineReady, setOfflineReady, toast])

  if (!needRefresh) return null

  return (
    <div
      role="alert"
      className="animate-toast-in fixed inset-x-4 top-[max(env(safe-area-inset-top),0.75rem)] z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-surface p-3 pl-4 shadow-card ring-1 ring-line md:top-6"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
        <Icon name="sparkle" size={18} />
      </span>
      <p className="min-w-0 flex-1 text-[0.9375rem] font-medium">An update is ready</p>
      <Button variant="ghost" onClick={() => setNeedRefresh(false)} className="px-3">
        Later
      </Button>
      <Button onClick={() => void updateServiceWorker(true)} className="px-4">
        Refresh now
      </Button>
    </div>
  )
}
