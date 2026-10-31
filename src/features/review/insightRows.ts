import { spendByCategory, spendByEnvelope, type DateRange } from '../../domain/insights'
import type { Cents } from '../../domain/money'
import type { ReviewData } from './useReviewData'

export interface InsightRow {
  key: string
  name: string
  /** null where nothing was planned up front (everyday spending with envelopes off). */
  planned: Cents | null
  actual: Cents
}

/**
 * The rows the Insights charts and the printed category table show: envelopes when they
 * are on, else four plain groups (everyday, bills, savings, debt). `periods` scales the
 * per-payday plans for a longer range (a year), where envelope budgets would mislead.
 */
export function insightRows(data: ReviewData, range: DateRange, periods = 1): InsightRow[] {
  const { transactions, occurrences, bills } = data
  if (data.envelopesEnabled && data.envelopes.length > 0)
    return spendByEnvelope(transactions, occurrences, bills, data.envelopes, range).map((r) => ({
      key: r.envelopeId ?? 'unsorted',
      name: r.name,
      planned: periods === 1 && r.envelopeId !== null ? r.planned : null,
      actual: r.actual,
    }))
  return spendByCategory(transactions, occurrences, bills, data.funds, range, periods).map((r) => ({
    key: r.id,
    name: r.name,
    planned: r.planned,
    actual: r.actual,
  }))
}

/** Series colours from app.css, in order; the sixth repeats after that (topCategories caps it). */
export const seriesColor = (i: number) => `var(--chart-${(i % 6) + 1})`
