import { useId, useMemo, useState } from 'react'
import { useAppSettings } from '../../app/SettingsProvider'
import {
  completeTag,
  frequentEntries,
  parseQuickAdd,
  signedAmount,
  suggestEnvelope,
  tagSuggestions,
  typingTag,
  type QuickAddError,
} from '../../domain/quickAdd'
import type { Envelope, ISODate, Transaction } from '../../domain/types'
import { Chip } from '../../ui/Chip'
import { cx } from '../../ui/cx'
import { EnvelopeDot } from '../../ui/EnvelopeDot'
import { useFormat } from '../bills/format'
import { useQuickAdd } from './QuickAddProvider'

const ERRORS: Record<Exclude<QuickAddError, 'empty'>, string> = {
  no_amount: 'Add an amount, like “12 coffee”.',
  too_many_decimals: 'That has too many decimals. Did you mean 1250 or 1.25?',
  too_large: 'That amount is too big to be right. Check the digits?',
  zero: 'The amount can’t be zero.',
}

interface Props {
  today: ISODate
  transactions: readonly Transaction[]
  envelopes: readonly Envelope[]
}

/**
 * Today's typed quick-add: "12 coffee" + Enter. The chip under the field shows how the
 * text was read BEFORE saving, so a misread never lands silently in the numbers.
 */
export function QuickAddField({ today, transactions, envelopes }: Props) {
  const f = useFormat()
  const { settings } = useAppSettings()
  const { save, fieldRef } = useQuickAdd()
  const previewId = useId()
  const [text, setText] = useState('')
  const [tried, setTried] = useState(false)
  const [saving, setSaving] = useState(false)

  const live = useMemo(
    () => (settings.envelopesEnabled ? envelopes.filter((e) => e.deletedAt === undefined) : []),
    [envelopes, settings.envelopesEnabled],
  )
  const parsed = parseQuickAdd(text, { today, envelopes: live, decimals: f.decimals })
  // The note's usual envelope, when the user didn't tag one (PLAN §4.4).
  const suggested =
    parsed.ok && !parsed.envelopeId && !parsed.unknownTag && live.length
      ? suggestEnvelope(parsed.note, transactions)
      : null
  const envelopeId = parsed.ok ? (parsed.envelopeId ?? suggested ?? undefined) : undefined
  const envelopeName = live.find((e) => e.id === envelopeId)?.name
  const recent = useMemo(() => frequentEntries(transactions.slice(-300), 4), [transactions])
  // "12 lunch @" shows the envelopes as chips; a tap writes the tag (PLAN §4.4 grammar).
  const partialTag = live.length > 0 ? typingTag(text) : null
  const tags = partialTag === null ? [] : tagSuggestions(partialTag, live)

  async function commit(entry: Parameters<typeof save>[0], fromField: boolean) {
    setSaving(true)
    try {
      // A chip tap must not wipe a half-typed entry.
      if ((await save(entry)) && fromField) {
        setText('')
        setTried(false)
      }
    } finally {
      setSaving(false)
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return
    e.preventDefault()
    setTried(true)
    if (!parsed.ok || saving) return
    void commit(
      {
        amount: signedAmount(parsed),
        note: parsed.note,
        date: parsed.date,
        ...(envelopeId ? { envelopeId } : {}),
      },
      true,
    )
  }

  const error =
    parsed.ok || parsed.reason === 'empty'
      ? null
      : parsed.reason === 'too_many_decimals' && f.decimals === 0
        ? 'Whole amounts only for this currency, like 500.'
        : ERRORS[parsed.reason]
  const showError = error !== null && tried

  return (
    <section aria-label="Quick add" className="space-y-3">
      <label className="block">
        <span className="sr-only">Quick add, for example 12 coffee</span>
        <input
          ref={fieldRef}
          type="text"
          inputMode="text"
          enterKeyHint="done"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setTried(false)
          }}
          onKeyDown={onKeyDown}
          aria-invalid={showError ? true : undefined}
          aria-describedby={previewId}
          placeholder="Type “12 coffee” and press enter"
          className={cx(
            'min-h-14 w-full rounded-2xl border border-line bg-surface px-4 text-base shadow-card outline-none',
            'transition-colors placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/20',
            'aria-invalid:border-accent',
          )}
        />
      </label>

      <div id={previewId} aria-live="polite" className="min-h-6 px-1 text-sm">
        {parsed.ok ? (
          <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1 rounded-full bg-accent-soft px-3 py-1 text-text">
            <span className="font-medium tabular-nums">
              {parsed.kind === 'income' ? 'Add' : 'Spend'} {f.money(parsed.amount)}
            </span>
            {parsed.note && <span>· {parsed.note}</span>}
            <span className="text-muted">
              · {parsed.date === today ? 'today' : f.day(parsed.date)}
            </span>
            {envelopeName && <span className="text-muted">· {envelopeName}</span>}
            {parsed.unknownTag && (
              <span className="text-muted">· no envelope “{parsed.unknownTag}”</span>
            )}
            <span className="sr-only">. Press enter to save.</span>
          </span>
        ) : showError ? (
          <span className="font-medium text-accent">{error}</span>
        ) : null}
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Envelopes">
          {tags.map((t) => {
            const color = live.find((e) => e.id === t.envelopeId)?.color
            return (
              <Chip
                key={t.envelopeId}
                aria-label={`Tag ${t.name}`}
                onClick={() => {
                  setText(completeTag(text, t.tag))
                  fieldRef.current?.focus()
                }}
              >
                <EnvelopeDot color={color} className="h-2 w-2" />
                {t.name}
              </Chip>
            )
          })}
        </div>
      )}

      {recent.length > 0 && tags.length === 0 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Log again">
          {recent.map((c) => (
            <Chip
              key={`${c.note}|${c.amount}`}
              disabled={saving}
              aria-label={`Log ${c.note} ${f.money(c.amount)} again`}
              onClick={() =>
                void commit(
                  {
                    amount: -c.amount,
                    note: c.note,
                    date: today,
                    ...(c.envelopeId ? { envelopeId: c.envelopeId } : {}),
                  },
                  false,
                )
              }
            >
              {c.note}
              <span className="text-muted tabular-nums">{f.money(c.amount)}</span>
            </Chip>
          ))}
        </div>
      )}
    </section>
  )
}
