// Shared domain types (PLAN §3.3). Plain data only, so rows go straight into IndexedDB
// and backups without any class rehydration.
import type { Cents } from './money'

export type { Cents }
/** Calendar date, always 'YYYY-MM-DD'. */
export type ISODate = string
/** Point in time, full ISO timestamp. */
export type Instant = string
export type Id = string

export type WeekendRule = 'before' | 'after' | 'none'
export type DayOfMonth = number | 'last'

export type PaySchedule =
  | { kind: 'weekly' | 'biweekly'; anchor: ISODate }
  | { kind: 'semimonthly'; days: [number, DayOfMonth] }
  | { kind: 'monthly'; day: DayOfMonth }
  | { kind: 'irregular'; expected: ISODate[] }

export interface IncomeSource {
  id: Id
  name: string
  amount: Cents
  schedule: PaySchedule
  weekendRule: WeekendRule
  primary: boolean
  active: boolean
}

export interface PaydayOverride {
  id: string // `${incomeId}|${originalDate}`
  incomeId: Id
  originalDate: ISODate
  date: ISODate
}

export type Recurrence =
  | { freq: 'once'; date: ISODate }
  | { freq: 'weekly'; interval: number; anchor: ISODate }
  | { freq: 'monthly'; interval: number; day: DayOfMonth; anchor: ISODate }
  // `start` is our addition to PLAN §3.3: without it a yearly series has no first date,
  // so a "change from X" split could not stop the new series from reaching into the past.
  | { freq: 'yearly'; month: number; day: number; start?: ISODate }

export interface Bill {
  id: Id
  name: string
  amount: Cents
  rule: Recurrence
  until?: ISODate
  envelopeId?: Id
  debtId?: Id
  autopay: boolean
  createdAt: Instant
  deletedAt?: Instant
}

export interface BillOccurrence {
  id: string // `${billId}|${originalDate}`
  billId: Id
  originalDate: ISODate
  status: 'paid' | 'skipped' | 'moved'
  movedTo?: ISODate
  amountOverride?: Cents
  paidAmount?: Cents
  paidAt?: Instant
  auto?: boolean
}

export interface Envelope {
  id: Id
  name: string
  budget: Cents
  isDefault: boolean
  color: string
  sort: number
  deletedAt?: Instant
}

export interface Transaction {
  id: Id
  date: ISODate
  amount: Cents // + in, - out
  note: string
  envelopeId?: Id
  fundId?: Id
  debtId?: Id
  billOccurrenceId?: string
  inBalance?: boolean // backdated, already in bank balance
  createdAt: Instant
  deletedAt?: Instant
}

export interface BalanceCheckIn {
  id: Id
  at: Instant
  date: ISODate
  balance: Cents
}

export interface SavingsFund {
  id: Id
  name: string
  target?: Cents
  /** Our addition to PLAN §3.3: lets Goals say "about €x per payday to reach it by then". */
  targetDate?: ISODate
  perPeriod: Cents
  openingSaved: Cents
  challenge?: { kind: '52week' | 'fixed'; start: ISODate }
  deletedAt?: Instant
}

export interface Debt {
  id: Id
  name: string
  balance: Cents
  balanceAsOf: ISODate
  /** Balance when the debt was added (schema v2), so "% paid" survives balance edits. */
  originalBalance: Cents
  aprBps: number
  minPayment: Cents
  dueDay: number
  deletedAt?: Instant
}

export interface ImpulseItem {
  id: Id
  name: string
  amount: Cents
  addedAt: Instant
  decision?: 'bought' | 'skipped' | 'archived'
  decidedAt?: Instant
}

export interface NoSpendDay {
  date: ISODate
}

/**
 * A few words for a day ("dentist, card at home") or a pay period ("birthday month, go
 * easy"). Exactly one of date / periodStart is set; the id is derived from it (noteId), so
 * there is at most one note per day and per period and a save is a plain put.
 */
export interface Note {
  id: string
  date?: ISODate
  periodStart?: ISODate
  text: string
  updatedAt: Instant
}

/** Notes are a few words; the cap only stops a pasted essay (or an edited backup). */
export const NOTE_MAX_LENGTH = 2000

export type NoteTarget = { date: ISODate } | { periodStart: ISODate }

export const noteId = (target: NoteTarget) =>
  'date' in target ? `day|${target.date}` : `period|${target.periodStart}`

/** Where a life goal stands. Plain words, no deadline pressure (PLAN §1.3). */
export const LIFE_GOAL_STATUSES = ['todo', 'doing', 'done'] as const
export type LifeGoalStatus = (typeof LIFE_GOAL_STATUSES)[number]

/**
 * A free-form goal ("Move to Lisbon", "Learn to drive"): the why behind the numbers.
 * Optionally linked to the savings fund or debt that gets it there.
 */
export interface LifeGoal {
  id: Id
  title: string
  /** Why it matters, or any notes. */
  why?: string
  targetDate?: ISODate
  status: LifeGoalStatus
  fundId?: Id
  debtId?: Id
  createdAt: Instant
  /** When it was marked done, for "Done in March". */
  doneAt?: Instant
}

export const LIFE_GOAL_TITLE_MAX = 120
export const LIFE_GOAL_WHY_MAX = 1000

export interface UndoEntry {
  seq?: number
  at: Instant
  label: string
  ops: { table: string; before: unknown | null; key: string }[]
}

export interface Meta {
  key: string
  value: unknown
}

export const occurrenceId = (billId: Id, originalDate: ISODate) => `${billId}|${originalDate}`
export const paydayOverrideId = (incomeId: Id, originalDate: ISODate) =>
  `${incomeId}|${originalDate}`
