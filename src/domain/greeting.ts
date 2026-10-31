// The quiet hello at the top of Today. Pure, so the hour boundaries are tested directly.

/** Longest display name kept; it only has to fit one line above the number. */
export const DISPLAY_NAME_MAX = 40

/** "Good morning", or "Good morning, Sam" with a name. `hour` is the local 0-23 hour. */
export function greeting(hour: number, name = ''): string {
  // Before 5 is still "evening": nobody wants "Good morning" at 2 am.
  const part =
    hour >= 5 && hour < 12 ? 'morning' : hour >= 12 && hour < 18 ? 'afternoon' : 'evening'
  const who = name.trim().replace(/\s+/g, ' ').slice(0, DISPLAY_NAME_MAX)
  return who ? `Good ${part}, ${who}` : `Good ${part}`
}
