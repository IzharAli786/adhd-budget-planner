import type { Cents } from '../../domain/money'

/** The carry-over in kind words: a small amount is still a win, a minus is no failure. */
export function carryLine(carried: Cents, money: (c: Cents) => string): string {
  if (carried > 0) return `You carried ${money(carried)} into this payday.`
  if (carried === 0) return 'You reached payday with everything used. That’s okay.'
  return `You started this payday ${money(-carried)} behind. This period is a fresh go.`
}
