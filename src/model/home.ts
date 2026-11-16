import { computeMonth, type CategoryRow } from './budgetMath'
import { monthOf } from './dates'
import { avg, countedLines, dayOf, daysInMonth, spendingCategories } from './ledger'
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

/** Living spending as it adds up through the month, against how it usually adds up. */
export interface SpendingCurve {
  /** Net living spending through each day of the month so far; index 0 is the 1st, the last is today. */
  actual: Cents[]
  /** The same through each day of the month, averaged over the earlier months that had spending. Empty without any. */
  usual: Cents[]
}

/**
 * Counts what the reports count as living spending (see ledger.ts), refunds netted
 * out, reserves left out. A short month holds its final total through the days it
 * does not have, so the 31st of the average is every month's full total.
 */
export function spendingCurve(file: BudgetFile, today: string, window = 12): SpendingCurve {
  const month = monthOf(today)
  const months = monthRange(month, window + 1)
  const index = new Map(months.map((m, i) => [m, i]))
  const categories = spendingCategories(file)
  const through = months.map(() => new Array<Cents>(31).fill(0))

  for (const t of countedLines(file)) {
    const i = index.get(monthOf(t.date))
    if (i === undefined || !t.categoryId) continue
    const category = categories.get(t.categoryId)
    if (!category || category.reserve) continue
    through[i][dayOf(t.date) - 1] -= t.amount
  }
  for (const days of through) for (let d = 1; d < days.length; d++) days[d] += days[d - 1]

  const earlier = through.slice(0, -1).filter((days) => days[30] > 0)
  return {
    actual: through[through.length - 1].slice(0, dayOf(today)),
    usual: earlier.length ? Array.from({ length: daysInMonth(month) }, (_, d) => avg(earlier.map((days) => days[d]))) : [],
  }
}
