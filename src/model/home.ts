import { computeMonth, type CategoryRow } from './budgetMath'
import { monthOf } from './dates'
import { netWorthHistory } from './netWorth'
import { reconcile, type Reconciliation } from './reconcile'
import { monthRange } from './reports'
import { isUncategorized } from './splits'
import { targetShortfall } from './targets'
import type { BudgetFile, Cents, MonthKey, Transaction } from './types'

const RECENT = 8

/** What the Home page leads with: where the budget stands today and what is waiting on you. */
export interface Home {
  month: MonthKey
  toBudget: Cents
  /** Transactions still needing a category, in any account. */
  uncategorized: number
  /** Categories with a negative balance this month, worst first. */
  overspent: CategoryRow[]
  /** Visible categories assigned less than their target this month, and how much they are short in total. */
  underfunded: { count: number; total: Cents }
  /** Open accounts whose cleared balance does not tie out to what the bank reported. */
  unmatched: Reconciliation[]
  netWorth: Cents
  /** Net worth now minus net worth at the end of last month. */
  netWorthChange: Cents
  /** The latest transactions dated today or earlier, newest first. */
  recent: Transaction[]
}

export function buildHome(file: BudgetFile, today: string): Home {
  const month = monthOf(today)
  const budget = computeMonth(file, month, month)
  const rows = budget.groups.flatMap((g) => g.rows)

  const shortfalls = rows.filter((r) => !r.category.hidden).map((r) => targetShortfall(r.category, r.assigned)).filter((s) => s > 0)
  const worth = netWorthHistory(file, monthRange(month, 2))

  return {
    month,
    toBudget: budget.toBudget,
    uncategorized: file.transactions.filter(isUncategorized).length,
    overspent: rows.filter((r) => r.available < 0).sort((a, b) => a.available - b.available),
    underfunded: { count: shortfalls.length, total: shortfalls.reduce((t, s) => t + s, 0) },
    unmatched: file.accounts
      .filter((a) => !a.closed)
      .map((a) => reconcile(file, a.id))
      .filter((r): r is Reconciliation => r !== null && r.difference !== 0),
    netWorth: worth.net,
    netWorthChange: worth.changeLastMonth,
    recent: file.transactions
      .filter((t) => t.date <= today)
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
      .slice(0, RECENT),
  }
}
