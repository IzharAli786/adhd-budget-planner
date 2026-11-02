import { describe, expect, it } from 'vitest'
import { buildReport, type ReportInput } from '../../../domain/report'
import type { Transaction } from '../../../domain/types'
import { isWinAnsi, pdfMoney, renderReportFile, renderReportPdf, toWinAnsi } from '../reportPdf'

const input = (transactions: Transaction[], extra: Partial<ReportInput> = {}): ReportInput => ({
  today: '2026-11-04',
  since: '2026-01-01',
  incomes: [
    {
      id: 'pay',
      name: 'Salary',
      amount: 210000,
      schedule: { kind: 'monthly', day: 'last' },
      weekendRule: 'before',
      primary: true,
      active: true,
    },
  ],
  paydayOverrides: [],
  bills: [
    {
      id: 'rent',
      name: 'Rent',
      amount: 90000,
      rule: { freq: 'monthly', interval: 1, day: 1, anchor: '2026-01-01' },
      autopay: true,
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  ],
  occurrences: [
    {
      id: 'rent|2026-10-01',
      billId: 'rent',
      originalDate: '2026-10-01',
      status: 'paid',
      paidAt: 'x',
    },
  ],
  transactions,
  checkIns: [{ at: '2026-10-02T09:00:00.000Z', date: '2026-10-02', balance: 123456 }],
  envelopes: [],
  envelopesEnabled: false,
  funds: [],
  debts: [],
  notes: [{ id: 'day|2026-10-05', date: '2026-10-05', text: 'Dentist on Tuesday', updatedAt: 'x' }],
  noSpend: [{ date: '2026-10-09' }],
  impulse: [],
  lifeGoals: [],
  currency: 'EUR',
  decimals: 2,
  locale: 'en-IE',
  generatedOn: '2026-11-04',
  ...extra,
})

const tx = (i: number, date: string, amount: number, note: string): Transaction => ({
  id: `t${i}`,
  date,
  amount,
  note,
  createdAt: `${date}T10:00:00.000Z`,
})

// The WHATWG 'latin1' label IS Windows-1252 (WinAnsi), so text reads back as written.
const text = async (blob: Blob) => new TextDecoder('latin1').decode(await blob.arrayBuffer())
// "/Type /Page" but not "/Type /Pages".
const pageCount = (pdf: string) => pdf.match(/\/Type \/Page(?!s)/g)?.length ?? 0

describe('pdfMoney', () => {
  it.each([
    ['EUR', 'en-IE', 2, 123450, '€1,234.50'],
    ['GBP', 'en-GB', 2, -500, '-£5.00'],
    ['JPY', 'ja-JP', 0, 1234, '￥1,234'],
    ['USD', 'en-US', 2, 99, '$0.99'],
    ['INR', 'en-IN', 2, 123450, 'INR 1,234.50'],
    ['KRW', 'ko-KR', 0, 5000, 'KRW 5,000'],
    ['TRY', 'tr-TR', 2, -123450, '-TRY 1.234,50'],
  ])('%s in %s', (currency, locale, decimals, cents, expected) => {
    const out = pdfMoney(cents, currency, locale, decimals)
    expect(isWinAnsi(out)).toBe(true)
    if (currency === 'JPY') {
      // Japan's full-width yen is not WinAnsi; the code goes in front instead.
      expect(out).toMatch(/^(¥1,234|JPY 1,234)$/)
    } else expect(out).toBe(expected)
  })

  it('keeps the symbol when it prints and falls back to the code when it does not', () => {
    // Polish złoty: "ł" is outside WinAnsi.
    expect(pdfMoney(123450, 'PLN', 'pl-PL', 2)).toMatch(/^PLN 1[\s\u00a0.]?234,50$/)
    // French spacing (narrow no-break space) becomes a plain no-break space.
    expect(pdfMoney(123450, 'EUR', 'fr-FR', 2)).toBe('1\u00a0234,50\u00a0€')
  })

  it('never lets a character Helvetica cannot draw through', () => {
    expect(toWinAnsi('Café – “ok” 🍕 ₹')).toBe('Café – “ok” ? ?')
    expect(isWinAnsi(toWinAnsi('Ünïcödé ąę'))).toBe(true)
  })
})

describe('renderReportPdf', () => {
  it('draws a PDF with the summary, the transactions and the footer', async () => {
    const report = buildReport(
      input([tx(1, '2026-10-03', -4500, 'Groceries at Lidl'), tx(2, '2026-10-21', 1500, 'Refund')]),
      '2026-10-01',
      '2026-10-31',
    )
    const pdf = await text(await renderReportPdf(report, { compress: false }))
    expect(pdf.startsWith('%PDF')).toBe(true)
    for (const s of [
      'Steady Payday Planner',
      'Money in',
      'Left over',
      'Groceries at Lidl',
      'Rent',
      'Dentist on Tuesday',
      'No-spend days',
      'Not financial advice',
    ])
      expect(pdf).toContain(s)
    expect(pdf).toMatch(/Page 1 of \d/)
    expect(pdf).toContain('€1,234.56') // byte 0x80 in the file
  })

  it('spreads thousands of entries over many pages', async () => {
    const many = Array.from({ length: 2000 }, (_, i) =>
      tx(
        i,
        `2026-${String(1 + (i % 10)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`,
        -(100 + i),
        `Entry ${i}`,
      ),
    )
    const report = buildReport(input(many), '2026-01-01', '2026-10-31')
    const blob = await renderReportPdf(report, { compress: false })
    const pdf = await text(blob)
    expect(pageCount(pdf)).toBeGreaterThan(20)
    expect(pdf).toContain('Entry 1999')
    expect(pdf).toMatch(/Page \d+ of \d+/)
  }, 30_000)

  it('still makes a PDF for an empty range, saying there is nothing in it', async () => {
    const report = buildReport(input([]), '2025-01-01', '2025-01-31')
    expect(report.isEmpty).toBe(true)
    const file = await renderReportFile(report, { compress: false })
    expect(file.name).toBe('steady-report-2025-01-01_to_2025-01-31.pdf')
    expect(file.type).toBe('application/pdf')
    const pdf = await text(file)
    expect(pdf.startsWith('%PDF')).toBe(true)
    expect(pdf).toContain('Nothing was logged between these dates')
  })

  it('prints £ and the punctuation WinAnsi has as themselves, not as codes', async () => {
    const report = buildReport(
      input([tx(1, '2026-10-03', -4500, 'Café “brunch”')], { currency: 'GBP', locale: 'en-GB' }),
      '2026-10-01',
      '2026-10-31',
    )
    const pdf = await text(await renderReportPdf(report, { compress: false }))
    expect(pdf).toContain('£45.00')
    expect(pdf).not.toContain('GBP ')
    expect(pdf).toContain('Café “brunch”')
    expect(pdf).toContain('Steady Payday Planner — Report')
    expect(pdf).toContain('1 October 2026 – 31 October 2026')
  })

  it.each([
    ['KRW', 'ko-KR', 0, /KRW 4,500/],
    ['PLN', 'pl-PL', 2, /PLN 45,00/],
    // Kuwaiti dinar: three decimals, and its code is what Intl prints anyway.
    ['KWD', 'en-KW', 3, /KWD[ \u00a0]4\.500/],
  ])('prints %s amounts with the right digits', async (currency, locale, decimals, expected) => {
    const report = buildReport(
      input([tx(1, '2026-10-03', -4500, 'Lunch')], { currency, locale, decimals }),
      '2026-10-01',
      '2026-10-31',
    )
    const pdf = await text(await renderReportPdf(report, { compress: false }))
    expect(pdf).toMatch(expected)
    expect(pdf).not.toMatch(/[₩₹ł₺]/)
  })

  it('prints rupees with the code, not a broken glyph', async () => {
    const report = buildReport(
      input([tx(1, '2026-10-03', -4500, 'Chai')], { currency: 'INR', locale: 'en-IN' }),
      '2026-10-01',
      '2026-10-31',
    )
    const pdf = await text(await renderReportPdf(report, { compress: false }))
    expect(pdf).toContain('INR 45.00')
  })
})
