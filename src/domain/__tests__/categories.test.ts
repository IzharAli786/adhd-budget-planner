import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  ENVELOPE_COLORS,
  isPaletteColor,
  missingStarters,
  nextEnvelopeColor,
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
