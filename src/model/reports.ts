import { addMonths, monthOf } from './dates'
import { INCOME_CATEGORY_ID, type BudgetFile, type Category, type CategoryGroup, type Cents, type MonthKey } from './types'

export interface MonthSummary {
  month: MonthKey
  /** Income category plus money that arrived directly in categories (a paycheck parked in Buffer). */
  income: Cents
  /** Net money out of non-reserve categories. */
  living: Cents
  /** Money moved into reserves this month: assigned to reserve categories plus inflows landing in them. Can be negative when reserves are released. */
  setAside: Cents
  /** Money spent out of reserve categories. Not counted against the month. */
  drawn: Cents
  /** income - living - setAside */
  net: Cents
  cumulativeNet: Cents
  uncategorized: number
}

export interface CategoryReport {
  category: Category
  /** Net money out per month, aligned with `months`. Negative = net money in. */
  byMonth: Cents[]
  total: Cents
  average: Cents
  /** Last month minus the average of the months before it. */
  deltaVsAverage: Cents
}

export interface GroupReport {
  group: CategoryGroup
  categories: CategoryReport[]
  byMonth: Cents[]
  total: Cents
  average: Cents
}

export interface Report {
  months: MonthKey[]
  summaries: MonthSummary[]
  groups: GroupReport[]
  avgIncome: Cents
  avgLiving: Cents
  avgSetAside: Cents
  avgNet: Cents
  /** (income - living) / income: the share of income not spent on living, or null without income. */
  savingsRate: number | null
  /** Non-reserve categories with the biggest swing last month versus their earlier average. */
  movers: CategoryReport[]
}

export function monthRange(end: MonthKey, count: number): MonthKey[] {
  const out: MonthKey[] = []
  for (let i = count - 1; i >= 0; i--) out.push(addMonths(end, -i))
  return out
}

/**
 * Month-by-month report for on-budget accounts.
 *
 * Categories are either living or reserve. Living spending is the net outflow of
 * living categories (refunds reduce it). Money entering any category directly
 * counts as income. Reserves are sinking funds: assigning to them (or money
 * landing in them) is "set aside" and counts against the month; spending from
 * them is a "draw" that was already paid for when it was set aside. Credit card
 * payment categories are excluded, and so are transfers between your own
 * accounts even when categorized (moving money to an investment account is not
 * spending, and moving it back is not income).
 */
export function buildReport(file: BudgetFile, months: MonthKey[]): Report {
  const index = new Map(months.map((m, i) => [m, i]))
  const onBudget = new Set(file.accounts.filter((a) => a.onBudget).map((a) => a.id))
  const paymentCategoryIds = new Set(file.accounts.map((a) => a.paymentCategoryId).filter(Boolean))
  const categories = file.categories.filter((c) => !paymentCategoryIds.has(c.id))
  const byId = new Map(categories.map((c) => [c.id, c]))

  const outflow = new Map<string, Cents[]>() // positive: money out
  const inflow = new Map<string, Cents[]>() // positive: money in
  for (const c of categories) {
    outflow.set(c.id, months.map(() => 0))
    inflow.set(c.id, months.map(() => 0))
  }
  const incomeCat = months.map(() => 0)
  const uncategorized = months.map(() => 0)

  for (const t of file.transactions) {
    if (!onBudget.has(t.accountId) || t.transferAccountId) continue
    const i = index.get(monthOf(t.date))
    if (i === undefined) continue
    if (t.categoryId === INCOME_CATEGORY_ID) {
      if (t.payee !== 'Starting Balance') incomeCat[i] += t.amount
    } else if (t.categoryId && byId.has(t.categoryId)) {
      if (t.amount < 0) outflow.get(t.categoryId)![i] -= t.amount
      else inflow.get(t.categoryId)![i] += t.amount
    } else if (!t.categoryId && !t.transferAccountId) {
      uncategorized[i]++
    }
  }

  const categoryReport = (c: Category): CategoryReport => {
    const byMonth = months.map((_, i) => outflow.get(c.id)![i] - inflow.get(c.id)![i])
    return { category: c, byMonth, total: sum(byMonth), average: avg(byMonth), deltaVsAverage: lastVsPrior(byMonth) }
  }

  const groups: GroupReport[] = file.categoryGroups
    .map((group) => {
      const cats = categories.filter((c) => c.groupId === group.id).map(categoryReport)
      const byMonth = months.map((_, i) => sum(cats.map((c) => c.byMonth[i])))
      return { group, categories: cats, byMonth, total: sum(byMonth), average: avg(byMonth) }
    })
    .filter((g) => g.categories.length > 0)

  const living = categories.filter((c) => !c.reserve)
  const reserves = categories.filter((c) => c.reserve)

  const summaries: MonthSummary[] = []
  let cumulative = 0
  months.forEach((month, i) => {
    // living: net per category; a net inflow into a living category is income
    let livingOut = 0
    let livingIn = 0
    for (const c of living) {
      const net = outflow.get(c.id)![i] - inflow.get(c.id)![i]
      if (net >= 0) livingOut += net
      else livingIn -= net
    }
    let reserveIn = 0
    let drawn = 0
    let reserveAssigned = 0
    for (const c of reserves) {
      reserveIn += inflow.get(c.id)![i]
      drawn += outflow.get(c.id)![i]
      reserveAssigned += file.assigned[month]?.[c.id] ?? 0
    }
    const income = incomeCat[i] + livingIn + reserveIn
    const setAside = reserveAssigned + reserveIn
    const net = income - livingOut - setAside
    cumulative += net
    summaries.push({ month, income, living: livingOut, setAside, drawn, net, cumulativeNet: cumulative, uncategorized: uncategorized[i] })
  })

  const avgIncome = avg(summaries.map((s) => s.income))
  const avgLiving = avg(summaries.map((s) => s.living))
  const reserveIds = new Set(reserves.map((c) => c.id))
  const movers = groups
    .flatMap((g) => g.categories)
    .filter((c) => !reserveIds.has(c.category.id) && c.total > 0)
    .sort((a, b) => Math.abs(b.deltaVsAverage) - Math.abs(a.deltaVsAverage))
    .slice(0, 6)

  return {
    months,
    summaries,
    groups,
    avgIncome,
    avgLiving,
    avgSetAside: avg(summaries.map((s) => s.setAside)),
    avgNet: avg(summaries.map((s) => s.net)),
    savingsRate: avgIncome > 0 ? (avgIncome - avgLiving) / avgIncome : null,
    movers,
  }
}

function sum(xs: number[]): number {
  let t = 0
  for (const x of xs) t += x
  return t
}

function avg(xs: number[]): number {
  return xs.length ? Math.round(sum(xs) / xs.length) : 0
}

function lastVsPrior(xs: number[]): number {
  if (xs.length < 2) return 0
  return xs[xs.length - 1] - avg(xs.slice(0, -1))
}
