import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  checkCode,
  codeBody,
  CROCKFORD,
  formatCodeBody,
  hashCode,
  hasLetterU,
  isCompleteCode,
  normalizeCode,
  parseHashes,
  VALID_HASHES,
} from '../unlock'
import * as stub from '../unlock.stub'

const DEV_CODE = 'STEADY-DEMO-0000-0000-0001'
// Computed outside the app: printf 'steady-v1:STEADYDEM0000000000001' | shasum -a 256
const DEV_HASH = '3b9b0537d36c46fd9064a9fa1fb9029e63b573c0c98336a85e8ff9e3a01123f6'

describe('normalizeCode', () => {
  it.each([
    ['STEADY-DEMO-0000-0000-0001', 'STEADYDEM0000000000001'],
    ['steady-demo-0000-0000-0001', 'STEADYDEM0000000000001'],
    ['  STEADY DEMO 0000 0000 0001 ', 'STEADYDEM0000000000001'],
    ['DEMO-0000-0000-0001', 'STEADYDEM0000000000001'], // prefix left off
    ['STEADY–DEMO—0000-0000-0001', 'STEADYDEM0000000000001'], // dashes a PDF may paste
    ['STEADY-ABCD-EFGH-IJKL-MNOP', 'STEADYABCDEFGH1JK1MN0P'], // I, L -> 1; O -> 0
    ['steady-oooo-iiii-llll-0000', 'STEADY0000111111110000'],
    ['Your code: STEADY-DEMO-0000-0000-0001', 'STEADYDEM0000000000001'], // copied with a label
  ])('%s -> %s', (input, want) => {
    expect(normalizeCode(input)).toBe(want)
  })

  it('is idempotent', () => {
    fc.assert(fc.property(fc.string(), (s) => normalizeCode(normalizeCode(s)) === normalizeCode(s)))
  })
})

describe('formatCodeBody (what the input shows)', () => {
  it.each([
    ['', ''],
    ['demo', 'DEM0'],
    ['demo0', 'DEM0-0'],
    ['DEM0-', 'DEM0'], // backspacing over a dash removes it too
    ['STEADY-DEMO-0000-0000-0001', 'DEM0-0000-0000-0001'],
    ['DEMO000000000001EXTRA', 'DEM0-0000-0000-0001'], // capped at 16
  ])('%j -> %j', (input, want) => {
    expect(formatCodeBody(input)).toBe(want)
  })

  it('never changes the code it formats', () => {
    const body = fc.string({ unit: fc.constantFrom(...CROCKFORD), minLength: 16, maxLength: 16 })
    fc.assert(
      fc.property(body, (b) => {
        fc.pre(!b.includes('STEADY'))
        return normalizeCode(formatCodeBody(b)) === `STEADY${b}`
      }),
    )
  })
})

describe('isCompleteCode', () => {
  it.each([
    [DEV_CODE, true],
    ['STEADY-DEMO-0000-0000-000', false],
    ['STEADY-DEMO-0000-0000-00011', false],
    ['STEADY-DEMU-0000-0000-0001', false], // U is not Crockford
    ['', false],
  ])('%s -> %s', (input, want) => {
    expect(isCompleteCode(input)).toBe(want)
  })
})

describe('hasLetterU', () => {
  it.each([
    ['STEADY-DEMU-0000-0000-0001', true],
    [DEV_CODE, false], // the U-less prefix itself never counts
    ['', false],
  ])('%s -> %s', (input, want) => {
    expect(hasLetterU(input)).toBe(want)
  })
})

describe('hashCode', () => {
  it("is sha256('steady-v1:' + normalized), hex", async () => {
    expect(await hashCode(DEV_CODE)).toBe(DEV_HASH)
    expect(await hashCode('demo 0000 0000 0001')).toBe(DEV_HASH)
  })

  it('the dev code from docs/DEV.md is in .env', () => {
    expect(VALID_HASHES).toContain(DEV_HASH)
  })
})

describe('parseHashes', () => {
  it.each([
    [undefined, []],
    ['', []],
    [` ${DEV_HASH.toUpperCase()} ,, `, [DEV_HASH]],
    [`${DEV_HASH},not-a-hash`, [DEV_HASH]],
  ])('%j', (raw, want) => {
    expect(parseHashes(raw)).toEqual(want)
  })
})

describe('checkCode', () => {
  it('accepts a listed code, typed any way, and reports only a hash prefix', async () => {
    for (const typed of [DEV_CODE, 'steady demo 0000 0000 0001', 'DEMO000000000001']) {
      expect(await checkCode(typed, [DEV_HASH])).toEqual({ ok: true, hashPrefix: '3b9b0537' })
    }
  })

  it('rejects a well-formed code that is not on the list', async () => {
    expect(await checkCode('STEADY-DEMO-0000-0000-0002', [DEV_HASH])).toEqual({
      ok: false,
      reason: 'wrong',
    })
  })

  it('rejects everything when no hashes are configured', async () => {
    expect(await checkCode(DEV_CODE, [])).toEqual({ ok: false, reason: 'wrong' })
  })

  it('says "incomplete" before hashing a short code', async () => {
    expect(await checkCode('STEADY-DEMO', [DEV_HASH])).toEqual({
      ok: false,
      reason: 'incomplete',
    })
  })

  it('accepts a rotated-in hash next to the old one', async () => {
    const other = await hashCode('STEADY-2222-3333-4444-5555')
    expect((await checkCode('STEADY-2222-3333-4444-5555', [DEV_HASH, other])).ok).toBe(true)
  })
})

describe('demo stub', () => {
  it('has no lock, no hashes, and accepts nothing', async () => {
    expect(stub.UNLOCK_REQUIRED).toBe(false)
    expect(stub.VALID_HASHES).toEqual([])
    expect(await stub.checkCode(DEV_CODE)).toEqual({ ok: false, reason: 'wrong' })
  })

  it('shares the code helpers', () => {
    expect(stub.formatCodeBody(DEV_CODE)).toBe('DEM0-0000-0000-0001')
    expect(codeBody(DEV_CODE)).toBe('DEM0000000000001')
  })
})
