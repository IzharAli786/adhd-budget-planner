import { dayOfWeek, parseISODate } from '../../domain/dates'
import type { PaySchedule, Recurrence } from '../../domain/types'
import type { Formatters } from './format'

const MONTHS =
  'January February March April May June July August September October November December'.split(' ')

const dayLabel = (day: number | 'last', f: Formatters) =>
  day === 'last' ? 'the last day' : `the ${f.ordinal(day)}`

/** "Every month on the 15th", "Every 2 weeks on Friday", "Once, Fri 7 Nov". */
export function describeRule(rule: Recurrence, f: Formatters): string {
  switch (rule.freq) {
    case 'once':
      return `Once, ${f.day(rule.date)}`
    case 'weekly': {
      const on = f.weekday(dayOfWeek(rule.anchor), 'long')
      if (rule.interval === 1) return `Every ${on}`
      return `Every ${rule.interval} weeks on ${on}`
    }
    case 'monthly': {
      const every = rule.interval === 1 ? 'Every month' : `Every ${rule.interval} months`
      return `${every} on ${dayLabel(rule.day, f)}`
    }
    case 'yearly':
      return `Every year on ${rule.day} ${MONTHS[rule.month - 1] ?? ''}`
  }
}

export function describeSchedule(schedule: PaySchedule, f: Formatters): string {
  switch (schedule.kind) {
    case 'weekly':
      return `Every ${f.weekday(dayOfWeek(schedule.anchor), 'long')}`
    case 'biweekly':
      return `Every other ${f.weekday(dayOfWeek(schedule.anchor), 'long')}`
    case 'semimonthly':
      return `Twice a month, ${dayLabel(schedule.days[0], f)} and ${dayLabel(schedule.days[1], f)}`
    case 'monthly':
      return `Every month on ${dayLabel(schedule.day, f)}`
    case 'irregular': {
      const n = schedule.expected.length
      return n === 0 ? 'Dates vary' : `Dates vary · ${n} planned`
    }
  }
}

/** Day number of a date, for "on the 31st" hints in the form. */
export const dayNumber = (date: string) => parseISODate(date).day
