import { paydayOverrideId, type Id, type IncomeSource, type ISODate } from '../../domain/types'
import { db } from '../schema'
import { mutate, type Writer } from '../undo'
import { NotFoundError, newId, patchRow } from './util'

export const getIncome = (id: Id) => db.incomes.get(id)
export const listIncomes = () => db.incomes.toArray()
export const listPaydayOverrides = (incomeId?: Id) =>
  incomeId === undefined
    ? db.paydayOverrides.toArray()
    : db.paydayOverrides.where('incomeId').equals(incomeId).toArray()

async function load(w: Writer, id: Id) {
  const row = await w.get('incomes', id)
  if (!row) throw new NotFoundError('incomes', id)
  return row
}

// Pay periods come from the ONE primary income (PLAN §3.6), so marking one primary
// demotes the rest in the same transaction.
async function demoteOthers(w: Writer, keep: Id) {
  for (const other of await db.incomes.toArray()) {
    if (other.id !== keep && other.primary) await w.put('incomes', { ...other, primary: false })
  }
}

export function addIncome(input: Omit<IncomeSource, 'id'>) {
  return mutate('Add income', ['incomes'], async (w) => {
    const first = (await db.incomes.count()) === 0
    const income: IncomeSource = { ...input, id: newId(), primary: input.primary || first }
    await w.put('incomes', income)
    if (income.primary) await demoteOthers(w, income.id)
    return income
  })
}

export function updateIncome(id: Id, patch: Partial<Omit<IncomeSource, 'id'>>) {
  return mutate('Edit income', ['incomes'], async (w) => {
    const next = patchRow(await load(w, id), patch)
    await w.put('incomes', next)
    if (next.primary) await demoteOthers(w, id)
    return next
  })
}

export const setPrimaryIncome = (id: Id) => updateIncome(id, { primary: true })

/** Hard delete (incomes have no Recently deleted); overrides go with it, undo brings both back. */
export function deleteIncome(id: Id) {
  return mutate('Delete income', ['incomes', 'paydayOverrides'], async (w) => {
    const income = await load(w, id)
    await w.delete('incomes', id)
    for (const o of await listPaydayOverrides(id)) await w.delete('paydayOverrides', o.id)
    if (income.primary) {
      const next =
        (await db.incomes.toArray()).find((i) => i.active) ??
        (await db.incomes.toCollection().first())
      if (next) await w.put('incomes', { ...next, primary: true })
    }
  })
}

/** Moves one payday (holiday, early pay). Same date as the original clears the override. */
export function setPaydayOverride(incomeId: Id, originalDate: ISODate, date: ISODate) {
  return mutate('Move payday', ['incomes', 'paydayOverrides'], async (w) => {
    await load(w, incomeId)
    const id = paydayOverrideId(incomeId, originalDate)
    if (date === originalDate) await w.delete('paydayOverrides', id)
    else await w.put('paydayOverrides', { id, incomeId, originalDate, date })
  })
}

export function clearPaydayOverride(incomeId: Id, originalDate: ISODate) {
  return mutate('Reset payday', ['paydayOverrides'], (w) =>
    w.delete('paydayOverrides', paydayOverrideId(incomeId, originalDate)),
  )
}
