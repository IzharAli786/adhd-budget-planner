import { useState } from 'react'
import { useAppSettings } from '../../app/SettingsProvider'
import type { Runway } from '../../domain/runway'
import { simpleLines, type SafeToSpend } from '../../domain/safeToSpend'
import type { ISODate } from '../../domain/types'
import { Button } from '../../ui/Button'
import { Segmented } from '../../ui/Segmented'
import { Sheet } from '../../ui/Sheet'
import { useFormat } from '../bills/format'

const VIEWS = [
  { value: 'simple', label: 'Simple' },
  { value: 'full', label: 'Every line' },
] as const

interface Props {
  open: boolean
  onClose: () => void
  safe: SafeToSpend
  runway: Runway
  today: ISODate
}

/**
 * "See the math": renders the very lines safeToSpend() summed, so the breakdown can't
 * disagree with the hero. Simple mode shows 4 lines, Full every line with its items.
 */
export function MathSheet({ open, onClose, safe, runway, today }: Props) {
  const f = useFormat()
  const { settings } = useAppSettings()
  const [view, setView] = useState<'simple' | 'full'>(settings.simpleMode ? 'simple' : 'full')
  const lines = view === 'simple' ? simpleLines(safe).slice(0, 3) : safe.lines

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="How this number works"
      description="What you entered, added up. Update your balance to sharpen it."
      actions={
        <Button block onClick={onClose}>
          Got it
        </Button>
      }
    >
      <div className="mb-4">
        <Segmented label="Detail" value={view} options={VIEWS} onChange={setView} />
      </div>
      <dl className="divide-y divide-line">
        {lines.map((line) => (
          <div key={line.id} className="py-3">
            <div className="flex justify-between gap-4">
              <dt className="text-muted">
                {line.label}
                {line.date && line.id === 'balance' && (
                  <span className="block text-sm">
                    {f.day(line.date)} · {f.relative(line.date, today)}
                  </span>
                )}
              </dt>
              <dd className="font-medium tabular-nums">{f.money(line.amount)}</dd>
            </div>
            {view === 'full' && line.items && line.items.length > 0 && (
              <ul className="mt-1.5 space-y-1 border-l-2 border-line pl-3 text-sm text-muted">
                {line.items.map((item, i) => (
                  <li key={i} className="flex justify-between gap-4">
                    <span className="min-w-0 truncate">
                      {item.label}
                      {item.date && <span> · {f.day(item.date)}</span>}
                    </span>
                    <span className="shrink-0 tabular-nums">{f.money(item.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
        <div className="flex justify-between gap-4 py-3 text-base">
          <dt className="font-semibold">
            {safe.status === 'short' ? 'Short until payday' : 'Safe to spend until payday'}
          </dt>
          <dd className="font-semibold tabular-nums">{f.money(safe.total)}</dd>
        </div>
        {runway.startOfDaySafe !== safe.total && (
          <div className="flex justify-between gap-4 py-3">
            <dt className="text-muted">At the start of today, before today’s spending</dt>
            <dd className="font-medium tabular-nums">{f.money(runway.startOfDaySafe)}</dd>
          </div>
        )}
        <div className="flex justify-between gap-4 py-3">
          <dt className="text-muted">
            ÷ {runway.daysLeft} {runway.daysLeft === 1 ? 'day' : 'days'}, including today
          </dt>
          <dd className="font-semibold text-accent tabular-nums">{f.money(runway.perDay)} a day</dd>
        </div>
        {runway.spentToday > 0 && (
          <div className="flex justify-between gap-4 py-3">
            <dt className="text-muted">Spent today</dt>
            <dd className="font-medium tabular-nums">{f.money(-runway.spentToday)}</dd>
          </div>
        )}
      </dl>
      <p className="mt-3 rounded-2xl bg-bg px-4 py-3 text-sm text-muted">{safe.estimateNote}</p>
    </Sheet>
  )
}
