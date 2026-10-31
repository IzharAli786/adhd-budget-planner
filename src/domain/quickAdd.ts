// Typed quick-add, v1 grammar (PLAN §4.4):
//
//   entry    = [sign] amount [currency] words* [tag] [when]
//            | words+ [sign] amount [currency] [tag] [when]
//   sign     = "+" | "-"          + is income, default is spend
//   amount   = digits [("." | ",") digit{1,2}]     no thousands separators
//   currency = "€" | "$" | "£" | ISO 4217 code
//   tag      = "@" word           prefix match on envelope names
//   when     = "today" | "yesterday"
//
// The grammar is deliberately small: every extra rule is another way "12 coffee" could
// be read wrong. Amounts go through money.parseAmount, so no float ever touches them.
import { isSupportedCurrency } from './currencies'
import { addDays } from './dates'
import { parseAmount, type Cents } from './money'
import type { Envelope, Id, ISODate, Transaction } from './types'

export type QuickAddKind = 'spend' | 'income'

export interface QuickAddEntry {
  ok: true
  /** Always positive; `kind` gives the direction. */
  amount: Cents
  kind: QuickAddKind
  note: string
  envelopeId?: Id
  date: ISODate
  /** The @tag as typed, when it matched no envelope (so the preview can say so). */
  unknownTag?: string
  currency?: string
}

export type QuickAddError = 'empty' | 'no_amount' | 'too_many_decimals' | 'too_large' | 'zero'

export type QuickAddResult = QuickAddEntry | { ok: false; reason: QuickAddError }

export interface QuickAddContext {
  envelopes?: readonly Pick<Envelope, 'id' | 'name' | 'sort' | 'deletedAt'>[]
  today: ISODate
  decimals?: number
}

const SYMBOLS = new Set(['€', '$', '£'])
// Sign, optional leading symbol, digits with any decimal tail, optional trailing symbol.
// A token like "1.250" matches here and is THEN rejected for its decimals, so the user
// is asked instead of us guessing between "1250" and "1.25".
const AMOUNT_RE = /^([+-])?([€$£])?(\d+(?:[.,]\d+)?)([€$£])?$/

const isCurrency = (token: string) =>
  SYMBOLS.has(token) || (/^[a-z]{3}$/i.test(token) && isSupportedCurrency(token.toUpperCase()))

function whenOf(token: string, today: ISODate): ISODate | null {
  const lower = token.toLowerCase()
  return lower === 'today' ? today : lower === 'yesterday' ? addDays(today, -1) : null
}

export function parseQuickAdd(text: string, ctx: QuickAddContext): QuickAddResult {
  const tokens = text.trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return { ok: false, reason: 'empty' }

  // First form: the amount leads. Second form: words first, the amount is the first
  // amount-looking token after them.
  const at = tokens.findIndex((t) => AMOUNT_RE.test(t))
  if (at === -1) return { ok: false, reason: 'no_amount' }
  const match = AMOUNT_RE.exec(tokens[at]!)!
  const [, ownSign, pre, digits = '', post] = match
  const amount = parseAmount(digits, ctx.decimals ?? 2)
  if (amount === null) {
    const frac = /[.,](\d+)$/.exec(digits)?.[1] ?? ''
    return {
      ok: false,
      reason: frac.length > (ctx.decimals ?? 2) ? 'too_many_decimals' : 'too_large',
    }
  }
  if (amount === 0) return { ok: false, reason: 'zero' }

  // People put a space after the sign or symbol ("+ 1500 salary", "€ 12 coffee"). Read
  // those as part of the amount; left in the note, "+ 1500" would log as SPENDING.
  const words: string[] = tokens.slice(0, at)
  let currency = pre ?? post
  if (currency === undefined && words.length > 0 && SYMBOLS.has(words.at(-1)!)) {
    currency = words.pop()!
  }
  let sign = ownSign
  if (sign === undefined && (words.at(-1) === '+' || words.at(-1) === '-')) sign = words.pop()
  const rest = tokens.slice(at + 1)
  if (currency === undefined && rest[0] !== undefined && isCurrency(rest[0])) {
    currency = rest.shift()!
  }

  let date = ctx.today
  let tag: string | undefined
  const note: string[] = []
  // "today"/"yesterday" count wherever they are ("yesterday 4.99 netflix" too), but as
  // exact words only: "y" or "yday" stay part of the note.
  for (const token of words) {
    const when = whenOf(token, ctx.today)
    if (when !== null) date = when
    else note.push(token)
  }
  for (const token of rest) {
    const when = whenOf(token, ctx.today)
    if (when !== null) date = when
    else if (token.length > 1 && token.startsWith('@') && tag === undefined) tag = token.slice(1)
    else note.push(token)
  }

  const entry: QuickAddEntry = {
    ok: true,
    amount,
    kind: sign === '+' ? 'income' : 'spend',
    note: note.join(' '),
    date,
  }
  if (currency !== undefined)
    entry.currency = currency.length === 3 ? currency.toUpperCase() : currency
  if (tag !== undefined) {
    const envelope = matchEnvelope(tag, ctx.envelopes ?? [])
    if (envelope) entry.envelopeId = envelope.id
    else entry.unknownTag = tag
  }
  return entry
}

/** Case-insensitive prefix match; the first envelope in the user's order wins a tie. */
export function matchEnvelope<E extends Pick<Envelope, 'name' | 'sort' | 'deletedAt'>>(
  tag: string,
  envelopes: readonly E[],
): E | undefined {
  const t = tag.toLowerCase()
  return envelopes
    .filter((e) => e.deletedAt === undefined && e.name.toLowerCase().startsWith(t))
    .sort((a, b) => a.sort - b.sort)[0]
}

/** The signed amount a parsed entry stores: spending is negative. */
export const signedAmount = (e: Pick<QuickAddEntry, 'amount' | 'kind'>): Cents =>
  e.kind === 'spend' ? -e.amount : e.amount

const normalize = (note: string) => note.trim().toLowerCase().replace(/\s+/g, ' ')

/**
 * The envelope this note usually goes to, from history: "lidl" was tagged @food four
 * times out of five, so suggest Food. Null when the note is new or never tagged.
 */
export function suggestEnvelope(
  note: string,
  history: readonly Pick<Transaction, 'note' | 'envelopeId' | 'deletedAt'>[],
): Id | null {
  const key = normalize(note)
  if (!key) return null
  const counts = new Map<Id, number>()
  for (const t of history) {
    if (t.deletedAt !== undefined || t.envelopeId === undefined || normalize(t.note) !== key)
      continue
    counts.set(t.envelopeId, (counts.get(t.envelopeId) ?? 0) + 1)
  }
  let best: Id | null = null
  let bestCount = 0
  for (const [id, n] of counts) {
    if (n > bestCount) [best, bestCount] = [id, n]
  }
  return best
}

export interface FrequentEntry {
  note: string
  amount: Cents
  envelopeId?: Id
  count: number
}

/**
 * One-tap chips ("Coffee €3.20 again"): the same note and amount logged before, most
 * frequent first, then most recent. Income and bill payments are left out; the chips are
 * for the small everyday spends people repeat.
 */
export function frequentEntries(history: readonly Transaction[], limit = 4): FrequentEntry[] {
  const groups = new Map<string, FrequentEntry & { last: string }>()
  for (const t of history) {
    if (t.deletedAt !== undefined || t.amount >= 0 || t.fundId || t.billOccurrenceId) continue
    if (!t.note.trim()) continue
    const key = `${normalize(t.note)}|${t.amount}`
    const g = groups.get(key)
    if (g) {
      g.count++
      if (t.createdAt > g.last) {
        g.last = t.createdAt
        g.note = t.note.trim()
        g.envelopeId = t.envelopeId
      }
    } else {
      groups.set(key, {
        note: t.note.trim(),
        amount: -t.amount,
        count: 1,
        last: t.createdAt,
        ...(t.envelopeId ? { envelopeId: t.envelopeId } : {}),
      })
    }
  }
  return [...groups.values()]
    .sort((a, b) => b.count - a.count || (a.last < b.last ? 1 : a.last > b.last ? -1 : 0))
    .slice(0, limit)
    .map(({ note, amount, envelopeId, count }) => ({
      note,
      amount,
      count,
      ...(envelopeId ? { envelopeId } : {}),
    }))
}
