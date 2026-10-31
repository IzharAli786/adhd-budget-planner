import { useState } from 'react'
import { formatMoney } from '../../domain/money'
import { Button } from '../../ui/Button'
import { Sheet } from '../../ui/Sheet'

// Sample numbers until M5 wires real safe-to-spend. The layout is final: one number,
// one action card, the quick-add field, nothing else above the fold (PLAN §1).
const sample = {
  perDay: 2300,
  untilPayday: 16100,
  daysLeft: 7,
  payday: 'Fri 7 Nov',
  balanceAge: '2 days ago',
  math: [
    { label: 'Balance (2 days ago)', amount: 84250 },
    { label: 'Bills before payday', amount: -51200 },
    { label: 'Set aside (savings, buffer)', amount: -16950 },
    { label: 'Already spent since', amount: 0 },
  ],
}

export function TodayScreen() {
  const [mathOpen, setMathOpen] = useState(false)

  return (
    <div className="space-y-5">
      {/* Every screen needs an h1 for heading navigation; Today's is the hero itself. */}
      <h1 className="sr-only">Today</h1>
      <p aria-hidden="true" className="text-sm font-medium tracking-wide text-muted md:hidden">
        Steady
      </p>

      <section className="rounded-[1.75rem] bg-surface p-6 shadow-card ring-1 ring-line">
        <p className="text-sm text-muted">You can spend today</p>
        <p
          aria-live="polite"
          className="mt-1 text-[clamp(3rem,15vw,4.5rem)] leading-none font-semibold tracking-tight tabular-nums"
        >
          {formatMoney(sample.perDay)}
        </p>
        <p className="mt-4 text-base">
          <span className="font-medium tabular-nums">{formatMoney(sample.untilPayday)}</span> until
          payday · {sample.payday}
        </p>
        <div className="mt-4 flex items-center justify-between gap-3 text-sm text-muted">
          <span>
            {sample.daysLeft} days to go · balance from {sample.balanceAge}
          </span>
          <button
            type="button"
            onClick={() => setMathOpen(true)}
            className="min-h-11 shrink-0 rounded-full px-1 font-medium text-accent"
          >
            See the math
          </button>
        </div>
      </section>

      <section className="rounded-[1.75rem] bg-accent-soft p-5">
        <p className="text-xs font-semibold tracking-wider text-accent uppercase">One thing now</p>
        <p className="mt-1 text-lg font-medium">Update your balance</p>
        <p className="text-sm text-muted">Takes 20 seconds. Keeps today’s number honest.</p>
        <div className="mt-4 flex gap-2">
          <Button>Update</Button>
          <Button variant="ghost" className="text-muted">
            Not now
          </Button>
        </div>
      </section>

      <label className="block">
        <span className="sr-only">Quick add</span>
        <input
          type="text"
          inputMode="text"
          enterKeyHint="done"
          placeholder="Type “12 coffee” and press enter"
          className="min-h-14 w-full rounded-2xl border border-line bg-surface px-4 text-base outline-none placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
      </label>

      <Sheet
        open={mathOpen}
        onClose={() => setMathOpen(false)}
        title="How this number works"
        description="An estimate from what Steady knows. Update your balance to sharpen it."
        actions={
          <Button block onClick={() => setMathOpen(false)}>
            Got it
          </Button>
        }
      >
        <dl className="divide-y divide-line">
          {sample.math.map((line) => (
            <div key={line.label} className="flex justify-between gap-4 py-3">
              <dt className="text-muted">{line.label}</dt>
              <dd className="font-medium tabular-nums">{formatMoney(line.amount)}</dd>
            </div>
          ))}
          <div className="flex justify-between gap-4 py-3 text-base">
            <dt className="font-semibold">Until payday</dt>
            <dd className="font-semibold tabular-nums">{formatMoney(sample.untilPayday)}</dd>
          </div>
          <div className="flex justify-between gap-4 py-3">
            <dt className="text-muted">÷ {sample.daysLeft} days, including today</dt>
            <dd className="font-semibold text-accent tabular-nums">{formatMoney(sample.perDay)}</dd>
          </div>
        </dl>
      </Sheet>
    </div>
  )
}
