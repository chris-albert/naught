import type { BudgetFile, Category, Cents, MonthKey } from './types'

/** Shortfall against a category's monthly target given what is assigned to it, if it has one. */
export function targetShortfall(category: Category, assigned: Cents): Cents {
  const { target } = category
  return target === undefined ? 0 : Math.max(0, target - assigned)
}

/** Assign the category its target shortfall for `month` from To budget. Unchanged when it has no target or is already funded. */
export function assignTarget(file: BudgetFile, month: MonthKey, categoryId: string): BudgetFile {
  const category = file.categories.find((c) => c.id === categoryId)
  if (!category) return file
  const assigned = file.assigned[month] ?? {}
  const toGo = targetShortfall(category, assigned[categoryId] ?? 0)
  if (toGo === 0) return file
  return { ...file, assigned: { ...file.assigned, [month]: { ...assigned, [categoryId]: (assigned[categoryId] ?? 0) + toGo } } }
}

/** Assign every category in the group its target for `month` in one step; see assignTarget. */
export function assignGroupTargets(file: BudgetFile, month: MonthKey, groupId: string): BudgetFile {
  return file.categories.filter((c) => c.groupId === groupId).reduce((f, c) => assignTarget(f, month, c.id), file)
}
