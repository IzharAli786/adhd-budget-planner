import { describe, expect, it } from 'vitest'
import { buildDemoData } from '../../../db/seed/demo'
import { addDays } from '../../../domain/dates'
import { spendByEnvelope, spendOutsideEnvelopes } from '../../../domain/insights'
import { buildReport, type ReportInput } from '../../../domain/report'
import { payPeriodRanges, periodSummaries } from '../../../domain/review'
import type { Transaction } from '../../../domain/types'
import { renderReportPdf } from '../reportPdf'

// The demo household: nine months of paydays, bills, envelopes, savings and a debt.
const today = '2026-11-02'
const demo = buildDemoData(today, new Date(2026, 10, 2, 12))
const input = (extra: Partial<ReportInput> = {}): ReportInput => ({
  today,
  incomes: demo.incomes,
  paydayOverrides: [],
  bills: demo.bills,
  occurrences: demo.billOccurrences,
  transactions: demo.transactions,
  checkIns: demo.checkIns,
  envelopes: demo.envelopes,
  envelopesEnabled: true,
  funds: demo.funds,
  debts: demo.debts,
  notes: demo.notes,
  noSpend: demo.noSpend,
  impulse: demo.impulse,
  lifeGoals: demo.lifeGoals,
  currency: 'EUR',
  decimals: 2,
  locale: 'en-IE',
  generatedOn: today,
  ...extra,
})
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
const lastDay = (end: string) => addDays(end, -1)

describe('a report agrees with Look back and Insights (demo data)', () => {
  const data = input()
  const months = periodSummaries(2026, 'month', data)

  it('has months to compare', () => expect(months.length).toBeGreaterThan(6))

  it.each(months.map((m) => [m.start, m] as const))('month from %s', (_, m) => {
    const r = buildReport(data, m.start, lastDay(m.end))
    expect(r.summary.moneyIn).toBe(m.incomeIn)
    expect(r.summary.moneyOut).toBe(m.moneyOut)
    expect(r.summary.spending).toBe(m.spending)
    expect(r.summary.billsPaid).toBe(m.billsPaid)
    expect(r.summary.debtPaid).toBe(m.debtPaid)
    expect(r.summary.savedToFunds - r.summary.takenFromFunds).toBe(m.saved)
    expect(r.summary.leftOver).toBe(m.net)
    // The debt table adds up to the summary's debt paid.
    expect(sum(r.debts.map((d) => d.paidInRange))).toBe(r.summary.debtPaid)
    // Paid bills listed = bills paid + the debt minimums paid as bills.
    expect(sum(r.bills.paid.filter((b) => !b.debt).map((b) => b.amount))).toBe(m.billsPaid)
    // Where it went = Insights' envelope rows for the month, shares to 100.
    const insights = [
      ...spendByEnvelope(data.transactions, data.occurrences, data.bills, demo.envelopes, m),
      ...spendOutsideEnvelopes(data.transactions, data.occurrences, data.bills, demo.envelopes, m),
    ]
    expect(sum(r.byCategory.map((c) => c.amount))).toBe(
      sum(insights.map((i) => Math.max(0, i.actual))),
    )
    if (r.byCategory.length > 0) expect(sum(r.byCategory.map((c) => c.share))).toBe(100)
  })

  it('pay periods match Look back by pay period', () => {
    const periods = payPeriodRanges(data, { start: '2026-03-01', end: today })
    expect(periods.length).toBeGreaterThan(5)
    for (const p of periods) {
      const row = periodSummaries(p, 'payday', data)[0]!
      const r = buildReport(data, p.start, lastDay(p.end))
      expect([r.summary.moneyIn, r.summary.moneyOut, r.summary.leftOver]).toEqual([
        row.incomeIn,
        row.moneyOut,
        row.net,
      ])
    }
  })

  it('keeps a deleted debt that was paid in the range, so its table still adds up', () => {
    const gone = input({
      debts: demo.debts.map((d) => ({ ...d, deletedAt: `${today}T08:00:00Z` })),
    })
    const r = buildReport(gone, '2026-01-01', today)
    expect(r.summary.debtPaid).toBeGreaterThan(0)
    expect(r.debts.map((d) => d.name)).toEqual(demo.debts.map((d) => d.name))
    expect(sum(r.debts.map((d) => d.paidInRange))).toBe(r.summary.debtPaid)
    // A deleted debt with nothing paid in the range stays out.
    expect(buildReport(gone, '2020-01-01', '2020-01-31').debts).toEqual([])
  })

  it('makes a report and PDF of 5,000 more entries in reasonable time', async () => {
    const extra = Array.from({ length: 5000 }, (_, i): Transaction => ({
      id: `bulk${i}`,
      date: addDays('2025-11-03', i % 365),
      amount: -(100 + i),
      note: `Bulk ${i}`,
      envelopeId: demo.envelopes[i % demo.envelopes.length]!.id,
      createdAt: '2025-11-03T09:00:00.000Z',
    }))
    const big = input({ transactions: [...demo.transactions, ...extra] })
    let t = performance.now()
    const r = buildReport(big, '2025-11-03', today)
    expect(performance.now() - t).toBeLessThan(1000)
    expect(r.transactions.length).toBeGreaterThan(5000)
    t = performance.now()
    const blob = await renderReportPdf(r)
    expect(performance.now() - t).toBeLessThan(20_000)
    expect(blob.size).toBeGreaterThan(100_000)
  }, 60_000)
})
