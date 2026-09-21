import { CREDIT_CARD_PAYMENTS_GROUP, type BudgetFile } from './types'

/**
 * Every on-budget credit account needs a payment category. Link by name to an
 * existing one in the "Credit Card Payments" group (what a YNAB import gives
 * us), otherwise create it. Returns the same object when nothing changed.
 */
export function ensurePaymentCategories(file: BudgetFile): BudgetFile {
  const needs = file.accounts.filter(
    (a) => a.type === 'credit' && a.onBudget && !(a.paymentCategoryId && file.categories.some((c) => c.id === a.paymentCategoryId)),
  )
  if (needs.length === 0) return file

  let categoryGroups = file.categoryGroups
  let group = categoryGroups.find((g) => g.name === CREDIT_CARD_PAYMENTS_GROUP)
  if (!group) {
    group = { id: crypto.randomUUID(), name: CREDIT_CARD_PAYMENTS_GROUP, hidden: false }
    categoryGroups = [...categoryGroups, group]
  }
  const groupId = group.id

  const categories = [...file.categories]
  const taken = new Set(file.accounts.map((a) => a.paymentCategoryId).filter(Boolean))
  const accounts = file.accounts.map((a) => {
    if (!needs.includes(a)) return a
    let cat = categories.find((c) => c.groupId === groupId && c.name === a.name && !taken.has(c.id))
    if (!cat) {
      cat = { id: crypto.randomUUID(), groupId, name: a.name, hidden: a.closed }
      categories.push(cat)
    }
    taken.add(cat.id)
    return { ...a, paymentCategoryId: cat.id }
  })

  return { ...file, accounts, categoryGroups, categories }
}
