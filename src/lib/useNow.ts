import { useEffect, useState } from 'react'
import type { Instant } from '../domain/types'

/**
 * The current instant, refreshed every minute and when the app comes back to the
 * foreground. For time-based state that isn't tied to midnight: a "Not now" snooze
 * ending after 24 h, a 48h item becoming ready to decide. Without a tick, a value
 * computed once on render would stay stale until something else re-rendered.
 */
export function useNow(intervalMs = 60_000): Instant {
  const [now, setNow] = useState(() => new Date().toISOString())

  useEffect(() => {
    const refresh = () => setNow(new Date().toISOString())
    const timer = setInterval(refresh, intervalMs)
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [intervalMs])

  return now
}
