import { useDebts, useFunds, useTransactions } from '../../db/hooks'
import { GARDEN_STAGES } from '../../domain/garden'
import { savingsTotals } from '../../domain/savings'
import { useToday } from '../../lib/useToday'
import { PageHeader } from '../../ui/PageHeader'
import { StatStrip } from '../../ui/StatStrip'
import { useFormat } from '../bills/format'
import { DebtsSection } from '../debts/DebtsSection'
import { ImpulseList } from '../impulse/ImpulseList'
import { FundsSection } from './FundsSection'
import { GardenCard } from './GardenCard'
import { NoSpendCard } from './NoSpendCard'
import { useGarden } from './useGarden'

// Goals (Full mode, PLAN §5): savings, debts, no-spend days, the 48-hour list and the
// garden. Everything here only grows; nothing counts down or "breaks".
// Desktop: funds and debts side by side, the slower glances (no-spend, 48h, garden) below.
export function GoalsScreen() {
  const today = useToday()
  return (
    <>
      <PageHeader title="Goals" subtitle="Small steps that add up." />
      <div className="space-y-8">
        <GoalsStrip />
        <div className="space-y-8 lg:grid lg:grid-cols-2 lg:items-start lg:gap-8 lg:space-y-0">
          <FundsSection today={today} />
          <section aria-labelledby="goals-debts" className="space-y-3">
            <h2 id="goals-debts" className="flex min-h-11 items-end px-1 text-heading">
              Debts
            </h2>
            <DebtsSection />
          </section>
        </div>
        <div className="space-y-8 lg:grid lg:grid-cols-2 lg:items-start lg:gap-8 lg:space-y-0">
          <div className="space-y-8">
            <NoSpendCard today={today} />
            <section aria-labelledby="impulse-title" className="space-y-3">
              <h2 id="impulse-title" className="px-1 text-heading">
                48-hour list
              </h2>
              <ImpulseList />
            </section>
          </div>
          <GardenCard />
        </div>
      </div>
    </>
  )
}

/** Saved · Owed · Garden: the three things Goals tracks, at a glance. */
function GoalsStrip() {
  const f = useFormat()
  const funds = useFunds()
  const transactions = useTransactions()
  const debts = useDebts()
  const garden = useGarden()
  if (!funds || !transactions || !debts || !garden)
    return <div aria-hidden="true" className="h-20 animate-pulse rounded-3xl bg-surface" />

  const owed = debts.reduce((sum, d) => sum + Math.max(0, d.balance), 0)
  const owing = debts.filter((d) => d.balance > 0).length
  return (
    <StatStrip
      label="Goals at a glance"
      items={[
        {
          label: 'Saved',
          value: f.money(savingsTotals(funds, transactions).saved),
          hint: funds.length === 1 ? 'In 1 fund' : `In ${funds.length} funds`,
        },
        {
          label: 'Owed',
          value: f.money(owed),
          hint:
            debts.length === 0
              ? 'No debts added'
              : owed === 0
                ? 'All paid off'
                : `Across ${owing} ${owing === 1 ? 'debt' : 'debts'}`,
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
