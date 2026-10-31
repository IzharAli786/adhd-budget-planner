import { useState } from 'react'
import type { Cents } from '../../domain/money'
import { canFit, type Runway } from '../../domain/runway'
import type { EnvelopeUsage } from '../../domain/safeToSpend'
import type { Id } from '../../domain/types'
import { Button } from '../../ui/Button'
import { Chip } from '../../ui/Chip'
import { MoneyInput } from '../../ui/MoneyInput'
import { Sheet } from '../../ui/Sheet'
import { useFormat } from '../bills/format'

interface Props {
  open: boolean
  onClose: () => void
  total: Cents
  runway: Runway
  /** With envelopes on, the price can come out of an envelope's room first. */
  envelopes?: readonly EnvelopeUsage[]
}

/** "Can this fit?": before and after, nothing is saved. */
export function CanFitSheet({ open, onClose, total, runway, envelopes }: Props) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Can this fit?"
      description="Try a price. Nothing is saved."
      actions={
        <Button block variant="secondary" onClick={onClose}>
          Done
        </Button>
      }
    >
      {/* Mounted only while open, so the next try starts empty. */}
      {open && <CanFitForm total={total} runway={runway} envelopes={envelopes} />}
    </Sheet>
  )
}

export function CanFitForm({
  total,
  runway,
  envelopes: all = [],
}: Omit<Props, 'open' | 'onClose'>) {
  const f = useFormat()
  // Only envelopes with a budget hold room. The common-categories set starts with empty
  // budgets, and eleven "€0.00 left" chips would bury the question under noise.
  const envelopes = all.filter((e) => e.budget > 0)
  const [price, setPrice] = useState<Cents | null>(null)
  const [from, setFrom] = useState<Id | null>(null)
  const envelope = envelopes.find((e) => e.id === from)
  const result = price
    ? canFit(price, {
        total,
        startOfDaySafe: runway.startOfDaySafe,
        daysLeft: runway.daysLeft,
        room: envelope?.reserved,
      })
    : null

  return (
    <div className="space-y-4">
      <MoneyInput
        label="Price"
        value={price}
        onChange={setPrice}
        symbol={f.symbol}
        decimals={f.decimals}
      />
      {envelopes.length > 0 && (
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">From an envelope?</legend>
          <div className="flex flex-wrap gap-2">
            <Chip selected={from === null} onClick={() => setFrom(null)}>
              No
            </Chip>
            {envelopes.map((e) => (
              <Chip key={e.id} selected={from === e.id} onClick={() => setFrom(e.id)}>
                {e.name} · {f.money(e.reserved)} left
              </Chip>
            ))}
          </div>
        </fieldset>
      )}
      <div aria-live="polite">
        {result && (
          <section className="rounded-2xl bg-bg p-4">
            <p className="text-heading">
              {result.fits ? 'Yes, it fits before payday.' : 'Not before payday.'}
            </p>
            <p className="text-body text-muted">
              {result.fits
                ? envelope && price !== null && price <= envelope.reserved
                  ? `It fits inside ${envelope.name}, so payday money stays the same.`
                  : 'Here’s what it would leave you.'
                : `You’d be ${f.money(-result.after)} short. Could it wait until after payday?`}
            </p>
            <dl className="mt-3 space-y-2 text-body">
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Until payday</dt>
                <dd className="tabular-nums">
                  {f.money(total)} → <span className="font-semibold">{f.money(result.after)}</span>
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Per day</dt>
                <dd className="tabular-nums">
                  {f.money(runway.perDay)} →{' '}
                  <span className="font-semibold">{f.money(result.perDayAfter)}</span>
                </dd>
              </div>
            </dl>
          </section>
        )}
      </div>
    </div>
  )
}
