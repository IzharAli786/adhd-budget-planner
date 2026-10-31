import fc from 'fast-check'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Bill, Transaction } from '../../domain/types'
import {
  billsToCsv,
  csvFile,
  csvText,
  decimalAmount,
  prepareCsvFile,
  repeatText,
  toCsv,
  transactionsToCsv,
} from '../csv'
import { LATEST_ROWS } from './fixtures/v1'
import { clone, loadRows, resetDb } from './helpers'

/** A strict RFC 4180 reader, so the tests check what a spreadsheet would actually see. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"' && cell === '') quoted = true
    else if (c === ',') {
      row.push(cell)
      cell = ''
    } else if (c === '\r' && text[i + 1] === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
      i++
    } else cell += c
  }
  if (cell !== '' || row.length > 0) throw new Error('CSV must end with CRLF')
  return rows
}

describe('csvText', () => {
  it.each([
    ['coffee', 'coffee'],
    ['', ''],
    ['lunch, with Sam', '"lunch, with Sam"'],
    ['the "good" one', '"the ""good"" one"'],
    ['two\nlines', '"two\nlines"'],
    ['Café crème', 'Café crème'],
    // CSV injection: anything a spreadsheet would run as a formula becomes text.
    ['=HYPERLINK("http://x","click")', '"\'=HYPERLINK(""http://x"",""click"")"'],
    ['+1 555', "'+1 555"],
    ['-2+3', "'-2+3"],
    ['@SUM(A1)', "'@SUM(A1)"],
    ['\tcmd', "'\tcmd"],
    ['\r=1', '"\'\r=1"'],
    // Only the FIRST character matters.
    ['a=1', 'a=1'],
  ])('%j -> %j', (input, expected) => {
    expect(csvText(input)).toBe(expected)
  })

  it('round-trips any text through a real CSV reader, guarded where needed', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ unit: 'binary' }), { minLength: 1, maxLength: 6 }),
        (cells) => {
          const [parsed] = parseCsv(toCsv(cells, []))
          expect(parsed).toHaveLength(cells.length)
          parsed!.forEach((got, i) => {
            const want = cells[i]!
            expect(got).toBe(/^[=+\-@\t\r]/.test(want) ? `'${want}` : want)
            expect(/^[=+\-@\t\r]/.test(got)).toBe(false)
          })
        },
      ),
    )
  })
})

describe('decimalAmount', () => {
  it.each([
    [0, 2, '0.00'],
    [5, 2, '0.05'],
    [-1250, 2, '-12.50'],
    [123456, 2, '1234.56'],
    [1250, 0, '1250'],
    [-7, 3, '-0.007'],
    [Number.MAX_SAFE_INTEGER, 2, '90071992547409.91'],
  ])('%d with %d decimals -> %s', (cents, decimals, expected) => {
    expect(decimalAmount(cents, decimals)).toBe(expected)
  })

  it('reads back as the same number of minor units, for any amount and currency', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1e12, max: 1e12 }),
        fc.integer({ min: 0, max: 3 }),
        (cents, decimals) => {
          const text = decimalAmount(cents, decimals)
          expect(Math.round(Number(text) * 10 ** decimals)).toBe(cents)
          expect(text.split('.')[1]?.length ?? 0).toBe(decimals)
        },
      ),
    )
  })
})

const tx = (over: Partial<Transaction>): Transaction => ({
  id: 'x',
  date: '2026-10-31',
  amount: -100,
  note: '',
  createdAt: '2026-10-31T09:00:00.000Z',
  ...over,
})

describe('transactionsToCsv', () => {
  it('writes ISO dates, decimal amounts, the kind, envelope and note, oldest first', () => {
    const csv = transactionsToCsv(
      [
        tx({ id: 'b', date: '2026-10-30', amount: 150000, note: 'Salary' }),
        tx({ id: 'a', date: '2026-10-31', amount: -1250, note: '=cmd|calc', envelopeId: 'e1' }),
        tx({ id: 'c', date: '2026-10-29', amount: -2500, note: 'to fund', fundId: 'f1' }),
        tx({ id: 'd', date: '2026-10-29', amount: -4000, note: '', debtId: 'd1' }),
        tx({ id: 'gone', deletedAt: '2026-10-31T10:00:00.000Z' }),
      ],
      {
        currency: 'EUR',
        decimals: 2,
        envelopes: [{ id: 'e1', name: 'Eating out' }],
        funds: [{ id: 'f1', name: 'Holiday' }],
        debts: [{ id: 'd1', name: 'Card' }],
      },
    )
    expect(csv.endsWith('\r\n')).toBe(true)
    expect(parseCsv(csv)).toEqual([
      ['Date', 'Amount', 'Currency', 'Type', 'Envelope', 'Note'],
      ['2026-10-29', '-25.00', 'EUR', 'Savings: Holiday', '', 'to fund'],
      ['2026-10-29', '-40.00', 'EUR', 'Debt payment: Card', '', ''],
      ['2026-10-30', '1500.00', 'EUR', 'Money in', '', 'Salary'],
      ['2026-10-31', '-12.50', 'EUR', 'Spent', 'Eating out', "'=cmd|calc"],
    ])
  })

  it('uses the currency decimals (JPY has none)', () => {
    const csv = transactionsToCsv([tx({ amount: -1250 })], { currency: 'JPY', decimals: 0 })
    expect(parseCsv(csv)[1]).toEqual(['2026-10-31', '-1250', 'JPY', 'Spent', '', ''])
  })
})

describe('billsToCsv', () => {
  const bill = (over: Partial<Bill>): Bill => ({
    id: 'b',
    name: 'Rent',
    amount: 95000,
    rule: { freq: 'monthly', interval: 1, day: 1, anchor: '2026-01-01' },
    autopay: true,
    createdAt: '2026-01-01T09:00:00.000Z',
    ...over,
  })

  it.each([
    [{ freq: 'once', date: '2026-11-05' } as const, 'Once'],
    [{ freq: 'weekly', interval: 1, anchor: '2026-01-05' } as const, 'Every week'],
    [{ freq: 'weekly', interval: 2, anchor: '2026-01-05' } as const, 'Every 2 weeks'],
    [{ freq: 'monthly', interval: 1, day: 15, anchor: '2026-01-15' } as const, 'Monthly on day 15'],
    [
      { freq: 'monthly', interval: 3, day: 'last', anchor: '2026-01-31' } as const,
      'Every 3 months on the last day',
    ],
    [{ freq: 'yearly', month: 3, day: 4 } as const, 'Yearly on 03-04'],
  ])('describes %j as %s', (rule, text) => {
    expect(repeatText(rule)).toBe(text)
  })

  it('lists live bills by name with their dates, envelope and debt', () => {
    const csv = billsToCsv(
      [
        bill({ id: 'r', envelopeId: 'e1' }),
        bill({
          id: 'c',
          name: 'Card minimum',
          amount: 4000,
          autopay: false,
          rule: { freq: 'monthly', interval: 1, day: 20, anchor: '2026-01-20' },
          debtId: 'd1',
        }),
        bill({ id: 'g', name: 'Gym', until: '2026-10-01', deletedAt: '2026-10-02T00:00:00.000Z' }),
        bill({ id: 'o', name: 'Old', rule: { freq: 'once', date: '2026-01-02' } }),
      ],
      {
        currency: 'EUR',
        decimals: 2,
        today: '2026-10-31',
        envelopes: [{ id: 'e1', name: 'Rent & housing' }],
        debts: [{ id: 'd1', name: 'Card' }],
      },
    )
    expect(parseCsv(csv)).toEqual([
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
      [
        'Card minimum',
        '40.00',
        'EUR',
        'Monthly on day 20',
        '2026-01-20',
        '',
        '2026-11-20',
        'No',
        '',
        'Card',
      ],
      ['Old', '950.00', 'EUR', 'Once', '2026-01-02', '', '', 'Yes', '', ''],
      [
        'Rent',
        '950.00',
        'EUR',
        'Monthly on day 1',
        '2026-01-01',
        '',
        '2026-11-01',
        'Yes',
        'Rent & housing',
        '',
      ],
    ])
  })
})

describe('csv files', () => {
  beforeEach(resetDb)

  it('start with a BOM so Excel reads UTF-8', async () => {
    const file = csvFile('x.csv', 'Note\r\nCafé\r\n')
    expect(file.type).toBe('text/csv')
    const bytes = new Uint8Array(await file.arrayBuffer())
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
  })

  it('are built from the database with the stored currency and names', async () => {
    await loadRows(clone(LATEST_ROWS))
    const now = new Date(2026, 9, 31, 12)
    const txFile = await prepareCsvFile('transactions', now)
    expect(txFile.name).toBe('steady-transactions-2026-10-31.csv')
    const rows = parseCsv((await txFile.text()).replace(/^\uFEFF/, ''))
    expect(rows).toHaveLength(1 + LATEST_ROWS.transactions!.length)
    expect(rows[1]).toEqual(['2026-10-28', '-12.00', 'EUR', 'Spent', 'Everyday', 'coffee'])

    const billFile = await prepareCsvFile('bills', now)
    expect(billFile.name).toBe('steady-bills-2026-10-31.csv')
    // The deleted gym bill is left out.
    expect(parseCsv((await billFile.text()).replace(/^\uFEFF/, '')).map((r) => r[0])).toEqual([
      'Name',
      'Card minimum',
      'Rent',
    ])
  })
})
