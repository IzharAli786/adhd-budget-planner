import { useEffect } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { SaveBackupButton, useBackupFile } from '../features/backup/SaveBackup'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'

const HOUR = 60 * 60 * 1000
// A download link starts reading its blob a moment after the tap; reloading at once would
// unload the page (and the blob URL) under it. A share has already finished by then.
const AFTER_DOWNLOAD_MS = 1500

// registerType 'prompt' (PLAN §6): a new version installs in the background and WAITS.
// The user decides when to switch, so nobody loses a half-typed amount to a reload. If
// they ignore it, the new version takes over at the next cold start anyway.
export function UpdateToast({ onOfflineReady }: { onOfflineReady: () => void }) {
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

  // Not a toast: on the first run it lands right after setup, where a phone toast would
  // sit on the one-thing-now card. The shell shows it as a slim note in the page instead.
  useEffect(() => {
    if (!offlineReady) return
    onOfflineReady()
    setOfflineReady(false)
  }, [offlineReady, setOfflineReady, onOfflineReady])

  if (!needRefresh) return null

  return (
    <UpdateReady
      onLater={() => setNeedRefresh(false)}
      onRefresh={() => void updateServiceWorker(true)}
    />
  )
}

/**
 * Its own component so the backup file is only prepared while the toast is showing: an
 * update can change how data is stored, and a copy from just before is the safest undo.
 */
export function UpdateReady({
  onLater,
  onRefresh,
}: {
  onLater: () => void
  onRefresh: () => void
}) {
  // Prepared before the tap, exactly like the Backup screen (iOS shares only inside a tap).
  const file = useBackupFile()
  return (
    <div
      role="alert"
      className="print-hide animate-toast-in fixed inset-x-4 top-[max(env(safe-area-inset-top),0.75rem)] z-50 mx-auto max-w-md rounded-3xl bg-surface p-3 pl-4 shadow-card ring-1 ring-line md:top-6"
    >
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
          <Icon name="sparkle" size={18} />
        </span>
        <p className="min-w-0 flex-1 text-body font-medium">An update is ready</p>
        <Button variant="ghost" onClick={onLater} className="px-3">
          Later
        </Button>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <SaveBackupButton
          file={file}
          label="Back up first"
          variant="secondary"
          size="md"
          className="px-3"
          onSaved={(result) => {
            if (result === 'downloaded') setTimeout(onRefresh, AFTER_DOWNLOAD_MS)
            else onRefresh()
          }}
        />
        <Button block onClick={onRefresh} className="px-3">
          Refresh now
        </Button>
      </div>
    </div>
  )
}
