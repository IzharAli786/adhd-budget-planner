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
      <div className="space-y-4">
        {funds && transactions && <SavingsTiles funds={funds} transactions={transactions} />}
        {/* FundsSection brings its own totals strip (without the total saved) for where it
            stands alone; the full strip above already says it all, so that one is hidden.
            Its "Savings" heading would repeat the page title right above it, so it is only
            read out (it still names the list), and "New fund" keeps its place on the right. */}
        <div className="[&_#funds-title]:sr-only [&_#funds-title+*]:ml-auto [&_[aria-label='Savings_totals']]:hidden">
          <FundsSection today={today} />
        </div>
      </div>
    </>
  )
}
