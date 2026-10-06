import { computeMonth } from './budgetMath'
import { addMonths } from './dates'
import { avg, spendingCategories, sum } from './ledger'
import { buildReport, type MonthSummary, type Report } from './reports'
import type { BudgetFile, Category, Cents, MonthKey } from './types'

/** Each entry averaged with up to `window - 1` of the values before it, so a single odd month is smoothed out. */
export function rollingAverage(values: Cents[], window = 3): Cents[] {
  return values.map((_, i) => avg(values.slice(Math.max(0, i - window + 1), i + 1)))
}

/** (income - living) / income per month; null for a month with no income. */
export function savingsRateByMonth(summaries: MonthSummary[]): (number | null)[] {
  return summaries.map((s) => (s.income > 0 ? (s.income - s.living) / s.income : null))
}

export interface CategoryDirection {
  category: Category
  byMonth: Cents[]
  average: Cents
  /** Average of the earlier part of the range. */
  earlierAvg: Cents
  /** Average of the later part of the range. */
  recentAvg: Cents
  /** recentAvg - earlierAvg */
  shift: Cents
  /** shift as a share of earlierAvg; null when nothing was spent earlier. */
  pct: number | null
}

/**
 * How each living category is moving: the later half of the range against the earlier
 * half, the same split the trend page uses. Biggest moves first.
 */
export function categoryDirections(report: Report): CategoryDirection[] {
  const n = report.months.length
  const half = Math.floor(n / 2)
  return report.groups
    .flatMap((g) => g.categories)
    .filter((c) => !c.category.reserve && c.total > 0)
    .map((c) => {
      const earlierAvg = half === 0 ? 0 : avg(c.byMonth.slice(0, n - half))
      const recentAvg = half === 0 ? 0 : avg(c.byMonth.slice(n - half))
      const shift = recentAvg - earlierAvg
      return { category: c.category, byMonth: c.byMonth, average: c.average, earlierAvg, recentAvg, shift, pct: earlierAvg > 0 ? shift / earlierAvg : null }
    })
    .sort((a, b) => Math.abs(b.shift) - Math.abs(a.shift))
}

export interface Comparison {
  now: Cents
  before: Cents
  change: Cents
}

export interface YearOverYear {
  month: MonthKey
  lastYear: MonthKey
  /** Whether the month a year ago had any income or living spending. */
  hasLastYear: boolean
  totals: { income: Comparison; living: Comparison; net: Comparison }
  categories: { category: Category; now: Cents; before: Cents; change: Cents }[]
}

/** One month against the same month a year earlier, totals and category by category. Biggest changes first. */
export function sameMonthLastYear(file: BudgetFile, month: MonthKey): YearOverYear {
  const lastYear = addMonths(month, -12)
  const report = buildReport(file, [lastYear, month])
  const [before, now] = report.summaries
  const compare = (a: Cents, b: Cents): Comparison => ({ now: b, before: a, change: b - a })
  const categories = report.groups
    .flatMap((g) => g.categories)
    .filter((c) => c.byMonth[0] !== 0 || c.byMonth[1] !== 0)
    .map((c) => ({ category: c.category, now: c.byMonth[1], before: c.byMonth[0], change: c.byMonth[1] - c.byMonth[0] }))
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
  return {
    month,
    lastYear,
    hasLastYear: before.income !== 0 || before.living !== 0,
    totals: { income: compare(before.income, now.income), living: compare(before.living, now.living), net: compare(before.net, now.net) },
    categories,
  }
}

export interface PlanMonth {
  month: MonthKey
  /** Assigned to living (non-reserve) categories. */
  assigned: Cents
  /** Living spending from the report. */
  spent: Cents
  /** assigned - spent */
  difference: Cents
  /** Living categories that ended the month with less than nothing available. */
  overspent: number
}

/** What was planned against what was spent, month by month. */
export function planVsActual(file: BudgetFile, months: MonthKey[]): PlanMonth[] {
  const living = [...spendingCategories(file).values()].filter((c) => !c.reserve)
  const livingIds = new Set(living.map((c) => c.id))
  const report = buildReport(file, months)
  return months.map((month, i) => {
    const assigned = sum(living.map((c) => file.assigned[month]?.[c.id] ?? 0))
    const spent = report.summaries[i].living
    const overspent = computeMonth(file, month)
      .groups.flatMap((g) => g.rows)
      .filter((r) => livingIds.has(r.category.id) && r.available < 0).length
    return { month, assigned, spent, difference: assigned - spent, overspent }
  })
}
