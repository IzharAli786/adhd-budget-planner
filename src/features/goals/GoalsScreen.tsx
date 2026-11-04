import { useLifeGoals, useNoSpend } from '../../db/hooks'
import { GARDEN_STAGES } from '../../domain/garden'
import { noSpendCount } from '../../domain/noSpend'
import { monthSpan } from '../../domain/safeToSpend'
import type { ISODate } from '../../domain/types'
import { useMediaQuery } from '../../lib/useMediaQuery'
import { useToday } from '../../lib/useToday'
import { PageHeader } from '../../ui/PageHeader'
import { StatStrip } from '../../ui/StatStrip'
import { ImpulseList } from '../impulse/ImpulseList'
import { GardenCard } from './GardenCard'
import { LifeGoalsCard } from './LifeGoals'
import { NoSpendCard } from './NoSpendCard'
import { useGarden } from './useGarden'

// Goals (Full mode, PLAN §5): the bigger picture. Life goals first (what the money is
// for), then the small daily habits that get there: no-spend days, the 48-hour list and
// the garden. Savings funds and debts have their own sections. Nothing here counts down
// or "breaks".
export function GoalsScreen() {
  const today = useToday()
  // Rendered in each layout's own order rather than reordered with CSS, so keyboard and
  // screen-reader order always match what is on screen.
  const wide = useMediaQuery('(min-width: 64rem)')
  const noSpend = <NoSpendCard today={today} />
  const impulse = (
    <section aria-labelledby="impulse-title" className="space-y-3">
      <h2 id="impulse-title" className="section-title">
        48-hour list
      </h2>
      <ImpulseList />
    </section>
  )
  const garden = <GardenCard />

  return (
    <>
      <PageHeader title="Goals" subtitle="What the money is for, and the small steps toward it." />
      <div className="space-y-8">
        <GoalsStrip today={today} />
        <LifeGoalsCard today={today} />
        {/* Desktop: two independent stacks, so a tall card on one side never leaves a
            hole on the other the way a shared-row grid does. */}
        {wide ? (
          <div className="grid grid-cols-2 items-start gap-8">
            <div className="space-y-8">
              {noSpend}
              {impulse}
            </div>
            {garden}
          </div>
        ) : (
          <>
            {noSpend}
            {impulse}
            {garden}
          </>
        )}
      </div>
    </>
  )
}

/** Life goals · No-spend days · Garden: what Goals tracks, at a glance. */
function GoalsStrip({ today }: { today: ISODate }) {
  const goals = useLifeGoals()
  const days = useNoSpend()
  const garden = useGarden()
  if (!goals || !days || !garden)
    return <div aria-hidden="true" className="h-20 animate-pulse rounded-3xl bg-surface" />

  const done = goals.filter((g) => g.status === 'done').length
  const doing = goals.filter((g) => g.status === 'doing').length
  const noSpend = noSpendCount(days, monthSpan(today).start, today)
  return (
    <StatStrip
      label="Goals at a glance"
      items={[
        {
          label: 'Life goals',
          value: goals.length === 0 ? 'None yet' : `${done} of ${goals.length} done`,
          hint: goals.length === 0 ? 'Add one below' : `${doing} in progress`,
        },
        {
          label: 'No-spend days',
          value: String(noSpend),
          hint: 'This month',
        },
        {
          label: 'Garden',
          value: garden.stage.name,
          hint: `Stage ${garden.stage.index + 1} of ${GARDEN_STAGES.length}`,
        },
      ]}
    />
  )
}
