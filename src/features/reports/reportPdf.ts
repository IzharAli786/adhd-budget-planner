// The report as an A4 PDF, drawn with jsPDF + jspdf-autotable. Both libraries are loaded
// with import() the first time a PDF is made, so the app's main bundle doesn't carry them
// (the service worker still precaches the chunk, so it works offline).
//
// jsPDF's built-in fonts (Helvetica) only cover WinAnsi (Windows-1252). A "₹" or "zł"
// would print as garbage, so every string goes through toWinAnsi, and money that doesn't
// fit falls back to the ISO code ("INR 1,234.00"), which reads fine on paper.
import type { CellHookData, UserOptions } from 'jspdf-autotable'
import { dateTimeFormat, numberFormat } from '../../domain/intl'
import { formatMoney, type Cents } from '../../domain/money'
import { reportFileName, type Report, type ReportBill } from '../../domain/report'
import type { ISODate } from '../../domain/types'

// --- Text that Helvetica can print ------------------------------------------------------

// The 27 characters Windows-1252 puts in 0x80-0x9F; the rest of WinAnsi is Latin-1.
const CP1252_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ')

const isWinAnsiChar = (ch: string) => {
  const c = ch.codePointAt(0)!
  return c === 0x0a || (c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || CP1252_EXTRA.has(ch)
}

export const isWinAnsi = (text: string) => [...text].every(isWinAnsiChar)

// Narrow and thin spaces (French "1 234,50 €") print as a no-break space, the minus
// sign as a hyphen; bidi marks are dropped. Escapes, so the source stays plain ASCII.
const tidy = (text: string) =>
  text
    .replace(/[\u202F\u2009\u2007]/g, '\u00A0')
    .replace(/\u2212/g, '-')
    .replace(/[\u200E\u200F\u061C]/g, '')

/**
 * The closest WinAnsi version of a string: accents that compose are kept, and anything
 * else becomes "?" rather than a broken glyph.
 */
export function toWinAnsi(text: string): string {
  return [...tidy(text.normalize('NFC'))]
    .map((ch) => (isWinAnsiChar(ch) ? ch : ch === '\t' || ch === '\r' ? ' ' : '?'))
    .join('')
}

/**
 * Money as the app shows it ("€1,234.50"), or with the ISO code when the symbol is not
 * in WinAnsi ("INR 1,234.50", "-PLN 12.00"). Digits from a script Helvetica lacks fall
 * back to plain Western digits.
 */
export function pdfMoney(cents: Cents, currency: string, locale: string, decimals: number) {
  const shown = toWinAnsiStrict(formatMoney(cents, currency, locale, decimals))
  if (shown !== null) return shown
  const opts = { minimumFractionDigits: decimals, maximumFractionDigits: decimals }
  const abs = Math.abs(cents) / 10 ** decimals
  const number =
    toWinAnsiStrict(numberFormat(locale, opts).format(abs)) ?? numberFormat('en', opts).format(abs)
  return `${cents < 0 ? '-' : ''}${currency} ${number}`
}

/** The WinAnsi form if nothing would be lost on the way, else null. */
function toWinAnsiStrict(text: string): string | null {
  const out = tidy(text)
  return isWinAnsi(out) ? out : null
}

// --- Look -------------------------------------------------------------------------------

type RGB = [number, number, number]
const INK: RGB = [43, 38, 34]
const MUTED: RGB = [107, 99, 92]
const ACCENT: RGB = [178, 90, 53]
const LINE: RGB = [228, 221, 212]
const PAPER: RGB = [250, 247, 242]
const ZEBRA: RGB = [248, 245, 240]

// The light-mode values from app.css (--env-* and --chart-*), so a category is the same
// colour on paper as on screen.
const SWATCH: Record<string, RGB> = {
  clay: [178, 90, 53],
  sage: [79, 125, 91],
  ocean: [58, 111, 147],
  sand: [143, 107, 42],
  rose: [176, 74, 104],
  plum: [125, 83, 148],
  teal: [47, 125, 120],
  slate: [90, 102, 120],
  olive: [108, 117, 49],
  amber: [168, 97, 26],
  accent: ACCENT,
  'chart-1': [61, 110, 143],
  'chart-2': [134, 85, 143],
  'chart-3': [76, 122, 79],
  'chart-4': [163, 90, 53],
  'chart-5': [122, 101, 36],
  'chart-6': [91, 101, 115],
}

const PAGE_W = 595.28
const PAGE_H = 841.89
const M = 48 // side margin
const TOP = 56
const BOTTOM = 64 // room for the footer
const CONTENT_W = PAGE_W - 2 * M

const FOOTER = 'Estimates from what you entered. Not financial advice.'

export interface PdfOptions {
  /** Compress the content streams (default true; the tests read the text, so they turn it off). */
  compress?: boolean
}

/** Gives the browser a frame to paint ("Making your report…") before heavy work. */
const yieldToUi = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

export async function renderReportPdf(report: Report, options: PdfOptions = {}): Promise<Blob> {
  await yieldToUi()
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF({
    unit: 'pt',
    format: 'a4',
    orientation: 'portrait',
    compress: options.compress ?? true,
  })
  const { meta } = report
  const money = (c: Cents) => pdfMoney(c, meta.currency, meta.locale, meta.decimals)
  const dateLong = dateFormatter(meta.locale, { day: 'numeric', month: 'long', year: 'numeric' })
  const dateShort = dateFormatter(meta.locale, { day: 'numeric', month: 'short', year: 'numeric' })
  const t = (s: string) => toWinAnsi(s)

  doc.setProperties({
    title: `Steady report ${meta.from} to ${meta.to}`,
    subject: 'Money in and out between two dates',
    creator: 'Steady Payday Planner',
  })
  doc.setFont('helvetica', 'normal')
  doc.setLineHeightFactor(1.3)

  let y = TOP
  const color = (rgb: RGB) => doc.setTextColor(rgb[0], rgb[1], rgb[2])
  const fill = (rgb: RGB) => doc.setFillColor(rgb[0], rgb[1], rgb[2])
  const stroke = (rgb: RGB) => doc.setDrawColor(rgb[0], rgb[1], rgb[2])
  const newPage = () => {
    doc.addPage()
    y = TOP
  }
  const room = (needed: number) => {
    if (y + needed > PAGE_H - BOTTOM) newPage()
  }

  // --- Header ---
  fill(ACCENT)
  doc.rect(M, y - 14, 4, 40, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  color(ACCENT)
  doc.text('Steady Payday Planner — Report', M + 14, y - 2)
  doc.setFontSize(20)
  color(INK)
  doc.text(t(`${dateLong(meta.from)} – ${dateLong(meta.to)}`), M + 14, y + 22)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  color(MUTED)
  const made = `${meta.days} ${meta.days === 1 ? 'day' : 'days'} · Made on ${dateLong(meta.generatedOn)}`
  doc.text(t(meta.displayName ? `For ${meta.displayName} · ${made}` : made), M + 14, y + 40)
  y += 64

  // --- Summary: a two-column key/value grid ---
  const s = report.summary
  const balance = (p: Report['summary']['startBalance'], none: string) =>
    p ? [money(p.balance), `check-in on ${dateShort(p.date)}`] : ['—', none]
  const cells: [string, string, string?][] = [
    ['Money in', money(s.moneyIn), 'Paydays and other money in'],
    ['Money out', money(s.moneyOut), 'Spending, bills and debt payments'],
    ['Everyday spending', money(s.spending)],
    ['Bills paid', money(s.billsPaid), 'Debt minimums are under debt paid'],
    ['Debt paid', money(s.debtPaid)],
    ['Saved to funds', money(s.savedToFunds)],
    ['Taken from funds', money(s.takenFromFunds)],
    [
      s.leftOver >= 0 ? 'Left over' : 'More out than in',
      money(Math.abs(s.leftOver)),
      'Money in, minus out and savings',
    ],
    [
      'Balance at the start',
      ...(balance(s.startBalance, 'No check-in by then') as [string, string]),
    ],
    ['Balance at the end', ...(balance(s.endBalance, 'No check-in by then') as [string, string])],
  ]
  const ROW_H = 48
  const colW = CONTENT_W / 2
  const gridH = Math.ceil(cells.length / 2) * ROW_H + 12
  fill(PAPER)
  stroke(LINE)
  doc.setLineWidth(0.6)
  doc.roundedRect(M, y, CONTENT_W, gridH, 8, 8, 'FD')
  cells.forEach(([label, value, hint], i) => {
    const x = M + 16 + (i % 2) * colW
    const top = y + 22 + Math.floor(i / 2) * ROW_H
    doc.setFontSize(9)
    color(MUTED)
    doc.text(t(label), x, top - 4)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    color(INK)
    doc.text(t(value), x, top + 11)
    doc.setFont('helvetica', 'normal')
    if (hint) {
      doc.setFontSize(8)
      color(MUTED)
      doc.text(t(hint), x, top + 23)
    }
  })
  y += gridH + 10

  if (report.isEmpty) {
    room(40)
    doc.setFontSize(11)
    color(MUTED)
    doc.text(
      'Nothing was logged between these dates, so every number above is zero. As you log spending, mark bills paid and check in, reports fill in.',
      M,
      y + 14,
      { maxWidth: CONTENT_W },
    )
    y += 50
  }

  // --- Shared table look ---
  const lastY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY
  const table = (opts: UserOptions) => {
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M, top: TOP, bottom: BOTTOM },
      theme: 'plain',
      styles: {
        font: 'helvetica',
        fontSize: 9,
        textColor: INK,
        cellPadding: { top: 5, bottom: 5, left: 6, right: 6 },
        overflow: 'linebreak',
        lineColor: LINE,
      },
      headStyles: {
        fontStyle: 'bold',
        textColor: MUTED,
        fontSize: 8.5,
        lineWidth: { bottom: 0.8 },
        lineColor: LINE,
      },
      footStyles: { fontStyle: 'bold', lineWidth: { top: 0.8 }, lineColor: LINE },
      alternateRowStyles: { fillColor: ZEBRA },
      showHead: 'everyPage',
      // Header and total cells line up with their column (amounts on the right).
      didParseCell: (d: CellHookData) => {
        const halign = opts.columnStyles?.[d.column.index]?.halign
        if (d.section !== 'body' && halign) d.cell.styles.halign = halign
      },
      ...opts,
    })
    y = lastY() + 18
  }
  const heading = (title: string, sub?: string) => {
    // Keep a heading with at least a couple of rows under it.
    room(sub ? 84 : 70)
    y += 8
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    color(INK)
    doc.text(t(title), M, y)
    doc.setFont('helvetica', 'normal')
    y += 8
    if (sub) {
      doc.setFontSize(9)
      color(MUTED)
      const lines = doc.splitTextToSize(t(sub), CONTENT_W) as string[]
      doc.text(lines, M, y + 8)
      y += 8 + lines.length * 12
    }
    y += 6
  }
  const line = (text: string) => {
    room(24)
    doc.setFontSize(10)
    color(MUTED)
    const lines = doc.splitTextToSize(t(text), CONTENT_W) as string[]
    doc.text(lines, M, y + 4)
    y += 4 + lines.length * 13 + 10
  }
  const right = { halign: 'right' as const }

  // --- Where the money went: a table with a bar per row ---
  if (report.byCategory.length > 0) {
    heading(
      'Where the money went',
      report.categoryMode === 'envelope'
        ? 'By envelope, with bills outside any envelope and debt payments.'
        : 'Everyday spending, bills, savings and debt payments.',
    )
    const max = Math.max(...report.byCategory.map((r) => r.amount))
    const BAR_COL = 1
    table({
      head: [['Category', '', 'Amount', 'Share']],
      body: report.byCategory.map((r) => [t(r.name), '', money(r.amount), `${r.share}%`]),
      columnStyles: {
        0: { cellWidth: 150 },
        1: { cellWidth: 'auto' },
        2: right,
        3: { ...right, cellWidth: 48 },
      },
      didDrawCell: (d: CellHookData) => {
        if (d.section !== 'body' || d.column.index !== BAR_COL) return
        const row = report.byCategory[d.row.index]
        if (!row) return
        const w = Math.max(2, ((d.cell.width - 12) * row.amount) / max)
        fill(SWATCH[row.colorToken ?? 'accent'] ?? ACCENT)
        doc.roundedRect(d.cell.x + 6, d.cell.y + d.cell.height / 2 - 4, w, 8, 2, 2, 'F')
      },
    })
  }

  // --- Money in: the paydays counted ---
  if (report.paydays.length > 0) {
    heading(
      'Paydays',
      'Pay counted as money in: paydays already past, from when you started using Steady.',
    )
    table({
      head: [['Date', 'Income', 'Amount']],
      body: report.paydays.map((p) => [dateShort(p.date), t(p.name), money(p.amount)]),
      columnStyles: { 0: { cellWidth: 100 }, 2: right },
    })
  }

  // --- Bills ---
  const { bills } = report
  if (bills.paid.length + bills.skipped.length + bills.dueUnpaid.length > 0) {
    heading('Bills')
    const billRows = (rows: ReportBill[]) =>
      rows.map((b) => [
        dateShort(b.date),
        t(b.name + (b.debt ? ` (${b.debt})` : '')),
        t([b.autopay ? 'Autopay' : '', b.envelope ?? ''].filter(Boolean).join(' · ')),
        money(b.amount),
      ])
    const group = (title: string, rows: ReportBill[], total: Cents) => {
      if (rows.length === 0) return
      room(60)
      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      color(MUTED)
      doc.text(t(title), M, y + 4)
      doc.setFont('helvetica', 'normal')
      y += 10
      table({
        head: [['Date', 'Bill', '', 'Amount']],
        body: billRows(rows),
        foot: [['', 'Total', '', money(total)]],
        showFoot: 'lastPage',
        columnStyles: { 0: { cellWidth: 100 }, 3: right },
      })
    }
    group('Paid', bills.paid, bills.totals.paid)
    group('Skipped', bills.skipped, bills.totals.skipped)
    group('Still due', bills.dueUnpaid, bills.totals.dueUnpaid)
    if (bills.paid.some((b) => b.debt))
      line('A debt’s minimum paid as a bill counts once, under debt paid in the summary.')
  }

  // --- Every transaction ---
  heading(
    'All transactions',
    report.transactions.length > 0
      ? `${report.transactions.length} ${report.transactions.length === 1 ? 'entry' : 'entries'}, oldest first. An entry that paid a bill is counted once, with the bill.`
      : undefined,
  )
  if (report.transactions.length === 0) line('Nothing logged in this period.')
  else {
    // Thousands of rows are fine for autoTable, but give the screen a frame first.
    await yieldToUi()
    table({
      head: [['Date', 'Type', 'Category', 'Note', 'Amount']],
      body: report.transactions.map((x) => [
        dateShort(x.date),
        x.kind,
        t(x.category),
        t(x.note),
        (x.amount > 0 ? '+' : '') + money(x.amount),
      ]),
      columnStyles: {
        0: { cellWidth: 72 },
        1: { cellWidth: 78 },
        2: { cellWidth: 96 },
        4: { ...right, cellWidth: 84 },
      },
    })
  }

  // --- Savings funds ---
  if (report.funds.length > 0) {
    heading('Savings funds')
    table({
      head: [['Fund', 'Moved in', 'Taken out', 'Saved by the end', 'Target']],
      body: report.funds.map((f) => [
        t(f.name),
        money(f.movedIn),
        money(f.movedOut),
        money(f.savedAtEnd),
        f.target !== undefined ? `${money(f.target)} (${f.percent ?? 0}%)` : '—',
      ]),
      columnStyles: { 1: right, 2: right, 3: right, 4: right },
    })
  }

  // --- Debts ---
  if (report.debts.length > 0) {
    heading('Debts', 'Owed now is today’s balance, not the balance on the last day of the report.')
    table({
      head: [['Debt', 'Paid in this period', 'Owed now', 'APR', 'Minimum']],
      body: report.debts.map((d) => [
        t(d.name),
        money(d.paidInRange),
        money(d.balanceNow),
        `${numberFormat('en', { maximumFractionDigits: 2 }).format(d.aprPercent)}%`,
        money(d.minimum),
      ]),
      columnStyles: { 1: right, 2: right, 3: right, 4: right },
    })
  }

  // --- Check-ins ---
  if (report.checkIns.length > 0) {
    heading('Balance check-ins')
    table({
      head: [['Date', 'Balance']],
      body: report.checkIns.map((c) => [dateShort(c.date), money(c.balance)]),
      columnStyles: { 0: { cellWidth: 140 }, 1: right },
      tableWidth: 300,
    })
  }

  // --- Notes ---
  if (report.notes.length > 0) {
    heading('Notes')
    table({
      head: [['When', 'Note']],
      body: report.notes.map((n) => [
        n.kind === 'day' ? dateShort(n.date) : `Pay period from ${dateShort(n.date)}`,
        t(n.text),
      ]),
      columnStyles: { 0: { cellWidth: 140 } },
    })
  }

  // --- No-spend days ---
  if (report.noSpendDays.count > 0) {
    heading('No-spend days')
    const n = report.noSpendDays.count
    line(
      `${n} ${n === 1 ? 'day' : 'days'} with nothing spent: ${report.noSpendDays.dates.map(dateShort).join(', ')}.`,
    )
  }

  // --- 48-hour list ---
  if (report.impulse.items.length > 0) {
    const im = report.impulse
    heading(
      '48-hour list',
      `${im.skippedCount} let go (${money(im.skippedTotal)} saved by waiting), ${im.boughtCount} bought.`,
    )
    table({
      head: [['Decided', 'Item', 'Decision', 'Amount']],
      body: im.items.map((i) => [
        dateShort(i.date),
        t(i.name),
        i.decision === 'skipped' ? 'Let go' : 'Bought',
        money(i.amount),
      ]),
      columnStyles: { 0: { cellWidth: 100 }, 3: right },
    })
  }

  // --- Life goals ---
  if (report.lifeGoalsDone.length > 0) {
    heading('Life goals done')
    table({
      head: [['Done', 'Goal', 'Why']],
      body: report.lifeGoalsDone.map((g) => [dateShort(g.date), t(g.title), t(g.why ?? '')]),
      columnStyles: { 0: { cellWidth: 100 }, 1: { cellWidth: 160 } },
    })
  }

  // --- Footer on every page ---
  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    stroke(LINE)
    doc.setLineWidth(0.6)
    doc.line(M, PAGE_H - 40, PAGE_W - M, PAGE_H - 40)
    doc.setFontSize(8)
    color(MUTED)
    doc.text(`Page ${p} of ${pages} · ${FOOTER}`, M, PAGE_H - 26)
  }

  return new Blob([doc.output('arraybuffer')], { type: 'application/pdf' })
}

/** A ready File for share or download, named after the range. */
export async function renderReportFile(report: Report, options?: PdfOptions): Promise<File> {
  const blob = await renderReportPdf(report, options)
  return new File([blob], reportFileName(report.meta.from, report.meta.to), {
    type: 'application/pdf',
  })
}

/** Dates in the user's locale, or ISO when that locale's script isn't in WinAnsi. */
function dateFormatter(locale: string, options: Intl.DateTimeFormatOptions) {
  const fmt = dateTimeFormat(locale, { ...options, timeZone: 'UTC' })
  return (date: ISODate) => {
    const text = toWinAnsiStrict(fmt.format(new Date(`${date}T00:00:00Z`)))
    return text ?? date
  }
}
