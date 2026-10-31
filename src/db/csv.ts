// "Export for spreadsheets": transactions and bills as CSV. Export only: JSON stays the
// one restore format, because a spreadsheet round trip would lose ids, links and history.
// Cells are RFC 4180 (quoted when they hold a comma, quote or line break; CRLF rows) and
// guarded against CSV injection: a note like "=HYPERLINK(...)" must stay text in Excel.
import { addDays } from '../domain/dates'
import type { Cents } from '../domain/money'
import { ruleDates, seriesStart } from '../domain/recurrence'
import type {
  Bill,
  Debt,
  Envelope,
  ISODate,
  Recurrence,
  SavingsFund,
  Transaction,
} from '../domain/types'
import { todayISO } from '../lib/clock'
import { getSettings, listBills, listTransactions } from './repos'
import { db } from './schema'

// A spreadsheet runs a cell starting with these as a formula (tab and CR too, since some
// apps trim them first). OWASP's fix: a leading apostrophe, which shows as plain text.
// Also after leading spaces (an import that trims them would then see "="), and the
// full-width forms an East Asian keyboard types, which some spreadsheets read as ASCII.
export const FORMULA_START = /^[\t\r]|^\s*[=+\-@\uFF1D\uFF0B\uFF0D\uFF20]/

/** One text cell: formula-guarded, then quoted if it needs to be. */
export function csvText(value: string): string {
  const safe = FORMULA_START.test(value) ? `'${value}` : value
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

/**
 * Minor units as a plain decimal ("-12.50", "1250" for JPY), built from the integer so no
 * float rounding can creep in. Numbers we write ourselves are never guarded: a leading
 * "-" is a negative number, and the apostrophe would turn every expense into text.
 */
export function decimalAmount(cents: Cents, decimals: number): string {
  const sign = cents < 0 ? '-' : ''
  const digits = String(Math.abs(cents))
  if (decimals === 0) return sign + digits
  const padded = digits.padStart(decimals + 1, '0')
  return `${sign}${padded.slice(0, -decimals)}.${padded.slice(-decimals)}`
}

type Cell = string | { number: string }

/** Rows to CSV text: CRLF line ends, a final CRLF, every text cell through csvText. */
export function toCsv(header: readonly string[], rows: readonly Cell[][]): string {
  const line = (cells: readonly Cell[]) =>
    cells.map((c) => (typeof c === 'string' ? csvText(c) : c.number)).join(',')
  return [line(header), ...rows.map(line)].map((l) => `${l}\r\n`).join('')
}

export interface CsvContext {
  currency: string
  decimals: number
  envelopes?: readonly Pick<Envelope, 'id' | 'name'>[]
  funds?: readonly Pick<SavingsFund, 'id' | 'name'>[]
  debts?: readonly Pick<Debt, 'id' | 'name'>[]
}

const nameMap = (rows: readonly { id: string; name: string }[] = []) =>
  new Map(rows.map((r) => [r.id, r.name]))

function kindOf(t: Transaction, funds: Map<string, string>, debts: Map<string, string>) {
  if (t.fundId) return `Savings: ${funds.get(t.fundId) ?? 'fund'}`
  if (t.debtId) return `Debt payment: ${debts.get(t.debtId) ?? 'debt'}`
  if (t.billOccurrenceId) return 'Bill'
  return t.amount < 0 ? 'Spent' : 'Money in'
}

/** Live transactions, oldest first, one row each. */
export function transactionsToCsv(transactions: readonly Transaction[], ctx: CsvContext): string {
  const envelopes = nameMap(ctx.envelopes)
  const funds = nameMap(ctx.funds)
  const debts = nameMap(ctx.debts)
  const rows = transactions
    .filter((t) => t.deletedAt === undefined)
    .sort((a, b) =>
      a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.createdAt < b.createdAt ? -1 : 1,
    )
    .map((t): Cell[] => [
      t.date,
      { number: decimalAmount(t.amount, ctx.decimals) },
      ctx.currency,
      kindOf(t, funds, debts),
      (t.envelopeId && envelopes.get(t.envelopeId)) || '',
      t.note,
    ])
  return toCsv(['Date', 'Amount', 'Currency', 'Type', 'Envelope', 'Note'], rows)
}

/** "Every 2 weeks", "Monthly on day 15": plain English, no locale needed in a spreadsheet. */
export function repeatText(rule: Recurrence): string {
  switch (rule.freq) {
    case 'once':
      return 'Once'
    case 'weekly':
      return rule.interval === 1 ? 'Every week' : `Every ${rule.interval} weeks`
    case 'monthly': {
      const day = rule.day === 'last' ? 'the last day' : `day ${rule.day}`
      return rule.interval === 1 ? `Monthly on ${day}` : `Every ${rule.interval} months on ${day}`
    }
    case 'yearly':
      return `Yearly on ${String(rule.month).padStart(2, '0')}-${String(rule.day).padStart(2, '0')}`
  }
}

// About two years: the next date of any rule we store, even a yearly one, is inside it.
const NEXT_WINDOW_DAYS = 800

/** Live bills by name: amount, how it repeats, its first, last and next date by the rule. */
export function billsToCsv(bills: readonly Bill[], ctx: CsvContext & { today: ISODate }): string {
  const envelopes = nameMap(ctx.envelopes)
  const debts = nameMap(ctx.debts)
  const rows = bills
    .filter((b) => b.deletedAt === undefined)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((b): Cell[] => {
      const windowEnd = addDays(ctx.today, NEXT_WINDOW_DAYS)
      const end = b.until !== undefined && b.until < windowEnd ? addDays(b.until, 1) : windowEnd
      return [
        b.name,
        { number: decimalAmount(b.amount, ctx.decimals) },
        ctx.currency,
        repeatText(b.rule),
        seriesStart(b.rule) ?? '',
        b.until ?? '',
        ruleDates(b.rule, ctx.today, end)[0] ?? '',
        b.autopay ? 'Yes' : 'No',
        (b.envelopeId && envelopes.get(b.envelopeId)) || '',
        (b.debtId && debts.get(b.debtId)) || '',
      ]
    })
  return toCsv(
    [
      'Name',
      'Amount',
      'Currency',
      'Repeats',
      'First date',
      'Ends',
      'Next date',
      'Autopay',
      'Envelope',
      'Debt',
    ],
    rows,
  )
}

/**
 * A ready CSV File. The byte-order mark makes Excel read UTF-8 (€, accents) instead of
 * guessing a legacy code page; Numbers, Sheets and LibreOffice ignore it.
 */
export const csvFile = (name: string, text: string) =>
  new File([`\uFEFF${text}`], name, { type: 'text/csv' })

export const csvFileName = (what: 'transactions' | 'bills', today: ISODate) =>
  `steady-${what}-${today}.csv`

/**
 * Every envelope, fund and debt by id, deleted ones too: an old entry still names the
 * envelope or fund it went to (it keeps the link until the 30-day purge).
 */
export async function csvNames(): Promise<{
  envelopes: Envelope[]
  funds: SavingsFund[]
  debts: Debt[]
}> {
  const [envelopes, funds, debts] = await Promise.all([
    db.envelopes.toArray(),
    db.funds.toArray(),
    db.debts.toArray(),
  ])
  return { envelopes, funds, debts }
}

/** Built ahead of the tap, like the backup file (iOS share needs it ready). */
export async function prepareCsvFile(
  what: 'transactions' | 'bills',
  now: Date = new Date(),
): Promise<File> {
  const today = todayISO(now)
  const [settings, names] = await Promise.all([getSettings(), csvNames()])
  const ctx = { currency: settings.currency, decimals: settings.decimals, ...names }
  const text =
    what === 'transactions'
      ? transactionsToCsv(await listTransactions(), ctx)
      : billsToCsv(await listBills(), { ...ctx, today })
  return csvFile(csvFileName(what, today), text)
}
