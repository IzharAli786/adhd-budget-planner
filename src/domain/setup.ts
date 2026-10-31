// First-run setup (PLAN §5) as a small state machine. Progress is plain data in
// meta.setupProgress, so a reload or a killed app resumes on the same question.
import {
  addDays,
  dayOfWeek,
  isValidISODate,
  isWeekend,
  lastDayOfMonth,
  parseISODate,
} from './dates'
import { nextPayday as firstPaydayAfter } from './paySchedule'
import type { Cents, DayOfMonth, Instant, ISODate, PaySchedule, WeekendRule } from './types'

export const SETUP_STEPS = ['ack', 'payday', 'pay', 'balance'] as const
export type SetupStep = (typeof SETUP_STEPS)[number] | 'done'
export type PayKind = PaySchedule['kind']

export interface SetupProgress {
  step: SetupStep
  /** When "Not financial advice" was acknowledged. Asked once, ever. */
  ackAt?: Instant
  nextPayday?: ISODate
  kind?: PayKind
  /** Twice a month only: the payday that isn't `nextPayday`'s day of month. */
  otherDay?: DayOfMonth
  amount?: Cents
  doneAt?: Instant
}

/** How far ahead a "next payday" may be. Further than this is almost surely a typo. */
export const MAX_PAYDAY_AHEAD = 120

/**
 * The step to show. A stored step is only trusted if everything before it was
 * answered: a hand-edited or half-restored progress row must not skip a question.
 * A saved payday that is no longer in the future (setup left half-done for a few days)
 * counts as unanswered, so it is asked again instead of anchoring pay in the past.
 */
export function resumeStep(p: SetupProgress | undefined, today: ISODate): SetupStep {
  if (!p) return 'ack'
  if (p.step === 'done') return 'done'
  const answered: Record<(typeof SETUP_STEPS)[number], boolean> = {
    ack: p.ackAt !== undefined,
    payday: p.nextPayday !== undefined && p.nextPayday > today,
    pay: p.kind !== undefined && p.amount !== undefined,
    balance: false,
  }
  const want = SETUP_STEPS.indexOf(p.step)
  for (const [i, step] of SETUP_STEPS.entries()) {
    if (i === want || !answered[step]) return step
  }
  return 'balance'
}

export const stepNumber = (step: SetupStep) =>
  step === 'done' ? SETUP_STEPS.length : SETUP_STEPS.indexOf(step) + 1

export function previousStep(step: SetupStep): SetupStep | null {
  const i = SETUP_STEPS.indexOf(step as (typeof SETUP_STEPS)[number])
  // The acknowledgement is one-time, so Back never returns to it.
  return i > 1 ? SETUP_STEPS[i - 1]! : null
}

/** Setup is over once it finished, or when income already exists (a restored backup). */
export const isSetupComplete = (p: SetupProgress | undefined, hasIncome: boolean) =>
  p?.step === 'done' || hasIncome

/**
 * The next payday must be AFTER today. Periods run [payday, next payday), so a payday
 * today already starts the new period: taking today as "next" would show the payday
 * after it and stretch the balance over a period with no pay in it.
 */
export function validateNextPayday(date: string, today: ISODate): string | null {
  if (!isValidISODate(date)) return 'Pick the date of your next payday.'
  if (date === today) return 'Paid today? Then pick the payday after this one.'
  if (date < today) return 'That date has passed. When is the next one?'
  if (date > addDays(today, MAX_PAYDAY_AHEAD)) return 'That’s a long way off. Is the date right?'
  return null
}

const isLastOfMonth = (date: ISODate) => {
  const { year, month, day } = parseISODate(date)
  return day === lastDayOfMonth(year, month)
}

/** Day-of-month for a payday: the 28th or later that ends its month reads as "last". */
export function dayOf(date: ISODate): DayOfMonth {
  const { day } = parseISODate(date)
  return day >= 28 && isLastOfMonth(date) ? 'last' : day
}

/** A guess at the other payday for twice-a-month pay: the common pairs are 1 & 15, 15 & last. */
export function defaultOtherDay(nextPayday: ISODate): DayOfMonth {
  const d = dayOf(nextPayday)
  if (d === 'last') return 15
  if (d === 1) return 15
  if (d <= 15) return d + 15 >= 28 ? 'last' : d + 15
  return d - 15
}

const order = (d: DayOfMonth) => (d === 'last' ? 32 : d)

/**
 * The income schedule implied by "my next payday is X, and I'm paid every ...".
 * The weekend rule is chosen so X itself stays a payday: X is a real date the person
 * read off a payslip, so if it falls on a weekend that is simply when they are paid.
 */
export function scheduleFromSetup(
  kind: PayKind,
  nextPayday: ISODate,
  otherDay: DayOfMonth = defaultOtherDay(nextPayday),
): { schedule: PaySchedule; weekendRule: WeekendRule } {
  const weekendRule: WeekendRule = kind === 'irregular' || isWeekend(nextPayday) ? 'none' : 'before'
  switch (kind) {
    case 'weekly':
    case 'biweekly':
      return { schedule: { kind, anchor: nextPayday }, weekendRule }
    case 'monthly':
      return { schedule: { kind, day: dayOf(nextPayday) }, weekendRule }
    case 'semimonthly': {
      const pair = [dayOf(nextPayday), otherDay].sort((a, b) => order(a) - order(b))
      const [first, second] = pair as [DayOfMonth, DayOfMonth]
      // Both "last" can't happen (otherDay is a different payday), but be safe: one payday.
      if (first === 'last' || first === second) {
        return { schedule: { kind: 'monthly', day: first }, weekendRule }
      }
      return { schedule: { kind, days: [first, second] }, weekendRule }
    }
    case 'irregular':
      return { schedule: { kind, expected: [nextPayday] }, weekendRule }
  }
}

/** Twice a month needs two different paydays; the same day twice is just monthly. */
export function validateOtherDay(nextPayday: ISODate, otherDay: DayOfMonth): string | null {
  return dayOf(nextPayday) === otherDay ? 'Pick your other payday, not the next one.' : null
}

/**
 * "Next payday in 3 weeks" and "every week" can't both be true: the schedule would put
 * a payday before the date given, and Today would show that one instead. Ask rather
 * than guess which answer is wrong.
 */
export function validatePayKind(
  kind: PayKind,
  nextPayday: ISODate,
  today: ISODate,
  otherDay?: DayOfMonth,
): string | null {
  const { schedule, weekendRule } = scheduleFromSetup(kind, nextPayday, otherDay)
  if (firstPaydayAfter({ id: 'setup', schedule, weekendRule }, today) === nextPayday) return null
  return kind === 'semimonthly'
    ? 'Your other payday comes before the next one you picked. Is that day right?'
    : 'That would mean a payday before the date you picked. Check how often, or go back and change the date.'
}

/**
 * The other-payday guess to prefill: the common pair if it fits, else the closest
 * common day that doesn't land between today and the next payday (paid 5th and 20th
 * can't have the 20th as "next" on the 1st).
 */
export function suggestOtherDay(nextPayday: ISODate, today: ISODate): DayOfMonth {
  const guess = defaultOtherDay(nextPayday)
  const days: DayOfMonth[] = [guess, 15, 'last', 1, ...Array.from({ length: 31 }, (_, i) => i + 1)]
  const fits = (d: DayOfMonth) =>
    validateOtherDay(nextPayday, d) === null &&
    validatePayKind('semimonthly', nextPayday, today, d) === null
  return days.find(fits) ?? guess
}

/**
 * One-tap answers for "When do you next get paid?": the next Friday, the 15th, the last
 * day of the month, the 1st. Most people are paid on one of these, which keeps setup
 * well under a minute. Sorted, unique, all after today (see validateNextPayday).
 */
export function paydaySuggestions(today: ISODate): ISODate[] {
  const { year, month, day } = parseISODate(today)
  const friday = addDays(today, ((5 - dayOfWeek(today) + 6) % 7) + 1)
  const nextMonth = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 }
  const iso = (y: number, m: number, d: number) =>
    `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  const fifteenth = day < 15 ? iso(year, month, 15) : iso(nextMonth.year, nextMonth.month, 15)
  const last = iso(year, month, lastDayOfMonth(year, month))
  const first = iso(nextMonth.year, nextMonth.month, 1)
  return [...new Set([friday, fifteenth, last, first])].filter((d) => d > today).sort()
}
