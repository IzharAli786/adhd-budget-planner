import type { ShortGap } from '../../domain/catchUp'
import { Button } from '../../ui/Button'
import { Icon } from '../../ui/Icon'

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** Short gap (PLAN §4.5): one card, counts only. The action card below does the rest. */
export function CatchUpCard({ gap, onDismiss }: { gap: ShortGap; onDismiss: () => void }) {
  const lines = [
    gap.paydayPassed && 'Payday came',
    gap.billsCameDue > 0 && `${plural(gap.billsCameDue, 'bill', 'bills')} came due`,
    gap.expiredImpulse > 0 &&
      `${plural(gap.expiredImpulse, 'item', 'items')} on your 48h list ready to decide`,
  ].filter((l): l is string => Boolean(l))

  return (
    <section
      aria-labelledby="catch-up"
      className="animate-fade-in rounded-[1.75rem] bg-surface p-5 shadow-card ring-1 ring-line"
    >
      <h2 id="catch-up" className="text-lg font-medium">
        Welcome back
      </h2>
      <p className="text-[0.9375rem] text-muted">
        In the {gap.daysAway} days since you last looked:
      </p>
      <ul className="mt-3 space-y-1.5">
        {lines.map((line) => (
          <li key={line} className="flex items-center gap-2.5">
            <Icon name="check" size={18} className="shrink-0 text-accent" />
            <span className="tabular-nums">{line}</span>
          </li>
        ))}
      </ul>
      <Button variant="secondary" className="mt-4" onClick={onDismiss}>
        Got it
      </Button>
    </section>
  )
}
