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
      <DebtsSection />
    </>
  )
}
