// Shape of a backup file, checked with zod mini (small bundle cost, tree-shakes per call).
// z.object strips unknown keys, which is exactly the "unknown keys are stripped" rule.
// Semantic failures carry a stable code as their message so backup.ts can map them to
// a friendly error without parsing zod's wording.
import * as z from 'zod/mini'
import { isValidISODate } from '../domain/dates'
import { isSupportedCurrency } from '../domain/currencies'
import { THEMES } from '../domain/settings'
import type { EXPORTED_META_KEYS } from './repos/meta'

export const UNSAFE_AMOUNT = 'unsafe-amount'
export const INVALID_DATE = 'invalid-date'

// Amounts are integer minor units: 12.5 cents or 1e20 can only come from a broken or
// hand-edited file, and letting one in would poison every sum after it.
const cents = z.number().check(z.refine(Number.isSafeInteger, UNSAFE_AMOUNT))
// Only transactions and balances are signed. A negative rent would silently ADD money.
const amount = cents.check(z.nonnegative())
const int = z.number().check(z.refine(Number.isSafeInteger))
const ranged = (min: number, max: number) => int.check(z.gte(min), z.lte(max))
const isoDate = z.string().check(z.refine(isValidISODate, INVALID_DATE))

// Instants are compared as strings (deletedAt < cutoff, orderBy('at')), which only works
// when every one is in toISOString() form. Accept any ISO 8601 offset, store it as UTC.
const INSTANT_RE = /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/
const isInstant = (s: string) => {
  const m = INSTANT_RE.exec(s)
  return m !== null && isValidISODate(m[1]) && !Number.isNaN(Date.parse(s))
}
const instant = z.string().check(
  z.refine(isInstant, INVALID_DATE),
  z.overwrite((s) => (isInstant(s) ? new Date(s).toISOString() : s)),
)
const id = z.string().check(z.minLength(1))
// Ranges matter beyond tidiness: month 13 or day 0 would make makeDate emit dates that
// parseISODate later throws on, crashing the app after an otherwise "successful" restore.
const dayOfMonth = z.union([ranged(1, 31), z.literal('last')])
const interval = ranged(1, 1000)

const paySchedule = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal(['weekly', 'biweekly']), anchor: isoDate }),
  z.object({ kind: z.literal('semimonthly'), days: z.tuple([ranged(1, 31), dayOfMonth]) }),
  z.object({ kind: z.literal('monthly'), day: dayOfMonth }),
  z.object({ kind: z.literal('irregular'), expected: z.array(isoDate) }),
])

const recurrence = z.discriminatedUnion('freq', [
  z.object({ freq: z.literal('once'), date: isoDate }),
  z.object({ freq: z.literal('weekly'), interval, anchor: isoDate }),
  z.object({ freq: z.literal('monthly'), interval, day: dayOfMonth, anchor: isoDate }),
  z.object({
    freq: z.literal('yearly'),
    month: ranged(1, 12),
    day: ranged(1, 31),
    start: z.optional(isoDate),
  }),
])

const deletedAt = z.optional(instant)

export const rowSchemas = {
  incomes: z.object({
    id,
    name: z.string(),
    amount,
    schedule: paySchedule,
    weekendRule: z.enum(['before', 'after', 'none']),
    primary: z.boolean(),
    active: z.boolean(),
  }),
  paydayOverrides: z.object({ id, incomeId: id, originalDate: isoDate, date: isoDate }),
  bills: z.object({
    id,
    name: z.string(),
    amount,
    rule: recurrence,
    until: z.optional(isoDate),
    envelopeId: z.optional(id),
    debtId: z.optional(id),
    autopay: z.boolean(),
    createdAt: instant,
    deletedAt,
  }),
  billOccurrences: z.object({
    id,
    billId: id,
    originalDate: isoDate,
    status: z.enum(['paid', 'skipped', 'moved']),
    movedTo: z.optional(isoDate),
    amountOverride: z.optional(amount),
    paidAmount: z.optional(amount),
    paidAt: z.optional(instant),
    auto: z.optional(z.boolean()),
  }),
  envelopes: z.object({
    id,
    name: z.string(),
    budget: amount,
    isDefault: z.boolean(),
    color: z.string(),
    sort: int,
    deletedAt,
  }),
  transactions: z.object({
    id,
    date: isoDate,
    amount: cents,
    note: z.string(),
    envelopeId: z.optional(id),
    fundId: z.optional(id),
    debtId: z.optional(id),
    billOccurrenceId: z.optional(z.string()),
    inBalance: z.optional(z.boolean()),
    createdAt: instant,
    deletedAt,
  }),
  checkIns: z.object({ id, at: instant, date: isoDate, balance: cents }),
  funds: z.object({
    id,
    name: z.string(),
    target: z.optional(amount),
    perPeriod: amount,
    openingSaved: amount,
    challenge: z.optional(z.object({ kind: z.enum(['52week', 'fixed']), start: isoDate })),
    deletedAt,
  }),
  debts: z.object({
    id,
    name: z.string(),
    balance: amount,
    balanceAsOf: isoDate,
    originalBalance: amount,
    aprBps: ranged(0, 100_000),
    minPayment: amount,
    dueDay: ranged(1, 31),
    deletedAt,
  }),
  impulse: z.object({
    id,
    name: z.string(),
    amount,
    addedAt: instant,
    decision: z.optional(z.enum(['bought', 'skipped', 'archived'])),
    decidedAt: z.optional(instant),
  }),
  noSpend: z.object({ date: isoDate }),
  meta: z.object({ key: z.string(), value: z.unknown() }),
}

/** Every field optional: older files may predate a setting, and defaults fill the gap. */
export const settingsSchema = z.object({
  locale: z.optional(z.string()),
  currency: z.optional(z.string().check(z.refine(isSupportedCurrency))),
  decimals: z.optional(ranged(0, 4)),
  weekStart: z.optional(z.literal([0, 1, 2, 3, 4, 5, 6])),
  theme: z.optional(z.enum(THEMES)),
  mode: z.optional(z.enum(['auto', 'light', 'dark'])),
  simpleMode: z.optional(z.boolean()),
  largeText: z.optional(ranged(100, 150)),
  reducedMotion: z.optional(z.enum(['auto', 'on', 'off'])),
  buffer: z.optional(amount),
  envelopesEnabled: z.optional(z.boolean()),
})

// domain/setup.ts SetupProgress. A bad row would send a restored device back into setup
// with nonsense answers prefilled, so it is checked like any other row.
const setupProgressSchema = z.object({
  step: z.enum(['ack', 'payday', 'pay', 'balance', 'done']),
  ackAt: z.optional(instant),
  nextPayday: z.optional(isoDate),
  kind: z.optional(z.enum(['weekly', 'biweekly', 'semimonthly', 'monthly', 'irregular'])),
  otherDay: z.optional(dayOfMonth),
  amount: z.optional(amount),
  doneAt: z.optional(instant),
})

/** Values of the other exportable meta keys; each must have the shape the app writes. */
export const metaValueSchemas: Record<(typeof EXPORTED_META_KEYS)[number], z.ZodMiniType> = {
  settings: settingsSchema,
  lastBackupAt: instant,
  lastOpened: z.union([isoDate, instant]),
  gardenPoints: int.check(z.nonnegative()),
  setupProgress: setupProgressSchema,
}

export const headerSchema = z.object({
  app: z.literal('steady'),
  schemaVersion: ranged(1, Number.MAX_SAFE_INTEGER),
  exportedAt: instant,
  source: z.enum(['full', 'demo']),
  currency: z.string().check(z.refine(isSupportedCurrency)),
  decimals: ranged(0, 4),
  data: z.record(z.string(), z.unknown()),
})

export const dataSchema = z.object(
  Object.fromEntries(
    Object.entries(rowSchemas).map(([table, schema]) => [table, z.optional(z.array(schema))]),
  ) as {
    [K in keyof typeof rowSchemas]: z.ZodMiniOptional<z.ZodMiniArray<(typeof rowSchemas)[K]>>
  },
)
