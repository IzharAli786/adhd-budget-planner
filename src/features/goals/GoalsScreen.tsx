import { EmptyState, PageHeader } from '../../ui/PageHeader'
import { Icon } from '../../ui/Icon'

export function GoalsScreen() {
  return (
    <>
      <PageHeader title="Goals" subtitle="Small steps that add up." />
      <EmptyState icon={<Icon name="goals" size={26} />} title="Goals are coming">
        Savings funds, a debt payoff plan that compares snowball and avalanche, and no-spend days.
        Progress only grows.
      </EmptyState>
    </>
  )
}
