import { DebtsSection } from '../debts/DebtsSection'
import { PageHeader } from '../../ui/PageHeader'

export function GoalsScreen() {
  return (
    <>
      <PageHeader title="Goals" subtitle="Small steps that add up." />
      <section aria-labelledby="goals-debts" className="space-y-3">
        <h2
          id="goals-debts"
          className="px-1 text-xs font-semibold tracking-wider text-muted uppercase"
        >
          Debts
        </h2>
        <DebtsSection />
      </section>
    </>
  )
}
