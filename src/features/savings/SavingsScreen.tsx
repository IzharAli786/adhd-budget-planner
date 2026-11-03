import { useFunds, useTransactions } from '../../db/hooks'
import { useToday } from '../../lib/useToday'
import { PageHeader } from '../../ui/PageHeader'
import { FundsSection, SavingsTiles } from '../goals/FundsSection'

/**
 * Savings (Full mode): the totals across every fund, then each fund with how far along
 * it is, its pace, and "Add money". Moving money into a fund never lowers safe to spend.
 */
export function SavingsScreen() {
  const today = useToday()
  const funds = useFunds()
  const transactions = useTransactions()
  return (
    <>
      <PageHeader
        title="Savings"
        subtitle="Money put aside for the things you care about, a little at a time."
      />
      <div className="space-y-8">
        {funds && transactions && <SavingsTiles funds={funds} transactions={transactions} />}
        {/* FundsSection brings its own totals strip (without the total saved) for where it
            stands alone; the full strip above already says it all, so that one is hidden. */}
        <div className="[&_[aria-label='Savings_totals']]:hidden">
          <FundsSection today={today} />
        </div>
      </div>
    </>
  )
}
