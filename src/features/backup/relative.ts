import { relativeTimeFormat } from '../../domain/intl'
import type { Instant } from '../../domain/types'

/** "today", "yesterday", "3 days ago". Calendar days in local time, not 24h blocks. */
export function relativeDays(at: Instant, now: Date = new Date()): string {
  const then = new Date(at)
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((startOf(now) - startOf(then)) / 86_400_000)
  return relativeTimeFormat('en', { numeric: 'auto' }).format(-days, 'day')
}
