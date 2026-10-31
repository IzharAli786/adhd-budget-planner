import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  frequentEntries,
  matchEnvelope,
  parseQuickAdd,
  signedAmount,
  suggestEnvelope,
  type QuickAddResult,
} from '../quickAdd'
import type { Envelope, Transaction } from '../types'

const today = '2026-10-31'
const envelopes: Envelope[] = [
  { id: 'every', name: 'Everyday', budget: 0, isDefault: true, color: 'accent', sort: 0 },
  { id: 'food', name: 'Food', budget: 30000, isDefault: false, color: 'sage', sort: 1 },
  { id: 'fun', name: 'Fun', budget: 5000, isDefault: false, color: 'ocean', sort: 2 },
]
const ctx = { envelopes, today }

describe('parseQuickAdd (PLAN §4.4 table)', () => {
  const cases: [string, QuickAddResult][] = [
    ['12 coffee', { ok: true, amount: 1200, kind: 'spend', note: 'coffee', date: today }],
    ['coffee 12', { ok: true, amount: 1200, kind: 'spend', note: 'coffee', date: today }],
    [
      '12,50 lidl @food',
      { ok: true, amount: 1250, kind: 'spend', note: 'lidl', date: today, envelopeId: 'food' },
    ],
    ['+1500 salary', { ok: true, amount: 150000, kind: 'income', note: 'salary', date: today }],
    [
      '4.99 netflix yesterday',
      { ok: true, amount: 499, kind: 'spend', note: 'netflix', date: '2026-10-30' },
    ],
    ['12.05 lunch', { ok: true, amount: 1205, kind: 'spend', note: 'lunch', date: today }],
    ['1.250 rent', { ok: false, reason: 'too_many_decimals' }],
    ['y coffee 3', { ok: true, amount: 300, kind: 'spend', note: 'y coffee', date: today }],
    ['', { ok: false, reason: 'empty' }],
    ['   ', { ok: false, reason: 'empty' }],
    ['abc', { ok: false, reason: 'no_amount' }],
    // Beyond the plan's table: the edges people actually type.
    ['12', { ok: true, amount: 1200, kind: 'spend', note: '', date: today }],
    ['0 coffee', { ok: false, reason: 'zero' }],
    ['-7 bus', { ok: true, amount: 700, kind: 'spend', note: 'bus', date: today }],
    ['12.5 cake', { ok: true, amount: 1250, kind: 'spend', note: 'cake', date: today }],
    [
      '€12 coffee',
      { ok: true, amount: 1200, kind: 'spend', note: 'coffee', date: today, currency: '€' },
    ],
    [
      '12€ coffee',
      { ok: true, amount: 1200, kind: 'spend', note: 'coffee', date: today, currency: '€' },
    ],
    [
      '12 eur coffee',
      { ok: true, amount: 1200, kind: 'spend', note: 'coffee', date: today, currency: 'EUR' },
    ],
    ['12 bus today', { ok: true, amount: 1200, kind: 'spend', note: 'bus', date: today }],
    [
      '12 cinema @FU',
      { ok: true, amount: 1200, kind: 'spend', note: 'cinema', date: today, envelopeId: 'fun' },
    ],
    [
      '12 cinema @x',
      { ok: true, amount: 1200, kind: 'spend', note: 'cinema', date: today, unknownTag: 'x' },
    ],
    [
      'Coffee   with  Sam 4,20',
      { ok: true, amount: 420, kind: 'spend', note: 'Coffee with Sam', date: today },
    ],
    ['1,234.50 tv', { ok: false, reason: 'no_amount' }],
    ['yday 3', { ok: true, amount: 300, kind: 'spend', note: 'yday', date: today }],
  ]
  it.each(cases)('%j', (text, expected) => {
    expect(parseQuickAdd(text, ctx)).toEqual(expected)
  })

  it('0-decimal currencies reject any fraction', () => {
    expect(parseQuickAdd('500 ramen', { today, decimals: 0 })).toMatchObject({ amount: 500 })
    expect(parseQuickAdd('5.5 ramen', { today, decimals: 0 })).toEqual({
      ok: false,
      reason: 'too_many_decimals',
    })
  })

  it('any whole euro and cent amount round-trips exactly (no float step)', () => {
    fc.assert(
      fc.property(
        fc.nat(10_000_000),
        fc.nat(99),
        fc.constantFrom('.', ','),
        (whole, cents, sep) => {
          const text = `${whole}${sep}${String(cents).padStart(2, '0')} thing`
          const r = parseQuickAdd(text, ctx)
          const expected = whole * 100 + cents
          if (expected === 0) expect(r).toEqual({ ok: false, reason: 'zero' })
          else expect(r).toMatchObject({ ok: true, amount: expected, note: 'thing' })
        },
      ),
    )
  })

  it('signedAmount: spending is negative, income positive', () => {
    expect(signedAmount({ amount: 1200, kind: 'spend' })).toBe(-1200)
    expect(signedAmount({ amount: 1200, kind: 'income' })).toBe(1200)
  })
})

describe('matchEnvelope', () => {
  it('prefix match ignores case and deleted envelopes; user order breaks ties', () => {
    expect(matchEnvelope('f', envelopes)?.id).toBe('food')
    expect(matchEnvelope('EVERY', envelopes)?.id).toBe('every')
    expect(matchEnvelope('fo', [{ ...envelopes[1]!, deletedAt: '2026-01-01T00:00:00.000Z' }])).toBe(
      undefined,
    )
  })
})

const tx = (note: string, amount: number, createdAt: string, extra: Partial<Transaction> = {}) =>
  ({
    id: createdAt,
    date: createdAt.slice(0, 10),
    amount,
    note,
    createdAt,
    ...extra,
  }) as Transaction

describe('suggestEnvelope', () => {
  const history = [
    tx('Lidl', -2000, '2026-10-01T10:00:00.000Z', { envelopeId: 'food' }),
    tx('lidl ', -1500, '2026-10-02T10:00:00.000Z', { envelopeId: 'food' }),
    tx('LIDL', -900, '2026-10-03T10:00:00.000Z', { envelopeId: 'fun' }),
    tx('cinema', -1200, '2026-10-04T10:00:00.000Z'),
  ]
  it.each([
    ['lidl', 'food'],
    ['  Lidl', 'food'],
    ['cinema', null],
    ['new place', null],
    ['', null],
  ])('%j -> %j', (note, expected) => {
    expect(suggestEnvelope(note, history)).toBe(expected)
  })
})

describe('frequentEntries', () => {
  it('ranks by count, then by recency, and ignores income, bills and savings', () => {
    const history = [
      tx('Coffee', -320, '2026-10-01T08:00:00.000Z'),
      tx('coffee', -320, '2026-10-02T08:00:00.000Z'),
      tx('Bus', -250, '2026-10-03T08:00:00.000Z'),
      tx('Lunch', -1100, '2026-10-04T08:00:00.000Z'),
      tx('Salary', 210000, '2026-10-05T08:00:00.000Z'),
      tx('Rent', -95000, '2026-10-05T09:00:00.000Z', { billOccurrenceId: 'rent|2026-10-01' }),
      tx('Holiday', -5000, '2026-10-05T10:00:00.000Z', { fundId: 'f' }),
      tx('', -100, '2026-10-05T11:00:00.000Z'),
      tx('Coffee', -350, '2026-10-06T08:00:00.000Z', { deletedAt: '2026-10-06T09:00:00.000Z' }),
    ]
    expect(frequentEntries(history)).toEqual([
      { note: 'coffee', amount: 320, count: 2 },
      { note: 'Lunch', amount: 1100, count: 1 },
      { note: 'Bus', amount: 250, count: 1 },
    ])
    expect(frequentEntries(history, 1)).toHaveLength(1)
  })
})
