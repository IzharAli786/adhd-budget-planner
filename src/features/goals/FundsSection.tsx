import { useMemo, useState } from 'react'
import { useUndoToast } from '../../app/useUndoToast'
import { useFunds, useIncomes, usePaydayOverrides, useTransactions } from '../../db/hooks'
import { addToFund } from '../../db/repos'
import { addDays } from '../../domain/dates'
import { paydaysBetween, primaryIncome } from '../../domain/paySchedule'
import {
  challengeStep,
  fundPace,
  fundProgress,
  fundSaved,
  savingsTotals,
  type FundPace,
} from '../../domain/savings'
import type { Cents, ISODate, SavingsFund, Transaction } from '../../domain/types'
import { Button } from '../../ui/Button'
import { Icon } from '../../ui/Icon'
import { EmptyState } from '../../ui/PageHeader'
import { MoneyInput } from '../../ui/MoneyInput'
import { ProgressRing } from '../../ui/Progress'
import { Segmented } from '../../ui/Segmented'
import { Sheet } from '../../ui/Sheet'
import { StatStrip } from '../../ui/StatStrip'
import { useFormat, type Formatters } from '../bills/format'
import { FundSheet } from './FundSheet'

/** Savings funds on Goals: a ring each, the pace in words, and "Add money". */
export function FundsSection({ today }: { today: ISODate }) {
  const funds = useFunds()
  const transactions = useTransactions()
  const paydays = usePaydays(today)
  const [editing, setEditing] = useState<SavingsFund | 'new' | null>(null)
  const [adding, setAdding] = useState<SavingsFund | null>(null)

  if (!funds || !transactions || !paydays)
    return <div aria-hidden="true" className="h-40 animate-pulse rounded-3xl bg-surface" />

  return (
    <section aria-labelledby="funds-title" className="space-y-3">
      <div className="flex items-end justify-between gap-3 px-1">
        <h2 id="funds-title" className="text-heading">
          Savings
        </h2>
        {funds.length > 0 && (
          <Button variant="ghost" onClick={() => setEditing('new')}>
            <Icon name="plus" size={18} />
            New fund
          </Button>
        )}
      </div>
      {funds.length === 0 ? (
        <EmptyState
          art="sprout"
          title="Start one small fund"
          action={
            <Button onClick={() => setEditing('new')}>
              <Icon name="plus" size={18} />
              New savings fund
            </Button>
          }
        >
          A holiday, a cushion, a birthday. Even a little each payday adds up.
        </EmptyState>
      ) : (
        <SavingsTiles funds={funds} transactions={transactions} withSaved={false} />
      )}
      {funds.length > 0 && (
        <ul className="space-y-3">
          {funds.map((fund) => (
            <FundCard
              key={fund.id}
              fund={fund}
              saved={fundSaved(fund, transactions)}
              today={today}
              paydays={paydays}
              onAdd={() => setAdding(fund)}
              onEdit={() => setEditing(fund)}
            />
          ))}
        </ul>
      )}
      <FundSheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        today={today}
        fund={editing === 'new' || editing === null ? undefined : editing}
      />
      <AddMoneySheet
        fund={adding}
        saved={adding ? fundSaved(adding, transactions) : 0}
        today={today}
        onClose={() => setAdding(null)}
      />
    </section>
  )
}

/** Primary-income paydays over the next five years, for pace and "reached around". */
export function usePaydays(today: ISODate): ISODate[] | undefined {
  const incomes = useIncomes()
  const overrides = usePaydayOverrides()
  return useMemo(() => {
    if (!incomes || !overrides) return undefined
    const income = primaryIncome(incomes)
    if (!income) return []
    return paydaysBetween(income, today, addDays(today, 5 * 366), overrides).map((p) => p.date)
  }, [incomes, overrides, today])
}

function FundCard({
  fund,
  saved,
  today,
  paydays,
  onAdd,
  onEdit,
}: {
  fund: SavingsFund
  saved: Cents
  today: ISODate
  paydays: ISODate[]
  onAdd: () => void
  onEdit: () => void
}) {
  const f = useFormat()
  const progress = fundProgress(saved, fund.target)
  const pace = paceText(fundPace(fund, saved, today, paydays), fund.perPeriod, f)

  const challenge =
    fund.challenge?.kind === '52week'
      ? challengeStep(fund.challenge.start, today, 10 ** f.decimals)
      : null

  return (
    <li className="card p-5">
      <div className="flex items-center gap-4">
        <ProgressRing value={progress} label={`${fund.name} progress`}>
          {fund.target ? (
            f.percent(Math.floor(progress * 100) / 100)
          ) : (
            <Icon name="leaf" size={20} />
          )}
        </ProgressRing>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold break-words">{fund.name}</h3>
          <p className="text-body tabular-nums">
            {f.money(saved)}
            {fund.target !== undefined && (
              <span className="text-muted"> of {f.money(fund.target)}</span>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Edit ${fund.name}`}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-muted hover:bg-accent-soft/60"
        >
          <Icon name="edit" size={18} />
        </button>
      </div>
      {(pace || challenge || fund.challenge?.kind === 'fixed') && (
        <p className="mt-3 text-sm text-muted">
          {challenge
            ? challenge.week === 0
              ? 'The 52-week challenge starts soon.'
              : `Week ${challenge.week} of 52: ${f.money(challenge.thisWeek)} this week. `
            : fund.challenge?.kind === 'fixed'
              ? `Challenge: ${f.money(fund.perPeriod)} every payday. `
              : null}
          {pace}
        </p>
      )}
      <Button variant="secondary" block className="mt-4" onClick={onAdd}>
        <Icon name="plus" size={18} />
        Add money
      </Button>
    </li>
  )
}

/** The pace line in words. Shared with Plan's savings list, so both say the same thing. */
export function paceText(pace: FundPace | null, perPeriod: Cents, f: Formatters): string | null {
  switch (pace?.kind) {
    case 'reached':
      return 'You reached it. That took patience.'
    case 'by-date':
      return `About ${f.money(pace.perPayday)} per payday to reach it by ${f.day(pace.by)}.`
    case 'eta':
      return `At ${f.money(perPeriod)} a payday, you’ll get there around ${f.month(pace.when)}.`
    default:
      return null
  }
}

/**
 * Total saved, total of the targets, and how far along they are together. `withSaved`
 * is off on Goals, where the strip at the top already shows the total saved.
 */
export function SavingsTiles({
  funds,
  transactions,
  withSaved = true,
}: {
  funds: readonly SavingsFund[]
  transactions: readonly Transaction[]
  withSaved?: boolean
}) {
  const f = useFormat()
  if (funds.length === 0) return null
  const t = savingsTotals(funds, transactions)
  const none = t.target === 0
  const items = [
    ...(withSaved ? [{ label: 'Total saved', value: f.money(t.saved) }] : []),
    {
      label: 'Total of targets',
      value: none ? 'No targets yet' : f.money(t.target),
    },
    {
      label: 'Overall',
      value: none ? '–' : f.percent(Math.floor(t.progress * 100) / 100),
      hint: none ? 'Add a target to a fund to see this' : 'of the way there',
    },
  ]
  return <StatStrip label="Savings totals" items={items} />
}

function AddMoneySheet({
  fund,
  saved,
  today,
  onClose,
}: {
  fund: SavingsFund | null
  saved: Cents
  today: ISODate
  onClose: () => void
}) {
  return (
    <Sheet
      open={fund !== null}
      onClose={onClose}
      title={fund ? `Add to ${fund.name}` : ''}
      description="Moves money out of what you can spend and into this fund."
    >
      {fund && <AddMoneyForm fund={fund} saved={saved} today={today} onDone={onClose} />}
    </Sheet>
  )
}

function AddMoneyForm({
  fund,
  saved,
  today,
  onDone,
}: {
  fund: SavingsFund
  saved: Cents
  today: ISODate
  onDone: () => void
}) {
  const f = useFormat()
  const undoToast = useUndoToast()
  const [amount, setAmount] = useState<Cents | null>(fund.perPeriod || null)
  const [direction, setDirection] = useState<'in' | 'out'>('in')
  // A fund can't go below zero: taking out more than is in it isn't a saving move.
  const tooMuch = direction === 'out' && amount !== null && amount > saved
  const valid = !!amount && !tooMuch

  async function save() {
    if (!valid) return
    await addToFund(fund, direction === 'in' ? amount : -amount, today)
    undoToast(
      direction === 'in'
        ? `${f.money(amount)} added to ${fund.name}`
        : `${f.money(amount)} taken from ${fund.name}`,
    )
    onDone()
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
      className="space-y-5 pb-4"
    >
      <Segmented
        label="Direction"
        value={direction}
        onChange={setDirection}
        options={[
          { value: 'in', label: 'Put in' },
          { value: 'out', label: 'Take out' },
        ]}
      />
      <MoneyInput
        label="Amount"
        value={amount}
        onChange={setAmount}
        symbol={f.symbol}
        decimals={f.decimals}
        hint={direction === 'out' ? `${f.money(saved)} in ${fund.name} now.` : undefined}
        error={tooMuch ? `That’s more than the ${f.money(saved)} in it.` : undefined}
      />
      <Button type="submit" block disabled={!valid}>
        {direction === 'in' ? 'Add money' : 'Take it out'}
      </Button>
    </form>
  )
}
