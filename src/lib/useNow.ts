import { useEffect, useState } from 'react'
import type { Instant } from '../domain/types'

/**
 * The current instant, refreshed every `everyMs` and when the app returns to the
 * foreground (phones freeze timers in the background). For countdowns like the 48h list:
 * the domain stays pure and takes `now`; only this hook reads the clock.
 */
export function useNow(everyMs = 60_000): Instant {
  const [now, setNow] = useState(() => new Date().toISOString())

  useEffect(() => {
    const tick = () => setNow(new Date().toISOString())
    const timer = setInterval(tick, everyMs)
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick()
    }
    document.addEventListener('visibilitychange', onVisible)
    // Cleanup matters: without it every re-mount would leave one more interval running.
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [everyMs])

  return now
}
