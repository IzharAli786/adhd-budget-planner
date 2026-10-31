import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState, type ReactNode } from 'react'
import {
  DemoLimitError,
  getDemoState,
  installDemoCap,
  onDemoLimit,
  resetIfExpired,
} from '../../db/demo'
import { setCreateGuard } from '../../db/undo'
import { DemoBanner } from './DemoBanner'
import { DemoEntry } from './DemoEntry'
import { DemoLimitSheet } from './DemoLimitSheet'

/**
 * Wraps the whole demo build (PLAN §7): the banner, the two ways in, the 7-day reset and
 * the entry cap. Mounted by App only when IS_DEMO, so the full app never renders it.
 */
export function DemoGate({ children }: { children: ReactNode }) {
  const [checked, setChecked] = useState(false)
  const [limitOpen, setLimitOpen] = useState(false)
  // null = no demo started yet (or it just reset): show the two ways in.
  const state = useLiveQuery(async () => (await getDemoState()) ?? null)

  useEffect(() => {
    installDemoCap()
    const check = () => void resetIfExpired().finally(() => setChecked(true))
    check()
    // A tab left open for a week resets when it comes back, not only on a fresh load.
    const onVisible = () => document.visibilityState === 'visible' && check()
    document.addEventListener('visibilitychange', onVisible)
    // A capped save that nobody awaited isn't an error worth a console trace: the sheet
    // already explains it.
    const onRejection = (e: PromiseRejectionEvent) => {
      if (e.reason instanceof DemoLimitError) e.preventDefault()
    }
    window.addEventListener('unhandledrejection', onRejection)
    const off = onDemoLimit(() => setLimitOpen(true))
    return () => {
      setCreateGuard(null)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('unhandledrejection', onRejection)
      off()
    }
  }, [])

  if (!checked || state === undefined) return null
  return (
    <>
      <DemoBanner />
      {state === null ? <DemoEntry /> : children}
      <DemoLimitSheet open={limitOpen} onClose={() => setLimitOpen(false)} />
    </>
  )
}
