// The one card on Today (PLAN §4.5): a fixed priority list, first match wins. Each action
// takes 30 seconds or less, and "Not now" snoozes it for 24 h without any guilt copy.
// Snoozing one action lets the next one in line through, never an empty card.
import { addDays } from './dates'
import type { Cents } from './money'
import type { Id, Instant, ISODate } from './types'

export type ActionKind =
  | 'payday-unknown'
  | 'overdue-bill'
  | 'stale-balance'
  | 'payday-checkin'
  | 'demo-try'
  | 'backup'
  | 'impulse'
  | 'setup-bills'
  | 'log-today'
  | 'all-done'

export interface OverdueBill {
  billId: Id
  originalDate: ISODate
  date: ISODate
  name: string
  amount: Cents
}

export interface ActionState {
  /** Null when no schedule gives a future payday (irregular pay with no date left). */
  nextPayday: ISODate | null
  /** Unpaid manual bills dated before today. Autopay ones reconcile at check-in. */
  overdue: readonly OverdueBill[]
  balanceAgeDays: number
  paydaySinceCheckIn: boolean
  /** Days since the last backup, or since the data started when there was none. */
  daysSinceBackup: number
  /** 48h-list items whose wait is over (M9; 0 until then). */
  expiredImpulse?: number
  hasBills: boolean
  loggedToday: boolean
  /**
   * The demo. 'sample' is the sample household before the visitor has added anything:
   * its first card invites them to try logging. In any demo there is no backup card (the
   * demo resets itself; More offers bringing the setup over instead).
   */
  demo?: 'sample' | 'other'
}

export interface NextAction {
  /** Snooze key. Per bill for overdue ones, so snoozing rent still shows the phone bill. */
  id: string
  kind: ActionKind
  trigger: string
  detail: string
  /** Button label; null for the resting "All done" state. */
  cta: string | null
  /** What to say once it is done. */
  doneState: string
  snoozable: boolean
  bill?: OverdueBill
}

/** id -> instant the snooze ends. */
export type Snoozes = Readonly<Record<string, Instant>>

export const SNOOZE_HOURS = 24
export const STALE_BALANCE_DAYS = 3
export const BACKUP_DAYS = 14

/** Pure: `now` is passed in. Instants from toISOString sort as strings. */
export const isSnoozed = (id: string, snoozes: Snoozes, now: Instant) => (snoozes[id] ?? '') > now

export function snoozeUntil(now: Instant, hours = SNOOZE_HOURS): Instant {
  return new Date(Date.parse(now) + hours * 3_600_000).toISOString()
}

/** Adds one snooze and drops the expired ones, so the stored map never grows forever. */
export function addSnooze(snoozes: Snoozes, id: string, now: Instant): Record<string, Instant> {
  const next: Record<string, Instant> = {}
  for (const [k, until] of Object.entries(snoozes)) if (until > now) next[k] = until
  next[id] = snoozeUntil(now)
  return next
}

export function candidates(state: ActionState, today: ISODate): NextAction[] {
  const out: NextAction[] = []
  const add = (a: Omit<NextAction, 'snoozable'> & { snoozable?: boolean }) =>
    out.push({ snoozable: true, ...a })

  if (state.nextPayday === null)
    add({
      id: 'payday-unknown',
      kind: 'payday-unknown',
      trigger: 'When is your next pay?',
      detail: 'Add the date and today’s number counts down to it.',
      cta: 'Add payday',
      doneState: 'Payday added.',
    })
  for (const bill of [...state.overdue].sort((a, b) => (a.date < b.date ? -1 : 1)))
    add({
      id: `overdue:${bill.billId}|${bill.originalDate}`,
      kind: 'overdue-bill',
      trigger: `Did ${bill.name} go out?`,
      detail: bill.date === today ? 'It was due today.' : 'It was due a little while ago.',
      cta: 'Yes, it’s paid',
      doneState: `${bill.name} marked paid.`,
      bill,
    })
  const payday = () =>
    add({
      id: 'payday-checkin',
      kind: 'payday-checkin',
      trigger: 'Payday! Update your balance',
      detail: 'Your pay isn’t in today’s number until you do.',
      cta: 'Update',
      // PLAN §4.5: payday is the backup moment, so the done state offers one.
      doneState: 'Balance updated. A good moment for a backup.',
    })
  // A stale balance after a payday is the same task (one check-in), so it takes the
  // payday wording at the stale slot. Otherwise the plainer card wins, the check-in
  // clears the payday one, and the payday backup offer is lost.
  if (state.balanceAgeDays > STALE_BALANCE_DAYS && !state.paydaySinceCheckIn)
    add({
      id: 'stale-balance',
      kind: 'stale-balance',
      trigger: 'Update your balance',
      detail: 'Takes 20 seconds. Keeps today’s number honest.',
      cta: 'Update',
      doneState: 'Balance updated.',
    })
  if (state.paydaySinceCheckIn) payday()
  if (state.demo === 'sample')
    add({
      id: 'demo-try',
      kind: 'demo-try',
      trigger: 'Try logging “12 coffee”',
      detail: 'Type it the way you’d say it. Steady files it and updates the plan.',
      cta: 'Try it',
      doneState: 'Logged.',
    })
  if (state.daysSinceBackup > BACKUP_DAYS && state.demo === undefined)
    add({
      id: 'backup',
      kind: 'backup',
      trigger: 'Save a backup',
      detail: 'Everything lives on this phone. One file keeps it safe.',
      cta: 'Back up',
      doneState: 'Backup saved.',
    })
  if ((state.expiredImpulse ?? 0) > 0)
    add({
      id: 'impulse',
      kind: 'impulse',
      trigger: 'Time to decide on your 48h list',
      detail: 'Still want it? Two taps each.',
      cta: 'Decide',
      doneState: 'Decided.',
    })
  if (!state.hasBills)
    add({
      id: 'setup-bills',
      kind: 'setup-bills',
      trigger: 'Add your rent',
      // The day before payday hardly any bill is left before it, so "come off today's
      // number" would ring hollow: the point is the pay period that starts tomorrow.
      detail:
        state.nextPayday !== null && state.nextPayday === addDays(today, 1)
          ? 'About 20 seconds. Payday is tomorrow: add it now and your new plan has rent in it from day one.'
          : 'About 20 seconds. Bills before payday come off today’s number.',
      cta: 'Add a bill',
      doneState: 'Bill added.',
    })
  if (!state.loggedToday)
    add({
      id: 'log-today',
      kind: 'log-today',
      trigger: 'Log today’s spending',
      detail: 'A quick note, like “12 coffee”. Nothing to log? That counts too.',
      cta: 'Log something',
      doneState: 'Logged.',
    })
  add({
    id: 'all-done',
    kind: 'all-done',
    trigger: 'All done for today.',
    detail: 'Nothing needs you. Enjoy your day.',
    cta: null,
    doneState: 'All done for today.',
    snoozable: false,
  })
  return out
}

export function nextAction(
  state: ActionState,
  snoozes: Snoozes,
  today: ISODate,
  now: Instant,
): NextAction {
  // 'all-done' is last and never snoozable, so this always finds one.
  return candidates(state, today).find((a) => !a.snoozable || !isSnoozed(a.id, snoozes, now))!
}
