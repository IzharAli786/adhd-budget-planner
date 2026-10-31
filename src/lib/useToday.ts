import { useEffect, useState } from 'react'
import type { ISODate } from '../domain/types'
import { msUntilNextLocalMidnight, todayISO } from './clock'

/**
 * Today's local date, kept fresh (PLAN §3.2): a timer for the next local midnight, plus
 * a re-check when the app comes back to the foreground, because phones freeze timers in
 * the background and an app left open overnight would otherwise still say yesterday.
 */
export function useToday(): ISODate {
  const [today, setToday] = useState(todayISO)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const refresh = () => {
      setToday(todayISO())
      clearTimeout(timer)
      // +1 s so the timer never fires a hair before midnight and reads the old date.
      timer = setTimeout(refresh, msUntilNextLocalMidnight() + 1000)
    }
    refresh()
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  return today
}
