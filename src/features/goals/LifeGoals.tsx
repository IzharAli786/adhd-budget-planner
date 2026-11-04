import { useId, useState, type FormEvent } from 'react'
import { useUndoToast } from '../../app/useUndoToast'
import { useFunds, useLifeGoals, useTransactions } from '../../db/hooks'
import {
  addLifeGoal,
  deleteLifeGoal,
  setLifeGoalStatus,
  updateLifeGoal,
  type LifeGoalInput,
} from '../../db/repos'
import { fundProgress, fundSaved } from '../../domain/savings'
import {
  LIFE_GOAL_TITLE_MAX,
  LIFE_GOAL_WHY_MAX,
  type Debt,
  type ISODate,
  type LifeGoal,
  type LifeGoalStatus,
  type SavingsFund,
  type Transaction,
} from '../../domain/types'
import { Button } from '../../ui/Button'
import { cx } from '../../ui/cx'
import { DateInput } from '../../ui/DateInput'
import { Field, inputClass } from '../../ui/Field'
import { DATA_COLOR } from '../../ui/dataColors'
import { IconButton } from '../../ui/IconButton'
import { IconTile } from '../../ui/IconTile'
import { ProgressBar } from '../../ui/Progress'
import { Segmented } from '../../ui/Segmented'
import { Sheet } from '../../ui/Sheet'
import { GOAL_STATUS, StatusBadge, TAG } from '../../ui/status'
import { useFormat, type Formatters } from '../bills/format'
import { useDebtsOwed, type OwedDebt } from '../debts/useDebtsOwed'

const STATUS_OPTIONS = (['todo', 'doing', 'done'] as const).map((value) => ({
  value,
  label: GOAL_STATUS[value].label,
}))
// In progress first: what you're working on now, then what's next, then what's done.
const ORDER: Record<LifeGoalStatus, number> = { doing: 0, todo: 1, done: 2 }

// Each status reads differently at a glance, never by colour alone (the word and glyph are
// always there): a dashed "slot" waiting, a full card while it's moving, quiet when done.
const STATUS_CARD: Record<LifeGoalStatus, string> = {
  todo: 'card-quiet border border-dashed border-line',
  doing: 'card',
  done: 'card-quiet',
}

/**
 * Life goals on Goals: the why behind the numbers ("Move to Lisbon", "Debt-free by 40").
 * Free-form and pressure-free: no countdowns, no "overdue", just where each one stands,
 * and the fund or debt that gets it there when there is one.
 */
export function LifeGoalsCard({ today }: { today: ISODate }) {
  const goals = useLifeGoals()
  const funds = useFunds()
  // What is owed today (payments since the balance count), the same as Today and Debt show.
  const debts = useDebtsOwed()
  const transactions = useTransactions()
  const [editing, setEditing] = useState<LifeGoal | 'new' | null>(null)

  if (!goals || !funds || !debts || !transactions)
    return <div aria-hidden="true" className="h-40 animate-pulse rounded-3xl bg-surface" />

  const sorted = [...goals].sort((a, b) => ORDER[a.status] - ORDER[b.status])
  const done = goals.filter((g) => g.status === 'done').length

  return (
    <section aria-labelledby="life-goals-title" className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 id="life-goals-title" className="section-title">
            Life goals
          </h2>
          {goals.length > 0 && (
            <p className="text-sm text-muted">
              {done === 0
                ? 'The why behind the numbers.'
                : `${done} of ${goals.length} done. Each one is worth it.`}
            </p>
          )}
        </div>
        {goals.length > 0 && (
          <Button
            variant="ghost"
            icon="plus"
            className="shrink-0 whitespace-nowrap"
            onClick={() => setEditing('new')}
          >
            New goal
          </Button>
        )}
      </div>
      {goals.length === 0 ? (
        <div className="card p-5">
          <p className="text-body text-muted">
            What is the money for? A move, a course, a calmer year. Write it down, link it to a fund
            or a debt if you like, and watch it get closer.
          </p>
          <Button
            variant="secondary"
            icon="plus"
            className="mt-4"
            onClick={() => setEditing('new')}
          >
            Add a life goal
          </Button>
        </div>
      ) : (
        <ul className="space-y-3">
          {sorted.map((goal) => (
            <GoalRow
              key={goal.id}
              goal={goal}
              fund={funds.find((x) => x.id === goal.fundId)}
              debt={debts.find((x) => x.id === goal.debtId)}
              transactions={transactions}
              today={today}
              onEdit={() => setEditing(goal)}
            />
          ))}
        </ul>
      )}
      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' || editing === null ? 'New life goal' : `Edit ${editing.title}`}
        description={
          editing === 'new' ? 'Something you want your money to make possible.' : undefined
        }
      >
        {editing !== null && (
          <GoalForm
            goal={editing === 'new' ? undefined : editing}
            funds={funds}
            debts={debts}
            today={today}
            onDone={() => setEditing(null)}
          />
        )}
      </Sheet>
    </section>
  )
}

function GoalRow({
  goal,
  fund,
  debt,
  transactions,
  today,
  onEdit,
}: {
  goal: LifeGoal
  fund: SavingsFund | undefined
  debt: OwedDebt | undefined
  transactions: readonly Transaction[]
  today: ISODate
  onEdit: () => void
}) {
  const f = useFormat()
  const undoToast = useUndoToast()
  const isDone = goal.status === 'done'
  const status = GOAL_STATUS[goal.status]
  const next: LifeGoalStatus = goal.status === 'todo' ? 'doing' : 'done'

  return (
    <li className={cx('p-5', STATUS_CARD[goal.status])}>
      <div className="flex items-start gap-3">
        <IconTile icon={status.icon ?? 'check'} tone={status.tone} round />
        <div className="min-w-0 flex-1">
          <h3 className={cx('font-semibold break-words', isDone && 'text-muted')}>{goal.title}</h3>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
            {/* No glyph in the badge: the disc beside the title already shows it. */}
            <StatusBadge status={status} icon={false} />
            {isDone && goal.doneAt
              ? f.month(goal.doneAt.slice(0, 10))
              : goal.targetDate
                ? `${goal.targetDate < today ? 'Hoped for' : 'Aiming for'} ${f.month(goal.targetDate)}`
                : ''}
          </p>
          {goal.why && (
            <p className="mt-2 line-clamp-3 text-body break-words whitespace-pre-wrap">
              {goal.why}
            </p>
          )}
        </div>
        <IconButton
          icon="edit"
          size="sm"
          label={`Edit ${goal.title}`}
          onClick={onEdit}
          className="-my-1 -mr-3"
        />
      </div>
      {!isDone && (fund || debt) && (
        <GoalLink fund={fund} debt={debt} transactions={transactions} f={f} />
      )}
      {!isDone && (
        <div className="mt-3 flex justify-end">
          <Button
            variant="ghost"
            icon={next === 'done' ? 'check' : 'circleHalf'}
            onClick={() =>
              void setLifeGoalStatus(goal.id, next).then(() =>
                undoToast(
                  next === 'done' ? `${goal.title}: done. Well done.` : 'Marked in progress',
                  next === 'done' ? { tone: 'success' } : undefined,
                ),
              )
            }
          >
            {next === 'done' ? 'Mark done' : 'Start it'}
          </Button>
        </div>
      )}
    </li>
  )
}

/** The fund or debt a goal leans on, with how far along it is. */
function GoalLink({
  fund,
  debt,
  transactions,
  f,
}: {
  fund: SavingsFund | undefined
  debt: OwedDebt | undefined
  transactions: readonly Transaction[]
  f: Formatters
}) {
  if (fund) {
    const saved = fundSaved(fund, transactions)
    return (
      <div className="mt-3 rounded-2xl bg-bg px-3.5 py-2.5 text-sm">
        <div className="flex justify-between gap-3">
          <span className="truncate text-muted">Fund · {fund.name}</span>
          <span className="shrink-0 tabular-nums">
            {f.money(saved)}
            {fund.target !== undefined && (
              <span className="text-muted"> of {f.money(fund.target)}</span>
            )}
          </span>
        </div>
        {fund.target !== undefined && fund.target > 0 && (
          <ProgressBar
            value={fundProgress(saved, fund.target)}
            label={`${fund.name} progress`}
            color={DATA_COLOR.savings}
            className="mt-2"
          />
        )}
      </div>
    )
  }
  if (!debt) return null
  const paid = Math.max(0, debt.originalBalance - debt.owed)
  return (
    <div className="mt-3 rounded-2xl bg-bg px-3.5 py-2.5 text-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="truncate text-muted">Debt · {debt.name}</span>
        {debt.owed <= 0 ? (
          <StatusBadge status={TAG.paidOff} />
        ) : (
          <span className="shrink-0 tabular-nums">{f.money(debt.owed)} left</span>
        )}
      </div>
      {debt.originalBalance > 0 && (
        <ProgressBar
          value={Math.min(1, paid / debt.originalBalance)}
          label={`${debt.name} paid off`}
          color={DATA_COLOR.debt}
          className="mt-2"
        />
      )}
    </div>
  )
}

function GoalForm({
  goal,
  funds,
  debts,
  today,
  onDone,
}: {
  goal?: LifeGoal
  funds: readonly SavingsFund[]
  debts: readonly Debt[]
  today: ISODate
  onDone: () => void
}) {
  const f = useFormat()
  const undoToast = useUndoToast()
  const titleId = useId()
  const whyId = useId()
  const linkId = useId()
  const [title, setTitle] = useState(goal?.title ?? '')
  const [why, setWhy] = useState(goal?.why ?? '')
  const [targetDate, setTargetDate] = useState(goal?.targetDate ?? '')
  const [status, setStatus] = useState<LifeGoalStatus>(goal?.status ?? 'todo')
  // One select for both: "fund:<id>" or "debt:<id>". A goal leans on one thing at most.
  // A link to a fund or debt that has since been deleted starts as "Nothing".
  const [link, setLink] = useState(
    goal?.fundId && funds.some((x) => x.id === goal.fundId)
      ? `fund:${goal.fundId}`
      : goal?.debtId && debts.some((x) => x.id === goal.debtId)
        ? `debt:${goal.debtId}`
        : '',
  )
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    const [kind, id] = link.split(':')
    const input: LifeGoalInput = {
      title,
      why,
      status,
      targetDate: targetDate || undefined,
      fundId: kind === 'fund' ? id : undefined,
      debtId: kind === 'debt' ? id : undefined,
    }
    setBusy(true)
    try {
      if (goal) await updateLifeGoal(goal.id, input)
      else await addLifeGoal(input)
      undoToast(goal ? `Saved ${title.trim()}` : `Added ${title.trim()}`)
      onDone()
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!goal) return
    await deleteLifeGoal(goal.id)
    undoToast(`Deleted ${goal.title}`)
    onDone()
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-5 pb-4">
      <Field id={titleId} label="Goal">
        <input
          id={titleId}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={LIFE_GOAL_TITLE_MAX}
          placeholder="Move somewhere with a garden"
          autoComplete="off"
          className={inputClass}
        />
      </Field>
      <Field id={whyId} label="Why it matters (optional)">
        <textarea
          id={whyId}
          value={why}
          onChange={(e) => setWhy(e.target.value)}
          maxLength={LIFE_GOAL_WHY_MAX}
          rows={3}
          placeholder="More room, less noise. Somewhere the kids can play outside."
          className={cx(inputClass, 'resize-y py-3 leading-relaxed')}
        />
      </Field>
      <Segmented<LifeGoalStatus>
        label="Where it stands"
        value={status}
        onChange={setStatus}
        options={STATUS_OPTIONS}
      />
      <DateInput
        format={f.dayFull}
        label="Aiming for (optional)"
        value={targetDate}
        onChange={setTargetDate}
        min={goal?.targetDate && goal.targetDate < today ? undefined : today}
        hint="A rough date is plenty. Nothing nags if it moves."
      />
      {(funds.length > 0 || debts.length > 0) && (
        <Field id={linkId} label="Linked to (optional)" hint="Its progress shows with the goal.">
          <select
            id={linkId}
            value={link}
            onChange={(e) => setLink(e.target.value)}
            className={`${inputClass} appearance-none`}
          >
            <option value="">Nothing</option>
            {funds.length > 0 && (
              <optgroup label="Savings funds">
                {funds.map((x) => (
                  <option key={x.id} value={`fund:${x.id}`}>
                    {x.name}
                  </option>
                ))}
              </optgroup>
            )}
            {debts.length > 0 && (
              <optgroup label="Debts">
                {debts.map((x) => (
                  <option key={x.id} value={`debt:${x.id}`}>
                    {x.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </Field>
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        {goal ? (
          <Button variant="quiet" icon="trash" onClick={() => void remove()}>
            Delete goal
          </Button>
        ) : (
          <span />
        )}
        <Button type="submit" disabled={!title.trim() || busy}>
          {goal ? 'Save' : 'Add goal'}
        </Button>
      </div>
    </form>
  )
}
