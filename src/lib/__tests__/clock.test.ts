import { afterAll, describe, expect, it, vi } from 'vitest'
import { msUntilNextLocalMidnight, todayISO } from '../clock'

// Pin a zone east of UTC with DST, so these tests mean the same on a UTC CI runner.
// Node re-reads TZ whenever it is assigned. Stubbed at module load because it.each
// tables build their Dates at collection time, before any beforeAll hook runs.
vi.stubEnv('TZ', 'Europe/Berlin')
afterAll(() => {
  vi.unstubAllEnvs()
})

const HOUR = 60 * 60 * 1000

describe('todayISO', () => {
  it('uses local date parts, not UTC', () => {
    // 00:30 in Berlin is still 23:30 the previous day in UTC.
    const now = new Date(2026, 2, 29, 0, 30)
    expect(now.toISOString().slice(0, 10)).toBe('2026-03-28')
    expect(todayISO(now)).toBe('2026-03-29')
  })
  it('pads months and days', () => {
    expect(todayISO(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })
})

describe('msUntilNextLocalMidnight', () => {
  it.each([
    ['a normal day', new Date(2026, 5, 10, 23, 0), HOUR],
    // EU DST: 2026-03-29 has 23 hours, 2026-10-25 has 25.
    ['spring-forward day', new Date(2026, 2, 29, 0, 30), 22.5 * HOUR],
    ['fall-back day', new Date(2026, 9, 25, 0, 30), 24.5 * HOUR],
  ])('%s', (_l, now, expected) => {
    expect(msUntilNextLocalMidnight(now)).toBe(expected)
  })
})
