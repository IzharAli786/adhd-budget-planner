// Backup and restore (PLAN §6). A backup is plain JSON with a header and every user table.
// Restore is all-or-nothing: validate the whole file first, snapshot what is on the device,
// then replace everything in ONE transaction so a crash halfway can't leave a mix.
import { withDefaults, type Settings } from '../domain/settings'
import { noteId, type Instant, type ISODate } from '../domain/types'
import { CURRENCY_DECIMALS, type CurrencyCode } from '../domain/currencies'
import {
  dataSchema,
  headerSchema,
  INVALID_DATE,
  metaValueSchemas,
  UNSAFE_AMOUNT,
} from './backupSchema'
import { MIGRATIONS, migrateData, type Migration, type TableData } from './migrations'
import { isExportedMetaKey, isInternalMetaKey } from './repos/meta'
import {
  DATA_TABLES,
  db,
  PRIMARY_KEY,
  SCHEMA_VERSION,
  type DataTableName,
  type RowTypes,
} from './schema'
import { writeSnapshot } from './snapshot'
import { todayISO } from '../lib/clock'

export type BackupSource = 'full' | 'demo'
export type BackupData = { [K in DataTableName]: RowTypes[K][] }

export interface BackupFile {
  app: 'steady'
  schemaVersion: number
  exportedAt: Instant
  source: BackupSource
  currency: string
  decimals: number
  data: BackupData
}

export const MAX_BACKUP_BYTES = 5 * 1024 * 1024

/** What a demo file may bring into the full app: the setup, never the activity. */
export const SETUP_TABLES = [
  'incomes',
  'paydayOverrides',
  'bills',
  'envelopes',
  'funds',
  'debts',
] as const

export const defaultSource = (): BackupSource => (import.meta.env.MODE === 'demo' ? 'demo' : 'full')

export const backupFileName = (today: ISODate, source: BackupSource = defaultSource()) =>
  source === 'demo' ? `steady-demo-setup-${today}.json` : `steady-backup-${today}.json`

/**
 * The backup as a ready File. Built BEFORE the user taps Save: iOS only lets
 * navigator.share() run inside the tap's transient activation, and awaiting IndexedDB
 * in the click handler would use it up (PLAN §6). Named by the LOCAL date.
 */
export async function prepareBackupFile(
  now: Date = new Date(),
  name: string = backupFileName(todayISO(now)),
): Promise<File> {
  const json = JSON.stringify(await exportBackup(now), null, 2)
  return new File([json], name, { type: 'application/json' })
}

/** "Save this year as a file": the same full backup, named for the year it closes. */
export const archiveFileName = (year: string) => `steady-${year}-archive.json`

export async function exportBackup(
  now: Date = new Date(),
  source: BackupSource = defaultSource(),
): Promise<BackupFile> {
  const data = await db.transaction(
    'r',
    DATA_TABLES.map((t) => db.table(t)),
    async () => {
      const out = {} as Record<DataTableName, unknown[]>
      for (const table of DATA_TABLES) out[table] = await db.table(table).toArray()
      return out as BackupData
    },
  )
  data.meta = data.meta.filter((m) => isExportedMetaKey(m.key))
  const settings = withDefaults(
    data.meta.find((m) => m.key === 'settings')?.value as Partial<Settings>,
  )
  return {
    app: 'steady',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    source,
    currency: settings.currency,
    decimals: settings.decimals,
    data,
  }
}

// ---------------------------------------------------------------------------------------
// Validation

export type RestoreErrorCode =
  | 'too-large'
  | 'not-json'
  | 'not-steady'
  | 'newer-schema'
  | 'invalid-shape'
  | 'unsafe-amount'
  | 'invalid-date'
  | 'duplicate-id'
  | 'dangling-ref'

export interface RestoreError {
  code: RestoreErrorCode
  message: string
  /** Where it went wrong, e.g. "transactions[3].amount", for the support macro. */
  path?: string
}

export interface RestorePreview {
  source: BackupSource
  exportedAt: Instant
  currency: string
  counts: Record<DataTableName, number>
  /** Earliest and latest transaction or check-in date, if any. */
  from?: ISODate
  to?: ISODate
}

export interface ValidBackup {
  file: BackupFile
  preview: RestorePreview
}

export type ValidationResult =
  { ok: true; backup: ValidBackup } | { ok: false; error: RestoreError }

const MESSAGES: Record<RestoreErrorCode, string> = {
  'too-large': 'This file is over 5 MB, which is far bigger than any Steady backup.',
  'not-json': 'This file is not a Steady backup (it is not valid JSON).',
  'not-steady': 'This file is not a Steady backup.',
  'newer-schema': 'This backup comes from a newer version of Steady. Update the app first.',
  'invalid-shape': 'Part of this backup is damaged or was edited by hand.',
  'unsafe-amount': 'An amount in this backup is not a whole number of cents.',
  'invalid-date': 'A date in this backup does not exist on the calendar.',
  'duplicate-id': 'Two items in this backup share the same id.',
  'dangling-ref': 'An item in this backup points at something that is missing.',
}

const fail = (code: RestoreErrorCode, path?: string): ValidationResult => ({
  ok: false,
  error: { code, message: MESSAGES[code], ...(path !== undefined ? { path } : {}) },
})

const byteLength = (text: string) => new TextEncoder().encode(text).length

interface Issue {
  message: string
  path: PropertyKey[]
  errors?: Issue[][]
}

// Our refinements put a stable code in `message`. Union issues nest their branches'
// issues, so search depth-first and prefer a specific code over generic "invalid".
function classify(issues: readonly Issue[], prefix: PropertyKey[] = []): RestoreError {
  for (const issue of issues) {
    const path = [...prefix, ...issue.path]
    if (issue.message === UNSAFE_AMOUNT || issue.message === INVALID_DATE) {
      return { code: issue.message, message: MESSAGES[issue.message], path: formatPath(path) }
    }
    for (const branch of issue.errors ?? []) {
      const nested = classify(branch, path)
      if (nested.code !== 'invalid-shape') return nested
    }
  }
  const first = issues[0]
  const path = first ? formatPath([...prefix, ...first.path]) : undefined
  return { code: 'invalid-shape', message: MESSAGES['invalid-shape'], ...(path ? { path } : {}) }
}

const formatPath = (path: PropertyKey[]) =>
  path.reduce<string>(
    (s, p) => (typeof p === 'number' ? `${s}[${p}]` : s ? `${s}.${String(p)}` : String(p)),
    '',
  )

/**
 * Checks a backup against every PLAN §6 rule. Accepts the raw file text (preferred: the
 * size check then measures real bytes) or an already parsed value.
 */
export function validateBackup(
  input: unknown,
  appVersion = SCHEMA_VERSION,
  registry: Partial<Record<number, Migration>> = MIGRATIONS,
): ValidationResult {
  let json: unknown = input
  if (typeof input === 'string') {
    if (byteLength(input) > MAX_BACKUP_BYTES) return fail('too-large')
    try {
      json = JSON.parse(input)
    } catch {
      return fail('not-json')
    }
  } else {
    const text = JSON.stringify(input)
    if (text === undefined) return fail('not-steady')
    if (byteLength(text) > MAX_BACKUP_BYTES) return fail('too-large')
  }

  if (typeof json !== 'object' || json === null || (json as { app?: unknown }).app !== 'steady') {
    return fail('not-steady')
  }
  // Version first: a newer file legitimately has shapes this code can't read, and
  // "update the app" is the only useful answer, not "damaged".
  const version = (json as { schemaVersion?: unknown }).schemaVersion
  if (typeof version === 'number' && version > appVersion) return fail('newer-schema')

  const header = headerSchema.safeParse(json)
  if (!header.success) return { ok: false, error: classify(header.error.issues as Issue[]) }

  const { source, exportedAt, currency, decimals, schemaVersion } = header.data
  // Each table must at least be an array before a transform maps over it, and a transform
  // written for well-formed old rows may still throw on a hand-edited one. Either way the
  // file is damaged, which is an answer, not a crash in the restore screen.
  const raw = header.data.data
  for (const [table, rows] of Object.entries(raw)) {
    if (!Array.isArray(rows)) return fail('invalid-shape', `data.${table}`)
  }
  let migrated: TableData
  try {
    migrated = migrateData(raw as TableData, schemaVersion, appVersion, registry)
  } catch {
    return fail('invalid-shape', 'data')
  }
  const parsed = dataSchema.safeParse(migrated)
  if (!parsed.success) {
    return { ok: false, error: classify(parsed.error.issues as Issue[], ['data']) }
  }

  const data = {} as BackupData
  for (const table of DATA_TABLES) {
    ;(data as Record<string, unknown[]>)[table] = parsed.data[table] ?? []
  }

  // Internal keys (unlock state, nag counters) and unknown keys never come in.
  const meta: BackupData['meta'] = []
  for (const [i, row] of data.meta.entries()) {
    if (!isExportedMetaKey(row.key)) continue
    const schema = metaValueSchemas[row.key as keyof typeof metaValueSchemas]
    const value = schema.safeParse(row.value)
    if (!value.success) {
      return {
        ok: false,
        error: classify(value.error.issues as Issue[], ['data', 'meta', i, 'value']),
      }
    }
    meta.push({ key: row.key, value: value.data })
  }
  data.meta = meta

  // Amounts only mean something with their currency: 1250 is EUR 12.50 but JPY 1250.
  // The header and the stored settings must agree, and decimals must match the fixed
  // table, or every number would be misread by a factor of 10^n after restore.
  if (decimals !== CURRENCY_DECIMALS[currency as CurrencyCode])
    return fail('invalid-shape', 'decimals')
  const settingsIndex = data.meta.findIndex((m) => m.key === 'settings')
  if (settingsIndex >= 0) {
    const stored = withDefaults(data.meta[settingsIndex]!.value as Partial<Settings>)
    if (stored.currency !== currency || stored.decimals !== decimals) {
      return fail('invalid-shape', `data.meta[${settingsIndex}].value.currency`)
    }
  } else if (source === 'full') {
    const defaults = withDefaults(undefined)
    if (defaults.currency !== currency || defaults.decimals !== decimals) {
      // No settings row means "defaults", which would relabel the amounts. Pin the currency.
      data.meta.push({ key: 'settings', value: { currency, decimals } })
    }
  }

  const integrity = checkIntegrity(data)
  if (integrity) return { ok: false, error: integrity }

  const finalData = source === 'demo' ? setupOnly(data) : data
  const file: BackupFile = {
    app: 'steady',
    schemaVersion: appVersion,
    exportedAt,
    source,
    currency,
    decimals,
    data: finalData,
  }
  return { ok: true, backup: { file, preview: previewOf(file) } }
}

/** Reads a picked file, refusing oversized ones before loading them into memory. */
export async function readBackupFile(file: Blob): Promise<ValidationResult> {
  if (file.size > MAX_BACKUP_BYTES) return fail('too-large')
  return validateBackup(await file.text())
}

function checkIntegrity(data: BackupData): RestoreError | null {
  const ids = {} as Record<DataTableName, Set<string>>
  for (const table of DATA_TABLES) {
    const key = PRIMARY_KEY[table]
    const seen = new Set<string>()
    for (const [i, row] of (data[table] as unknown as Record<string, string>[]).entries()) {
      const value = row[key]!
      if (seen.has(value)) {
        return {
          code: 'duplicate-id',
          message: MESSAGES['duplicate-id'],
          path: `data.${table}[${i}].${key}`,
        }
      }
      seen.add(value)
    }
    ids[table] = seen
  }

  const refs: [DataTableName, string, DataTableName][] = [
    ['paydayOverrides', 'incomeId', 'incomes'],
    ['bills', 'envelopeId', 'envelopes'],
    ['bills', 'debtId', 'debts'],
    ['billOccurrences', 'billId', 'bills'],
    ['transactions', 'envelopeId', 'envelopes'],
    ['transactions', 'fundId', 'funds'],
    ['transactions', 'debtId', 'debts'],
  ]
  for (const [table, field, target] of refs) {
    for (const [i, row] of (data[table] as unknown as Record<string, unknown>[]).entries()) {
      const ref = row[field]
      if (ref !== undefined && !ids[target].has(ref as string)) {
        return {
          code: 'dangling-ref',
          message: MESSAGES['dangling-ref'],
          path: `data.${table}[${i}].${field}`,
        }
      }
    }
  }
  // Composite ids are how upserts find "the" override for an occurrence or payday. A row
  // whose id disagrees with its fields would never be found and get a silent twin.
  const composite: [DataTableName, string, string][] = [
    ['billOccurrences', 'billId', 'originalDate'],
    ['paydayOverrides', 'incomeId', 'originalDate'],
  ]
  for (const [table, owner, date] of composite) {
    for (const [i, row] of (data[table] as unknown as Record<string, string>[]).entries()) {
      if (row.id !== `${row[owner]}|${row[date]}`) {
        return {
          code: 'invalid-shape',
          message: MESSAGES['invalid-shape'],
          path: `data.${table}[${i}].id`,
        }
      }
    }
  }

  // A note belongs to a day OR a pay period, and its id says which (noteId), so a save
  // after restore finds it again instead of writing a twin.
  for (const [i, note] of data.notes.entries()) {
    const target =
      note.date !== undefined && note.periodStart === undefined
        ? { date: note.date }
        : note.periodStart !== undefined && note.date === undefined
          ? { periodStart: note.periodStart }
          : null
    if (target === null || note.id !== noteId(target)) {
      return {
        code: 'invalid-shape',
        message: MESSAGES['invalid-shape'],
        path: `data.notes[${i}].id`,
      }
    }
  }

  return null
}

// Demo files carry the setup someone built while trying the app. Activity (spending,
// check-ins, the 48h list) is sample noise, and deleted rows are clutter, so only live
// setup rows come across. References to anything left behind are dropped, not dangled.
function setupOnly(data: BackupData): BackupData {
  const live = <T extends { deletedAt?: string }>(rows: T[]) => rows.filter((r) => !r.deletedAt)
  const envelopes = live(data.envelopes)
  const debts = live(data.debts)
  const envelopeIds = new Set(envelopes.map((e) => e.id))
  const debtIds = new Set(debts.map((d) => d.id))
  const bills = live(data.bills)
    .filter((b) => b.debtId === undefined || debtIds.has(b.debtId))
    .map((b) => {
      if (b.envelopeId === undefined || envelopeIds.has(b.envelopeId)) return b
      const copy = { ...b }
      delete copy.envelopeId
      return copy
    })
  return {
    incomes: data.incomes,
    paydayOverrides: data.paydayOverrides,
    bills,
    billOccurrences: [],
    envelopes,
    transactions: [],
    checkIns: [],
    funds: live(data.funds),
    debts,
    impulse: [],
    noSpend: [],
    notes: [],
    meta: [],
  }
}

function previewOf(file: BackupFile): RestorePreview {
  const counts = {} as Record<DataTableName, number>
  for (const table of DATA_TABLES) counts[table] = file.data[table].length
  const dates = [
    ...file.data.transactions.map((t) => t.date),
    ...file.data.checkIns.map((c) => c.date),
  ].sort()
  return {
    source: file.source,
    exportedAt: file.exportedAt,
    currency: file.currency,
    counts,
    ...(dates.length > 0 ? { from: dates[0], to: dates[dates.length - 1] } : {}),
  }
}

// ---------------------------------------------------------------------------------------
// Import

/**
 * Replaces all user data with a validated backup. The device's current data is first
 * copied to the premigration snapshot DB, so even a confirmed wrong restore is recoverable.
 * Internal meta (unlock state, counters) belongs to this install and is kept. A demo file
 * keeps this device's settings and only brings its currency along with the setup.
 */
export async function importBackup({ file }: ValidBackup, now: Date = new Date()): Promise<void> {
  await writeSnapshot(db, 'import', now)
  await db.transaction('rw', db.tables, async () => {
    // The change counter restarts: right after a restore, the data IS a backup file.
    const internal = (await db.meta.toArray()).filter(
      (m) => isInternalMetaKey(m.key) && m.key !== 'changesSinceBackup',
    )
    const settings = withDefaults((await db.meta.get('settings'))?.value as Partial<Settings>)

    for (const table of DATA_TABLES) {
      await db.table(table).clear()
      await db.table(table).bulkPut(file.data[table])
    }
    await db.undo.clear() // before-images from the old data would resurrect it
    await db.meta.bulkPut(internal)
    if (file.source === 'demo') {
      await db.meta.put({
        key: 'settings',
        value: { ...settings, currency: file.currency, decimals: file.decimals },
      })
    }
  })
}
