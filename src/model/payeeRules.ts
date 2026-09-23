import type { BudgetFile, Transaction } from './types'

/**
 * Payee rules: "transactions from this payee always get this category".
 * They fill in the category of uncategorized transactions (never transfers)
 * when a rule is created and when the bank sync inserts new transactions.
 */

export function categoryForPayee(file: BudgetFile, payee: string): string | null {
  return file.payeeRules?.[payee] ?? null
}

const needsCategory = (t: Transaction) => !t.categoryId && !t.transferAccountId

/** Transactions a rule for `payee` would categorize right now. */
export function uncategorizedFrom(file: BudgetFile, payee: string): Transaction[] {
  return file.transactions.filter((t) => needsCategory(t) && t.payee === payee)
}

/** Categorize every uncategorized transaction whose payee has a rule. */
export function applyPayeeRules(file: BudgetFile): BudgetFile {
  if (!file.payeeRules) return file
  let changed = false
  const transactions = file.transactions.map((t) => {
    const categoryId = needsCategory(t) ? categoryForPayee(file, t.payee) : null
    if (!categoryId) return t
    changed = true
    return { ...t, categoryId }
  })
  return changed ? { ...file, transactions } : file
}

/** Add or replace the rule for `payee` and apply it to existing uncategorized transactions. */
export function setPayeeRule(file: BudgetFile, payee: string, categoryId: string): BudgetFile {
  return applyPayeeRules({ ...file, payeeRules: { ...file.payeeRules, [payee]: categoryId } })
}

export function deletePayeeRule(file: BudgetFile, payee: string): BudgetFile {
  const { [payee]: _, ...rest } = file.payeeRules ?? {}
  return { ...file, payeeRules: rest }
}
