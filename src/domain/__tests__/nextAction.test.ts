import { describe, expect, it } from 'vitest'
import {
  addSnooze,
  isSnoozed,
  nextAction,
  snoozeUntil,
  type ActionState,
  type Snoozes,
} from '../nextAction'

const today = '2026-11-04'
const now = '2026-11-04T10:00:00.000Z'
const calm: ActionState = {
  nextPayday: '2026-11-30',
  overdue: [],
  balanceAgeDays: 0,
  paydaySinceCheckIn: false,
  daysSinceBackup: 0,
  hasBills: true,
  loggedToday: true,
}
const rent = {
  billId: 'rent',
  originalDate: '2026-11-01',
  date: '2026-11-01',
  name: 'Rent',
  amount: 95000,
}
const gym = {
  billId: 'gym',
  originalDate: '2026-11-03',
  date: '2026-11-03',
  name: 'Gym',
  amount: 3000,
}

describe('nextAction priority (PLAN §4.5)', () => {
  it.each<[string, Partial<ActionState>, string]>([
    ['nothing to do', {}, 'all-done'],
    [
      'payday unknown beats everything',
      { nextPayday: null, overdue: [rent], balanceAgeDays: 9 },
      'payday-unknown',
    ],
    ['overdue bill', { overdue: [rent], balanceAgeDays: 9 }, 'overdue-bill'],
    ['balance older than 3 days', { balanceAgeDays: 4, daysSinceBackup: 30 }, 'stale-balance'],
    // Same single check-in, but with the payday wording and its backup offer.
    [
      'stale AND payday passed reads as payday',
      { balanceAgeDays: 9, paydaySinceCheckIn: true, daysSinceBackup: 30 },
      'payday-checkin',
    ],
    ['3 days is not stale yet', { balanceAgeDays: 3 }, 'all-done'],
    ['payday passed', { paydaySinceCheckIn: true, daysSinceBackup: 30 }, 'payday-checkin'],
    ['backup older than 14 days', { daysSinceBackup: 15, expiredImpulse: 2 }, 'backup'],
    ['expired 48h item', { expiredImpulse: 1, hasBills: false }, 'impulse'],
    ['deferred setup', { hasBills: false, loggedToday: false }, 'setup-bills'],
    ['log today', { loggedToday: false }, 'log-today'],
  ])('%s', (_, patch, kind) => {
    expect(nextAction({ ...calm, ...patch }, {}, today, now).kind).toBe(kind)
  })

  it('oldest overdue bill first, each snoozed on its own', () => {
    const state = { ...calm, overdue: [gym, rent] }
    const first = nextAction(state, {}, today, now)
    expect(first.bill?.name).toBe('Rent')
    expect(first.cta).toBeTruthy()
    const snoozes = addSnooze({}, first.id, now)
    expect(nextAction(state, snoozes, today, now).bill?.name).toBe('Gym')
  })

  it('"Not now" hides an action for 24h, then it is back', () => {
    const state = { ...calm, balanceAgeDays: 5 }
    const snoozes = addSnooze({}, 'stale-balance', now)
    expect(nextAction(state, snoozes, today, now).kind).toBe('all-done')
    expect(nextAction(state, snoozes, today, '2026-11-05T09:59:59.999Z').kind).toBe('all-done')
    expect(nextAction(state, snoozes, today, '2026-11-05T10:00:00.000Z').kind).toBe('stale-balance')
  })

  it('"All done" cannot be snoozed away', () => {
    const snoozes: Snoozes = { 'all-done': '2099-01-01T00:00:00.000Z' }
    const a = nextAction(calm, snoozes, today, now)
    expect(a.kind).toBe('all-done')
    expect(a.cta).toBeNull()
    expect(a.snoozable).toBe(false)
  })

  it('payday check-in offers a backup when done', () => {
    expect(nextAction({ ...calm, paydaySinceCheckIn: true }, {}, today, now).doneState).toMatch(
      /backup/,
    )
  })
})

describe('snoozes', () => {
  it('snoozeUntil adds 24h; addSnooze drops expired entries', () => {
    expect(snoozeUntil(now)).toBe('2026-11-05T10:00:00.000Z')
    const next = addSnooze(
      { old: '2026-11-01T00:00:00.000Z', live: '2026-11-09T00:00:00.000Z' },
      'x',
      now,
    )
    expect(next).toEqual({ live: '2026-11-09T00:00:00.000Z', x: '2026-11-05T10:00:00.000Z' })
    expect(isSnoozed('x', next, now)).toBe(true)
    expect(isSnoozed('old', next, now)).toBe(false)
  })
})
