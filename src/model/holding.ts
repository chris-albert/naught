import { monthOf } from './dates'
import { INCOME_CATEGORY_ID, type BudgetFile, type Cents } from './types'

export interface HoldingPreview {
  transactions: number
  total: Cents
  months: number
}

/** What convertHoldingCategory would touch. */
/** Inflows on credit cards are refunds, not income; they stay put so the card's payment envelope is unaffected. */
function eligible(file: BudgetFile, categoryId: string) {
  const credit = new Set(file.accounts.filter((a) => a.type === 'credit').map((a) => a.id))
  return (t: BudgetFile['transactions'][number]) =>
    t.categoryId === categoryId && !t.transferAccountId && t.amount > 0 && !credit.has(t.accountId)
}

export function previewHoldingConversion(file: BudgetFile, categoryId: string): HoldingPreview {
  const months = new Set<string>()
  const isEligible = eligible(file, categoryId)
  let transactions = 0
  let total = 0
  for (const t of file.transactions) {
    if (!isEligible(t)) continue
    transactions++
    total += t.amount
    months.add(monthOf(t.date))
  }
  return { transactions, total, months: months.size }
}

/**
 * Rewrite history for a category that was used as an income holding pen
 * (YNAB "Buffer" style): every inflow into it becomes Income, and the same
 * amount is assigned to the category in that month. Every category balance
 * and every month's To Budget are unchanged; only where the money is
 * *reported* changes. Releases (negative assignments) are left as they are.
 */
export function convertHoldingCategory(file: BudgetFile, categoryId: string): BudgetFile {
  const byMonth = new Map<string, Cents>()
  const isEligible = eligible(file, categoryId)
  const transactions = file.transactions.map((t) => {
    if (!isEligible(t)) return t
    const m = monthOf(t.date)
    byMonth.set(m, (byMonth.get(m) ?? 0) + t.amount)
    return { ...t, categoryId: INCOME_CATEGORY_ID }
  })
  const assigned = { ...file.assigned }
  for (const [m, amount] of byMonth) {
    assigned[m] = { ...(assigned[m] ?? {}), [categoryId]: (assigned[m]?.[categoryId] ?? 0) + amount }
  }
  return { ...file, transactions, assigned }
}
