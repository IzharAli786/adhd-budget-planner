import { PageHeader } from '../../ui/PageHeader'
import { DebtsSection } from './DebtsSection'

/** Debt (Full mode): every debt, its payoff estimate, and the plan to clear them. */
export function DebtsScreen() {
  return (
    <>
      <PageHeader title="Debt" subtitle="One debt at a time, at a pace that fits." />
      {/* Keeps the heading order h1 > h2 > h3 (the plan card is an h3). */}
      <h2 className="sr-only">Your debts</h2>
      <DebtsSection />
    </>
  )
}
