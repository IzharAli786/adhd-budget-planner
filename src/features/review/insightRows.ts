import { ENVELOPE_COLORS, isPaletteColor } from '../../domain/categories'
import {
  spendByCategory,
  spendByEnvelope,
  spendOutsideEnvelopes,
  type CategoryId,
  type DateRange,
} from '../../domain/insights'
import type { Cents } from '../../domain/money'
import { envelopeColor } from '../../ui/EnvelopeDot'
import type { ReviewData } from './useReviewData'

export interface InsightRow {
  key: string
  name: string
  /** null where nothing was planned up front (everyday spending with envelopes off). */
  planned: Cents | null
  actual: Cents
  /** The row's CSS colour: an envelope's own (as in the envelope list), else a series one. */
  color: string
}

/** Series colours from app.css, in order; the sixth repeats after that (topCategories caps it). */
export const seriesColor = (i: number) => `var(--chart-${(i % 6) + 1})`

// Kinds keep one colour each, whatever their rank, so "Bills" is the same colour on Plan,
// in Look back and from one period to the next.
const KIND_SERIES: Record<CategoryId, number> = { everyday: 0, bills: 1, savings: 2, debt: 3 }

/**
 * The rows the Insights charts and the printed category table show: envelopes when they
 * are on (plus bills outside any envelope and debt payments), else four plain groups
 * (everyday spending, bills, savings, debt). `periods` scales the per-payday plans for a
 * longer range (a year), where envelope budgets would mislead.
 */
export function insightRows(data: ReviewData, range: DateRange, periods = 1): InsightRow[] {
  const { transactions, occurrences, bills } = data
  if (data.envelopesEnabled && data.envelopes.length > 0) {
    const live = data.envelopes.filter((e) => e.deletedAt === undefined)
    const colorOf = new Map(live.map((e) => [e.id, e.color]))
    // Bills and Debt sit beside the envelopes: a palette colour no envelope uses keeps
    // them apart. With every one taken, plain ink (text, muted: both 4.5:1 in
    // contrast.test.ts), since each series colour shares a hue with some envelope.
    const free = ENVELOPE_COLORS.filter((c) => !live.some((e) => e.color === c))
    const kindColor = (id: CategoryId, i: number) =>
      free[i] ? envelopeColor(free[i]) : id === 'debt' ? 'var(--text)' : 'var(--muted)'
    const envelopeRows = spendByEnvelope(transactions, occurrences, bills, live, range).map(
      (r): InsightRow => ({
        key: r.envelopeId ?? 'unsorted',
        name: r.name,
        planned: periods === 1 && r.envelopeId !== null ? r.planned : null,
        actual: r.actual,
        // Every palette key is checked at 3:1 on every surface (contrast.test.ts) and the
        // accent at 4.5:1. A colour from elsewhere (an edited backup) falls back to a series one.
        color:
          r.envelopeId === null
            ? seriesColor(5)
            : chartSafe(colorOf.get(r.envelopeId))
              ? envelopeColor(colorOf.get(r.envelopeId))
              : seriesColor(KIND_SERIES.everyday),
      }),
    )
    const outside = spendOutsideEnvelopes(transactions, occurrences, bills, live, range)
      .filter((r) => r.actual > 0 || (r.planned ?? 0) > 0)
      .map((r, i): InsightRow => ({
        key: r.id,
        name: r.name,
        // "No budget yet" is an envelope's words; a kind with nothing planned shows no plan.
        planned: r.planned || null,
        actual: r.actual,
        color: kindColor(r.id, i),
      }))
    return [...envelopeRows, ...outside]
  }
  return spendByCategory(transactions, occurrences, bills, data.funds, range, periods).map((r) => ({
    key: r.id,
    name: r.name,
    planned: r.planned || null,
    actual: r.actual,
    color: seriesColor(KIND_SERIES[r.id]),
  }))
}

const chartSafe = (color: string | undefined) =>
  color === 'accent' || (color !== undefined && isPaletteColor(color))
