import { useToday } from '../../lib/useToday'
import { PageHeader } from '../../ui/PageHeader'
import { DebtsSection } from '../debts/DebtsSection'
import { ImpulseList } from '../impulse/ImpulseList'
import { FundsSection } from './FundsSection'
import { GardenCard } from './GardenCard'
import { NoSpendCard } from './NoSpendCard'

// Goals (Full mode, PLAN §5): savings, debts, no-spend days, the 48-hour list and the
// garden. Everything here only grows; nothing counts down or "breaks".
export function GoalsScreen() {
  const today = useToday()
  return (
    <>
      <PageHeader title="Goals" subtitle="Small steps that add up." />
      <div className="space-y-8">
        <FundsSection today={today} />
        <section aria-labelledby="goals-debts" className="space-y-3">
          <h2 id="goals-debts" className="px-1 text-lg font-semibold">
            Debts
          </h2>
          <DebtsSection />
        </section>
        <NoSpendCard today={today} />
        <section aria-labelledby="impulse-title" className="space-y-3">
          <h2 id="impulse-title" className="px-1 text-lg font-semibold">
            48-hour list
          </h2>
          <ImpulseList />
        </section>
        <GardenCard />
      </div>
    </>
  )
}
