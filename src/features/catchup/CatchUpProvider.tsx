import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { getMeta, setMeta } from '../../db/repos'
import { SHORT_GAP_MAX_DAYS } from '../../domain/catchUp'
import { daysBetween } from '../../domain/dates'
import type { Instant, ISODate } from '../../domain/types'
import { todayISO } from '../../lib/clock'
import { useToday } from '../../lib/useToday'

interface CatchUpSession {
  /** The day the app was last open before this session; null when there is nothing to show. */
  since: ISODate | null
  /** lastOpened has been read. Until then Today waits, so it never flashes the usual
   *  screen and then swaps it for the fresh start. */
  ready: boolean
  /** The catch-up was shown and handled (or set aside). */
  dismiss: () => void
}

const CatchUpContext = createContext<CatchUpSession>({
  since: null,
  ready: true,
  dismiss: () => {},
})

// Old installs (and hand-edited backups) may hold an instant; compare by local day.
const toLocalDay = (v: ISODate | Instant) => (v.length > 10 ? todayISO(new Date(v)) : v)

/**
 * Reads meta.lastOpened ONCE per app session, before it is overwritten with today, and
 * keeps that value for Today's catch-up (PLAN §4.5). Lives in the shell, not on Today,
 * so leaving Today and coming back still shows the same welcome.
 */
export function CatchUpProvider({ children }: { children: ReactNode }) {
  const today = useToday()
  const [openedOn] = useState(today)
  const [since, setSince] = useState<ISODate | null | undefined>(undefined)

  useEffect(() => {
    let live = true
    void getMeta<string>('lastOpened').then((v) => {
      if (live) setSince(v ? toLocalDay(v) : null)
    })
    return () => {
      live = false
    }
  }, [])

  // A fresh start waits for its one number: if the app is closed before that, the
  // welcome is still there next time. Every other open stamps today straight away
  // (and again when the date rolls over while the app stays open).
  const freshPending = since != null && daysBetween(since, openedOn) > SHORT_GAP_MAX_DAYS
  useEffect(() => {
    if (since === undefined || freshPending) return
    void setMeta('lastOpened', today)
  }, [since, freshPending, today])

  const dismiss = useCallback(() => setSince(null), [])
  const value = useMemo(
    () => ({ since: since ?? null, ready: since !== undefined, dismiss }),
    [since, dismiss],
  )
  return <CatchUpContext.Provider value={value}>{children}</CatchUpContext.Provider>
}

export const useCatchUpSession = () => useContext(CatchUpContext)
