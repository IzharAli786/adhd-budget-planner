import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  budgetFor,
  defaultBillEnvelope,
  ENVELOPE_COLORS,
  isPaletteColor,
  missingStarters,
  nextEnvelopeColor,
  monthKey,
  STARTER_CATEGORIES,
} from '../categories'
import {
  completeTag,
  envelopeTag,
  matchEnvelope,
  parseQuickAdd,
  tagSuggestions,
  typingTag,
} from '../quickAdd'
import type { Envelope } from '../types'

const env = (id: string, name: string, sort: number, over: Partial<Envelope> = {}): Envelope => ({
  id,
  name,
  budget: 0,
  isDefault: false,
  color: 'accent',
  sort,
  ...over,
})

describe('starter categories', () => {
  it('are the ten common ones, each with its own palette colour', () => {
    expect(STARTER_CATEGORIES.map((c) => c.name)).toEqual([
      'Rent & housing',
      'Groceries',
      'Eating out',
      'Transport',
      'Bills & utilities',
      'Subscriptions',
      'Personal care',
      'Fun',
      'Gifts',
      'Other',
    ])
    const colors = STARTER_CATEGORIES.map((c) => c.color)
    expect(new Set(colors).size).toBe(colors.length)
    for (const c of colors) expect(isPaletteColor(c)).toBe(true)
    expect(isPaletteColor('accent')).toBe(false)
  })

  it.each([
    [[], 10],
    [[env('e', 'Everyday', 0, { isDefault: true })], 10],
    [[env('g', ' groceries ', 1)], 9],
    [[env('g', 'Groceries', 1, { deletedAt: '2026-10-01T00:00:00.000Z' })], 10],
    [STARTER_CATEGORIES.map((c, i) => env(`s${i}`, c.name.toUpperCase(), i)), 0],
  ])('skips names already there (%#)', (existing, count) => {
    expect(missingStarters(existing)).toHaveLength(count)
  })

  it('every starter category can be tagged in quick-add, next to Everyday', () => {
    const all = [
      env('every', 'Everyday', 0, { isDefault: true }),
      ...STARTER_CATEGORIES.map((c, i) => env(`s${i}`, c.name, i + 1)),
    ]
    for (const e of all) {
      const tag = envelopeTag(e, all)
      expect(tag).not.toBeNull()
      expect(parseQuickAdd(`12 x @${tag}`, { today: '2026-10-31', envelopes: all })).toMatchObject({
        envelopeId: e.id,
      })
    }
    expect(envelopeTag(all[1]!, all)).toBe('rent')
    expect(envelopeTag(all[3]!, all)).toBe('eating')
  })
})

describe('defaultBillEnvelope', () => {
  const home = env('home', 'Rent & housing', 1)
  const utils = env('utils', 'Bills & utilities', 2)
  it.each<[string, Envelope[], string, string | undefined]>([
    ['rent goes to Rent & housing', [home, utils], 'Rent', 'home'],
    ['so does a mortgage, any case', [home, utils], 'MORTGAGE payment', 'home'],
    ['housing words only as whole words', [home, utils], 'Parental care', 'utils'],
    ['other bills go to Bills & utilities', [home, utils], 'Phone', 'utils'],
    ['rent without Rent & housing', [utils], 'Rent', 'utils'],
    [
      'a deleted Rent & housing does not count',
      [{ ...home, deletedAt: 'x' }, utils],
      'Rent',
      'utils',
    ],
    ['no categories, no default', [], 'Rent', undefined],
    ['only Rent & housing: other bills get none', [home], 'Phone', undefined],
  ])('%s', (_, envelopes, name, expected) => {
    expect(defaultBillEnvelope(envelopes, name)).toBe(expected)
  })
})

describe('nextEnvelopeColor', () => {
  it('picks the first unused palette colour, then cycles', () => {
    expect(nextEnvelopeColor([])).toBe('clay')
    expect(nextEnvelopeColor([env('a', 'A', 0, { color: 'clay' })])).toBe('sage')
    expect(
      nextEnvelopeColor([env('a', 'A', 0, { color: 'clay', deletedAt: '2026-01-01T00:00:00Z' })]),
    ).toBe('clay')
  })

  it('always returns a palette colour', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom('accent', ...ENVELOPE_COLORS), { maxLength: 30 }),
        (colors) => {
          const rows = colors.map((color, i) => env(`e${i}`, `E${i}`, i, { color }))
          const next = nextEnvelopeColor(rows)
          expect(isPaletteColor(next)).toBe(true)
          if (colors.length < ENVELOPE_COLORS.length) expect(colors).not.toContain(next)
        },
      ),
    )
  })
})

describe('@tag suggestions', () => {
  const envelopes = [
    env('every', 'Everyday', 0, { isDefault: true }),
    env('eat', 'Eating out', 1),
    env('fun', 'Fun', 2),
    env('fund', 'Fundraiser', 3), // "fundraiser" is not reachable as @fun…
    env('old', 'Old', 4, { deletedAt: '2026-10-01T00:00:00.000Z' }),
  ]

  it.each([
    ['12 lunch @', ''],
    ['12 lunch @ea', 'ea'],
    ['@f', 'f'],
    ['12 lunch', null],
    ['12 lunch @eat ', null],
    ['mail@home', null],
  ])('typingTag(%j) = %j', (text, tag) => {
    expect(typingTag(text)).toBe(tag)
  })

  it('suggests live envelopes by prefix, in order, with a tag that resolves to each', () => {
    expect(tagSuggestions('', envelopes).map((s) => s.tag)).toEqual([
      'everyday',
      'eating',
      'fun',
      'fundraiser',
    ])
    expect(tagSuggestions('E', envelopes).map((s) => s.envelopeId)).toEqual(['every', 'eat'])
    expect(tagSuggestions('fu', envelopes).map((s) => s.name)).toEqual(['Fun', 'Fundraiser'])
    expect(tagSuggestions('zzz', envelopes)).toEqual([])
    for (const s of tagSuggestions('', envelopes)) {
      expect(matchEnvelope(s.tag, envelopes)?.id).toBe(s.envelopeId)
    }
  })

  it('leaves out an envelope whose first word lands on an earlier one', () => {
    const clash = [env('a', 'Food', 0), env('b', 'Food shop', 1)]
    expect(envelopeTag(clash[1]!, clash)).toBeNull()
    expect(tagSuggestions('fo', clash).map((s) => s.envelopeId)).toEqual(['a'])
  })

  it('completes the tag being typed', () => {
    expect(completeTag('12 lunch @ea', 'eating')).toBe('12 lunch @eating ')
    expect(completeTag('12 lunch @', 'fun')).toBe('12 lunch @fun ')
  })
})

describe('budgetFor (“Budget for November”)', () => {
  it('is the plain budget while no month has its own', () => {
    expect(budgetFor({ budget: 18000 }, '2026-11-15')).toBe(18000)
    expect(budgetFor({ budget: 18000, monthBudgets: {} }, '2026-01-01')).toBe(18000)
  })

  it('a month’s budget holds from that month on, until a later month sets another', () => {
    const env = { budget: 10000, monthBudgets: { '2026-11': 15000, '2027-02': 9000 } }
    expect(budgetFor(env, '2026-10-31')).toBe(10000)
    expect(budgetFor(env, '2026-11-01')).toBe(15000)
    expect(budgetFor(env, '2026-11-30')).toBe(15000)
    expect(budgetFor(env, '2027-01-15')).toBe(15000)
    expect(budgetFor(env, '2027-02-01')).toBe(9000)
    expect(budgetFor(env, '2030-06-01')).toBe(9000)
  })

  it('a zero budget for a month counts (it is not “unset”)', () => {
    expect(budgetFor({ budget: 5000, monthBudgets: { '2026-11': 0 } }, '2026-12-01')).toBe(0)
  })

  it('earlier months never see a later month’s budget (property)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.dictionary(
          fc
            .tuple(fc.integer({ min: 2020, max: 2030 }), fc.integer({ min: 1, max: 12 }))
            .map(([y, m]) => `${y}-${String(m).padStart(2, '0')}`),
          fc.integer({ min: 0, max: 1_000_000 }),
        ),
        fc.integer({ min: 2019, max: 2031 }),
        fc.integer({ min: 1, max: 12 }),
        (budget, monthBudgets, y, m) => {
          const date = `${y}-${String(m).padStart(2, '0')}-15`
          const keys = Object.keys(monthBudgets).filter((k) => k <= monthKey(date))
          const latest = keys.sort().at(-1)
          expect(budgetFor({ budget, monthBudgets }, date)).toBe(
            latest === undefined ? budget : monthBudgets[latest],
          )
        },
      ),
    )
  })
})
