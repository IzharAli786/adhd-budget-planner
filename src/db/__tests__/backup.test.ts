import { beforeEach, describe, expect, it } from 'vitest'
import {
  backupFileName,
  exportBackup,
  importBackup,
  MAX_BACKUP_BYTES,
  readBackupFile,
  validateBackup,
  type BackupFile,
  type RestoreErrorCode,
  type ValidBackup,
} from '../backup'
import { getSettings } from '../repos'
import { db, SCHEMA_VERSION } from '../schema'
import { listSnapshots, readSnapshot } from '../snapshot'
import { undoLast } from '../undo'
import { addTransaction, purgeDeleted } from '../repos'
import { LATEST_ROWS } from './fixtures/v1'
import { clone, loadRows, resetDb } from './helpers'

beforeEach(resetDb)

// Tests corrupt files on purpose, so they need to poke at arbitrary JSON.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any

const NOW = new Date('2026-10-31T12:00:00.000Z')

/** A valid exported file built from the v1 fixture, as plain JSON (what a real file is). */
async function fixtureFile(): Promise<BackupFile> {
  await loadRows(clone(LATEST_ROWS))
  return JSON.parse(JSON.stringify(await exportBackup(NOW, 'full')))
}

function mustValidate(json: unknown): ValidBackup {
  const result = validateBackup(json)
  if (!result.ok) throw new Error(`expected valid backup, got ${JSON.stringify(result.error)}`)
  return result.backup
}

describe('exportBackup', () => {
  it('writes the header and leaves internal meta and the undo log out', async () => {
    const file = await fixtureFile()
    expect(file).toMatchObject({
      app: 'steady',
      schemaVersion: SCHEMA_VERSION,
      exportedAt: NOW.toISOString(),
      source: 'full',
      currency: 'EUR',
      decimals: 2,
    })
    expect(file.data.meta.map((m) => m.key).sort()).toEqual(['lastBackupAt', 'settings'])
    expect(Object.keys(file.data)).not.toContain('undo')
    expect(backupFileName('2026-10-31')).toBe('steady-backup-2026-10-31.json')
  })
})

describe('round trip', () => {
  it('export -> wipe -> import -> export is deep-equal', async () => {
    const first = await fixtureFile()
    await resetDb()
    await importBackup(mustValidate(JSON.stringify(first)), NOW)
    const second = JSON.parse(JSON.stringify(await exportBackup(NOW, 'full')))
    expect(second).toEqual(first)
  })

  it('import replaces everything in place, keeps internal meta, clears undo, snapshots the old data', async () => {
    const file = await fixtureFile()
    await resetDb()
    await db.meta.put({ key: 'unlocked', value: { at: 'device', hashPrefix: 'beef' } })
    await addTransaction({ date: '2026-10-31', amount: -999, note: 'on device only' })

    await importBackup(mustValidate(file), NOW)

    expect(await db.transactions.get('tx-1')).toBeDefined()
    expect((await db.transactions.toArray()).some((t) => t.note === 'on device only')).toBe(false)
    expect((await db.meta.get('unlocked'))?.value).toEqual({ at: 'device', hashPrefix: 'beef' })
    expect(await db.meta.get('changesSinceBackup')).toBeUndefined() // file's internal keys never land
    expect(await undoLast()).toBeNull()

    const snap = await readSnapshot(db.name, 'import')
    expect(snap?.at).toBe(NOW.toISOString())
    expect((snap?.data.transactions as { note: string }[]).map((t) => t.note)).toEqual([
      'on device only',
    ])
  })
})

describe('validateBackup rejects', () => {
  type Mutator = (f: Loose) => void
  const cases: [string, Mutator, RestoreErrorCode, string?][] = [
    ['a newer schemaVersion', (f) => (f.schemaVersion = SCHEMA_VERSION + 1), 'newer-schema'],
    ['a different app', (f) => (f.app = 'mint'), 'not-steady'],
    [
      'a fractional amount',
      (f) => (f.data.transactions[0].amount = -12.5),
      'unsafe-amount',
      'data.transactions[0].amount',
    ],
    [
      'an amount beyond 2^53',
      (f) => (f.data.debts[0].balance = 2 ** 60),
      'unsafe-amount',
      'data.debts[0].balance',
    ],
    [
      'an unsafe nested amount',
      (f) => (f.data.billOccurrences[0].paidAmount = 1.1),
      'unsafe-amount',
    ],
    [
      'an unsafe settings buffer',
      (f) => (f.data.meta.find((m: Loose) => m.key === 'settings').value.buffer = 0.5),
      'unsafe-amount',
    ],
    [
      'Feb 30',
      (f) => (f.data.transactions[0].date = '2026-02-30'),
      'invalid-date',
      'data.transactions[0].date',
    ],
    [
      'a bad date inside a rule',
      (f) => (f.data.bills[0].rule.anchor = '2026-13-01'),
      'invalid-date',
      'data.bills[0].rule.anchor',
    ],
    [
      'a bad date inside a schedule',
      (f) => (f.data.incomes[1].schedule = { kind: 'weekly', anchor: '2025-02-29' }),
      'invalid-date',
    ],
    [
      'a duplicate id',
      (f) => (f.data.transactions[1].id = 'tx-1'),
      'duplicate-id',
      'data.transactions[1].id',
    ],
    [
      'a duplicate no-spend date',
      (f) => f.data.noSpend.push({ date: '2026-10-26' }),
      'duplicate-id',
    ],
    [
      'a dangling envelopeId',
      (f) => (f.data.transactions[0].envelopeId = 'gone'),
      'dangling-ref',
      'data.transactions[0].envelopeId',
    ],
    ['a dangling fundId', (f) => (f.data.transactions[1].fundId = 'gone'), 'dangling-ref'],
    ['a dangling debtId on a bill', (f) => (f.data.bills[1].debtId = 'gone'), 'dangling-ref'],
    ['a dangling billId', (f) => (f.data.billOccurrences[0].billId = 'gone'), 'dangling-ref'],
    ['a dangling incomeId', (f) => (f.data.paydayOverrides[0].incomeId = 'gone'), 'dangling-ref'],
    [
      'a wrong type',
      (f) => (f.data.bills[0].autopay = 'yes'),
      'invalid-shape',
      'data.bills[0].autopay',
    ],
    [
      'an unknown schedule kind',
      (f) => (f.data.incomes[0].schedule = { kind: 'hourly' }),
      'invalid-shape',
    ],
    ['a missing data block', (f) => delete f.data, 'invalid-shape'],
    ['a table that is not an array', (f) => (f.data.bills = {}), 'invalid-shape', 'data.bills'],
    ['schemaVersion 0', (f) => (f.schemaVersion = 0), 'invalid-shape', 'schemaVersion'],
    // Ranges: these would crash date maths after a "successful" restore.
    [
      'a weekly interval of 0',
      (f) => (f.data.bills[2].rule.interval = 0),
      'invalid-shape',
      'data.bills[2].rule.interval',
    ],
    [
      'a yearly month 13',
      (f) => (f.data.bills[0].rule = { freq: 'yearly', month: 13, day: 1 }),
      'invalid-shape',
    ],
    ['a monthly day 0', (f) => (f.data.bills[0].rule.day = 0), 'invalid-shape'],
    ['a semimonthly day 32', (f) => (f.data.incomes[1].schedule.days = [1, 32]), 'invalid-shape'],
    [
      'a debt due day 40',
      (f) => (f.data.debts[0].dueDay = 40),
      'invalid-shape',
      'data.debts[0].dueDay',
    ],
    ['a negative APR', (f) => (f.data.debts[0].aprBps = -1), 'invalid-shape'],
    [
      'a negative bill amount',
      (f) => (f.data.bills[0].amount = -95000),
      'invalid-shape',
      'data.bills[0].amount',
    ],
    ['a negative envelope budget', (f) => (f.data.envelopes[0].budget = -1), 'invalid-shape'],
    [
      'largeText 300%',
      (f) => (f.data.meta.find((m: Loose) => m.key === 'settings').value.largeText = 300),
      'invalid-shape',
    ],
    // Instants are compared as strings, so loose formats must not get in.
    [
      'an instant that is not ISO',
      (f) => (f.data.bills[0].createdAt = 'Oct 1 2026'),
      'invalid-date',
      'data.bills[0].createdAt',
    ],
    [
      'an instant on Feb 30',
      (f) => (f.data.checkIns[0].at = '2026-02-30T10:00:00.000Z'),
      'invalid-date',
    ],
    [
      'a non-instant lastBackupAt',
      (f) => (f.data.meta.find((m: Loose) => m.key === 'lastBackupAt').value = 42),
      'invalid-shape',
    ],
    // Currency: a mismatch would misread every amount by 10^n.
    ['an unknown currency', (f) => (f.currency = 'XXX'), 'invalid-shape', 'currency'],
    ['decimals that disagree with the table', (f) => (f.decimals = 0), 'invalid-shape', 'decimals'],
    [
      'settings in another currency than the header',
      (f) => {
        f.currency = 'JPY'
        f.decimals = 0
      },
      'invalid-shape',
    ],
    [
      'an occurrence id that does not match its bill and date',
      (f) => (f.data.billOccurrences[0].originalDate = '2026-11-01'),
      'invalid-shape',
      'data.billOccurrences[0].id',
    ],
    [
      'a payday override id that does not match',
      (f) => (f.data.paydayOverrides[0].id = 'inc-1|2027-01-01'),
      'invalid-shape',
      'data.paydayOverrides[0].id',
    ],
  ]

  it.each(cases)('%s', async (_, mutate, code, path) => {
    const file = (await fixtureFile()) as unknown as Record<string, unknown>
    mutate(file)
    const result = validateBackup(JSON.stringify(file))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe(code)
    expect(result.error.message.length).toBeGreaterThan(0)
    if (path) expect(result.error.path).toBe(path)
  })

  it('files over 5 MB, as text and as a Blob', async () => {
    const file = await fixtureFile()
    const big = JSON.stringify({ ...file, padding: 'x'.repeat(MAX_BACKUP_BYTES) })
    expect(validateBackup(big)).toMatchObject({ ok: false, error: { code: 'too-large' } })
    expect(await readBackupFile(new Blob([big]))).toMatchObject({
      ok: false,
      error: { code: 'too-large' },
    })
  })

  it('a damaged old-version file whose migration throws', async () => {
    const file = await fixtureFile()
    const boom = () => {
      throw new TypeError('cannot read note of undefined')
    }
    const next = SCHEMA_VERSION + 1
    const result = validateBackup(JSON.stringify(file), next, { [next]: boom })
    expect(result).toMatchObject({ ok: false, error: { code: 'invalid-shape', path: 'data' } })
  })

  it('text that is not JSON', () => {
    expect(validateBackup('{nope')).toMatchObject({ ok: false, error: { code: 'not-json' } })
  })
})

describe('validateBackup accepts and cleans', () => {
  it('strips unknown keys at every level and internal meta keys', async () => {
    const file = (await fixtureFile()) as unknown as Loose
    file.extra = 1
    file.data.secretTable = [{ id: 'x' }]
    file.data.transactions[0].hacked = true
    file.data.bills[0].rule.zzz = 1
    file.data.meta.push({ key: 'unlocked', value: { at: 'x' } })
    file.data.meta.push({ key: 'snoozesToday', value: 3 })
    file.data.meta.push({ key: 'somethingNew', value: 'x' })
    file.data.meta.find((m: { key: string }) => m.key === 'settings').value.evil = 1

    const { file: clean } = mustValidate(file)
    expect(clean).not.toHaveProperty('extra')
    expect(clean.data).not.toHaveProperty('secretTable')
    expect(clean.data.transactions[0]).not.toHaveProperty('hacked')
    expect(clean.data.bills[0]!.rule).not.toHaveProperty('zzz')
    expect(clean.data.meta.map((m) => m.key).sort()).toEqual(['lastBackupAt', 'settings'])
    expect(clean.data.meta.find((m) => m.key === 'settings')?.value).not.toHaveProperty('evil')
  })

  it('carries the payday carry-overs (Look back), and refuses a malformed one', async () => {
    const file = (await fixtureFile()) as unknown as Loose
    const log = { '2026-10-30': { carried: 4800, at: '2026-11-02T08:00:00.000Z' } }
    file.data.meta.push({ key: 'periodClose', value: log })
    const { file: clean } = mustValidate(clone(file))
    expect(clean.data.meta.find((m) => m.key === 'periodClose')?.value).toEqual(log)

    file.data.meta.at(-1).value = { 'not-a-date': { carried: 1.5, at: 'x' } }
    expect(validateBackup(file)).toMatchObject({ ok: false })
  })

  it('normalises instants with an offset to UTC toISOString form', async () => {
    const file = (await fixtureFile()) as unknown as Loose
    file.data.checkIns[0].at = '2026-10-27T21:00:00+02:00'
    file.data.bills[0].createdAt = '2026-01-01T09:00Z'
    const { file: clean } = mustValidate(file)
    expect(clean.data.checkIns[0]!.at).toBe('2026-10-27T19:00:00.000Z')
    expect(clean.data.bills[0]!.createdAt).toBe('2026-01-01T09:00:00.000Z')
  })

  it('pins the currency when a non-default file has no settings row', async () => {
    await loadRows(clone({ ...LATEST_ROWS, meta: [] }))
    await db.meta.put({ key: 'settings', value: { currency: 'JPY', decimals: 0 } })
    const exported = JSON.parse(JSON.stringify(await exportBackup(NOW, 'full'))) as Loose
    exported.data.meta = []
    const { file: clean } = mustValidate(exported)
    expect(clean.data.meta).toEqual([{ key: 'settings', value: { currency: 'JPY', decimals: 0 } }])

    await resetDb()
    await importBackup(mustValidate(exported), NOW)
    expect(await getSettings()).toMatchObject({ currency: 'JPY', decimals: 0 })
  })

  it('treats missing tables as empty', async () => {
    const file = await fixtureFile()
    const partial = { ...file, data: { incomes: file.data.incomes } }
    const { file: clean, preview } = mustValidate(partial)
    expect(clean.data.transactions).toEqual([])
    expect(preview.counts.incomes).toBe(2)
  })

  it('previews counts and the date range', async () => {
    const { preview } = mustValidate(await fixtureFile())
    expect(preview).toMatchObject({
      source: 'full',
      currency: 'EUR',
      from: '2026-10-27',
      to: '2026-10-30',
      counts: { transactions: 3, bills: 3, checkIns: 1, meta: 2 },
    })
  })
})

describe('restore safety net', () => {
  it('two restores in a row keep the original device data in a snapshot', async () => {
    const file = await fixtureFile()
    await resetDb()
    await addTransaction({ date: '2026-10-31', amount: -999, note: 'original' })

    await importBackup(mustValidate(file), new Date('2026-10-31T12:00:00.000Z'))
    await importBackup(mustValidate(file), new Date('2026-10-31T12:05:00.000Z'))

    const snaps = (await listSnapshots(db.name)).filter((x) => x.reason === 'import')
    expect(snaps).toHaveLength(2)
    expect((snaps[0]!.data.transactions as { note: string }[]).map((t) => t.note)).toEqual([
      'original',
    ])
    expect((await readSnapshot(db.name, 'import'))?.at).toBe('2026-10-31T12:05:00.000Z')
  })

  it('a backup exported after purging still restores', async () => {
    await loadRows(clone(LATEST_ROWS))
    // Envelope, fund and debt deleted long ago, while live rows still point at them.
    for (const table of ['envelopes', 'funds', 'debts'] as const) {
      for (const row of await db.table(table).toArray())
        await db.table(table).update(row.id, { deletedAt: '2026-08-01T00:00:00.000Z' })
    }
    await db.envelopes.update('env-every', { deletedAt: undefined }) // keep the default
    await purgeDeleted(NOW)
    const file = JSON.parse(JSON.stringify(await exportBackup(NOW, 'full')))
    expect(validateBackup(file).ok).toBe(true)
  })
})

describe('demo files', () => {
  it('import setup only, keep device settings but take the currency', async () => {
    const file = await fixtureFile()
    const demo = { ...file, source: 'demo', currency: 'GBP' }
    ;(file.data.meta.find((m) => m.key === 'settings')!.value as { currency: string }).currency =
      'GBP'
    await resetDb()
    await db.meta.put({ key: 'settings', value: { theme: 'ocean' } })

    const valid = mustValidate(demo)
    expect(valid.preview.counts).toMatchObject({
      transactions: 0,
      checkIns: 0,
      impulse: 0,
      bills: 2,
    })
    await importBackup(valid, NOW)

    expect(await db.incomes.count()).toBe(2)
    expect(await db.paydayOverrides.count()).toBe(1)
    expect(await db.envelopes.count()).toBe(2)
    expect(await db.funds.count()).toBe(1)
    expect(await db.debts.count()).toBe(1)
    expect((await db.bills.toArray()).map((b) => b.id).sort()).toEqual(['bill-card', 'bill-rent']) // deleted one dropped
    for (const table of [
      'transactions',
      'checkIns',
      'billOccurrences',
      'impulse',
      'noSpend',
    ] as const) {
      expect(await db.table(table).count()).toBe(0)
    }
    const settings = await getSettings()
    expect(settings.theme).toBe('ocean')
    expect(settings.currency).toBe('GBP')
  })

  it('drops references to setup rows that were deleted in the demo', async () => {
    const file = await fixtureFile()
    ;(file.data.envelopes[1] as { deletedAt?: string }).deletedAt = '2026-10-01T00:00:00.000Z'
    const { file: clean } = mustValidate({ ...file, source: 'demo' })
    expect(clean.data.envelopes).toHaveLength(1)
    expect(clean.data.bills.find((b) => b.id === 'bill-rent')).not.toHaveProperty('envelopeId')
  })
})

describe('notes (schema v3)', () => {
  const dayNote = {
    id: 'day|2026-11-02',
    date: '2026-11-02',
    text: 'Car service at 9',
    updatedAt: '2026-10-31T09:00:00.000Z',
  }
  const periodNote = {
    id: 'period|2026-10-30',
    periodStart: '2026-10-30',
    text: 'Go easy, birthday month',
    updatedAt: '2026-10-31T09:00:00.000Z',
  }

  it('are exported, validated and restored with everything else', async () => {
    await loadRows({ ...clone(LATEST_ROWS), notes: [dayNote, periodNote] })
    const file = JSON.parse(JSON.stringify(await exportBackup(NOW, 'full'))) as BackupFile
    expect(file.schemaVersion).toBe(3)
    expect(file.data.notes).toHaveLength(2)
    await resetDb()
    const valid = mustValidate(file)
    expect(valid.preview.counts.notes).toBe(2)
    await importBackup(valid, NOW)
    expect(await db.notes.get('day|2026-11-02')).toEqual(dayNote)
    expect(await db.notes.get('period|2026-10-30')).toEqual(periodNote)
  })

  it('an app still on v2 refuses a v3 file instead of dropping its notes', async () => {
    const file: Loose = await fixtureFile()
    file.data.notes = [dayNote]
    const result = validateBackup(file, 2, {})
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('newer-schema')
  })

  it('an older v2 file without a notes table still restores, with no notes', async () => {
    const file: Loose = await fixtureFile()
    file.schemaVersion = 2
    delete file.data.notes
    await db.notes.put(dayNote)
    const valid = mustValidate(file)
    expect(valid.file.schemaVersion).toBe(SCHEMA_VERSION)
    expect(valid.file.data.notes).toEqual([])
    await importBackup(valid, NOW)
    expect(await db.notes.count()).toBe(0)
    expect(await db.transactions.count()).toBe(LATEST_ROWS.transactions!.length)
  })

  it.each<[string, Record<string, unknown>, string]>([
    ['both a date and a period', { ...dayNote, periodStart: '2026-10-30' }, 'data.notes[0].id'],
    [
      'neither a date nor a period',
      { id: 'day|x', text: 'x', updatedAt: dayNote.updatedAt },
      'data.notes[0].id',
    ],
    [
      'an id that does not match its date',
      { ...dayNote, id: 'day|2026-11-03' },
      'data.notes[0].id',
    ],
    ['a date that does not exist', { ...dayNote, date: '2026-02-30' }, 'data.notes[0].date'],
    ['text over the length cap', { ...dayNote, text: 'x'.repeat(2001) }, 'data.notes[0].text'],
  ])('rejects a note with %s', async (_, note, path) => {
    const file: Loose = await fixtureFile()
    file.data.notes = [note]
    const result = validateBackup(file)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.path).toBe(path)
  })

  it('a demo file brings no notes (they are activity, not setup)', async () => {
    const file: Loose = await fixtureFile()
    file.source = 'demo'
    file.data.notes = [dayNote]
    expect(mustValidate(file).file.data.notes).toEqual([])
  })
})
