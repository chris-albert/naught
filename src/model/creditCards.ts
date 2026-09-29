import { CREDIT_CARD_PAYMENTS_GROUP, type BudgetFile } from './types'

/**
 * Every on-budget credit account needs a payment category. Link by name to an
 * existing one in the "Credit Card Payments" group (what a YNAB import gives
 * us), otherwise create it. A payment category is hidden exactly while its card
 * is closed, so the budget only lists active cards. Returns the same object
 * when nothing changed.
 */
export function ensurePaymentCategories(file: BudgetFile): BudgetFile {
  const needs = file.accounts.filter(
    (a) => a.type === 'credit' && a.onBudget && !(a.paymentCategoryId && file.categories.some((c) => c.id === a.paymentCategoryId)),
  )
  if (needs.length === 0) return syncHidden(file)

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

  return syncHidden({ ...file, accounts, categoryGroups, categories })
}

/** Hide the payment category of every closed card and show the ones of open cards. */
function syncHidden(file: BudgetFile): BudgetFile {
  const closedByCategory = new Map<string, boolean>()
  for (const a of file.accounts) if (a.type === 'credit' && a.onBudget && a.paymentCategoryId) closedByCategory.set(a.paymentCategoryId, a.closed)
  if (!file.categories.some((c) => closedByCategory.has(c.id) && c.hidden !== closedByCategory.get(c.id))) return file
  const categories = file.categories.map((c) => {
    const closed = closedByCategory.get(c.id)
    return closed === undefined || c.hidden === closed ? c : { ...c, hidden: closed }
  })
  return { ...file, categories }
}
