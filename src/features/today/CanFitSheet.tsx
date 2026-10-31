import { useState } from 'react'
import type { Cents } from '../../domain/money'
import { canFit, type Runway } from '../../domain/runway'
import { Button } from '../../ui/Button'
import { MoneyInput } from '../../ui/MoneyInput'
import { Sheet } from '../../ui/Sheet'
import { useFormat } from '../bills/format'

interface Props {
  open: boolean
  onClose: () => void
  total: Cents
  runway: Runway
}

/** "Can this fit?": before and after, nothing is saved. */
export function CanFitSheet({ open, onClose, total, runway }: Props) {
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
      {open && <CanFitForm total={total} runway={runway} />}
    </Sheet>
  )
}

function CanFitForm({ total, runway }: Pick<Props, 'total' | 'runway'>) {
  const f = useFormat()
  const [price, setPrice] = useState<Cents | null>(null)
  const result = price
    ? canFit(price, { total, spentToday: runway.spentToday, daysLeft: runway.daysLeft })
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
      <div aria-live="polite">
        {result && (
          <section className="rounded-2xl bg-bg p-4">
            <p className="text-lg font-semibold">
              {result.fits ? 'Yes, it fits before payday.' : 'Not before payday.'}
            </p>
            <p className="text-[0.9375rem] text-muted">
              {result.fits
                ? 'Here’s what it would leave you.'
                : `You’d be ${f.money(-result.after)} short. Could it wait until after payday?`}
            </p>
            <dl className="mt-3 space-y-2 text-[0.9375rem]">
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
