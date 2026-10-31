import { EmptyState, PageHeader } from '../../ui/PageHeader'
import { Icon } from '../../ui/Icon'

export function PlanScreen() {
  return (
    <>
      <PageHeader title="Plan" subtitle="Income, savings and “can this fit?”" />
      <EmptyState icon={<Icon name="plan" size={26} />} title="Plan your paycheck">
        See where each payday goes, set money aside, and check whether a purchase fits before you
        make it.
      </EmptyState>
    </>
  )
}
