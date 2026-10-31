import { PageHeader } from '../../ui/PageHeader'
import { DebtsSection } from './DebtsSection'

/** More > Debt payoff: the same section as in Goals, for Simple mode where Goals is hidden. */
export function DebtsScreen() {
  return (
    <>
      <PageHeader
        title="Debt payoff"
        subtitle="One debt at a time, at a pace that fits."
        back={{ to: '/more', label: 'More' }}
      />
      {/* Keeps the heading order h1 > h2 > h3 (the plan card is an h3, as under Goals). */}
      <h2 className="sr-only">Your debts</h2>
      <DebtsSection />
    </>
  )
}
