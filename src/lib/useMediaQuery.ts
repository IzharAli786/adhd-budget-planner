import { useSyncExternalStore } from 'react'

const query = (q: string) =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(q)
    : null

/** Whether a media query matches, live. False where matchMedia is missing (tests, SSR). */
export function useMediaQuery(q: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = query(q)
      mq?.addEventListener('change', cb)
      return () => mq?.removeEventListener('change', cb)
    },
    () => query(q)?.matches ?? false,
    () => false,
  )
}
