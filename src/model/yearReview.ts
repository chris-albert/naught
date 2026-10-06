import { monthOf } from './dates'
import { countedLines, spendingCategories, sum } from './ledger'
import { buildReport, type MonthSummary } from './reports'
import { INCOME_CATEGORY_ID, type BudgetFile, type Category, type Cents, type MonthKey } from './types'

export interface YearTotals {
  income: Cents
  living: Cents
  setAside: Cents
  drawn: Cents
  net: Cents
  /** (income - living) / income, or null without income. */
  savingsRate: number | null
  /** Months with any income or living spending. */
  monthsCounted: number
}

export interface MonthValue {
  month: MonthKey
  value: Cents
}

export interface YearCategory {
  category: Category
  total: Cents
  average: Cents
  /** Share of the year's living spending, 0..1. */
  share: number
}

export interface YearPayee {
  payee: string
  total: Cents
  average: Cents
  count: number
}

export interface CategoryChange {
  category: Category
  thisYear: Cents
  priorYear: Cents
  change: Cents
}

export interface YearReview {
  year: number
  months: MonthKey[]
  /** The current year, cut off at the current month. */
  partial: boolean
  summaries: MonthSummary[]
  totals: YearTotals
  bestMonth: MonthValue | null
  worstMonth: MonthValue | null
  biggestSpend: MonthValue | null
  topCategories: YearCategory[]
  topPayees: YearPayee[]
  /** The year before, over the same calendar months; null when it had no activity. */
  priorYear: YearTotals | null
  categoryChanges: { up: CategoryChange[]; down: CategoryChange[] }
  /** Every calendar year with counted activity, ascending. */
  years: number[]
}

const TOP = 10
const CHANGES = 5

/** Calendar months of `year` up to `through` (inclusive) when that month falls inside the year. */
function yearMonths(year: number, through: MonthKey): MonthKey[] {
  const out: MonthKey[] = []
  for (let m = 1; m <= 12; m++) {
    const key = `${year}-${String(m).padStart(2, '0')}`
    if (key > through) break
    out.push(key)
  }
  return out
}

function totalsOf(summaries: MonthSummary[]): YearTotals {
  const income = sum(summaries.map((s) => s.income))
  const living = sum(summaries.map((s) => s.living))
  return {
    income,
    living,
    setAside: sum(summaries.map((s) => s.setAside)),
    drawn: sum(summaries.map((s) => s.drawn)),
    net: sum(summaries.map((s) => s.net)),
    savingsRate: income > 0 ? (income - living) / income : null,
    monthsCounted: summaries.filter((s) => s.income > 0 || s.living > 0).length,
  }
}

/**
 * One calendar year of the budget: totals, the months that stood out, where the
 * money went, and how it compares with the year before over the same months.
 * Follows the Reports rules (on-budget accounts, transfers ignored, reserves as
 * set aside and drawn, split lines counted separately).
 */
export function buildYearReview(file: BudgetFile, year: number, today: string): YearReview {
  const thisMonth = monthOf(today)
  const months = yearMonths(year, thisMonth)
  const partial = months.length > 0 && months.length < 12 && monthOf(today).startsWith(`${year}-`)
  const report = buildReport(file, months)
  const totals = totalsOf(report.summaries)

  const counted = report.summaries.filter((s) => s.income > 0 || s.living > 0)
  const extreme = (pick: (s: MonthSummary) => Cents, better: (a: Cents, b: Cents) => boolean): MonthValue | null => {
    let best: MonthSummary | null = null
    for (const s of counted) if (!best || better(pick(s), pick(best))) best = s
    return best ? { month: best.month, value: pick(best) } : null
  }
  const bestMonth = extreme((s) => s.net, (a, b) => a > b)
  const worstMonth = extreme((s) => s.net, (a, b) => a < b)
  const biggestSpend = extreme((s) => s.living, (a, b) => a > b)

  const perMonth = (total: Cents) => (counted.length ? Math.round(total / counted.length) : 0)
  const categoryTotals = report.groups.flatMap((g) => g.categories)
  const topCategories: YearCategory[] = categoryTotals
    .filter((c) => !c.category.reserve && c.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, TOP)
    .map((c) => ({ category: c.category, total: c.total, average: perMonth(c.total), share: totals.living > 0 ? c.total / totals.living : 0 }))

  const categories = spendingCategories(file)
  const inYear = new Set(months)
  const payees = new Map<string, YearPayee>()
  for (const t of countedLines(file)) {
    if (!inYear.has(monthOf(t.date)) || !t.payee) continue
    if (t.categoryId === INCOME_CATEGORY_ID || (t.categoryId && !categories.has(t.categoryId))) continue
    let p = payees.get(t.payee)
    if (!p) payees.set(t.payee, (p = { payee: t.payee, total: 0, average: 0, count: 0 }))
    p.total -= t.amount
    p.count++
  }
  const topPayees = [...payees.values()]
    .filter((p) => p.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, TOP)
    .map((p) => ({ ...p, average: perMonth(p.total) }))

  const priorMonths = months.map((m) => `${year - 1}${m.slice(4)}`)
  const priorReport = buildReport(file, priorMonths)
  const priorTotals = totalsOf(priorReport.summaries)
  const priorYear = priorTotals.monthsCounted > 0 ? priorTotals : null

  let categoryChanges: YearReview['categoryChanges'] = { up: [], down: [] }
  if (priorYear) {
    const prior = new Map(priorReport.groups.flatMap((g) => g.categories).map((c) => [c.category.id, c.total]))
    const changes: CategoryChange[] = categoryTotals
      .map((c) => ({ category: c.category, thisYear: c.total, priorYear: prior.get(c.category.id) ?? 0, change: c.total - (prior.get(c.category.id) ?? 0) }))
      .filter((c) => c.change !== 0)
    categoryChanges = {
      up: changes.filter((c) => c.change > 0).sort((a, b) => b.change - a.change).slice(0, CHANGES),
      down: changes.filter((c) => c.change < 0).sort((a, b) => a.change - b.change).slice(0, CHANGES),
    }
  }

  const years = [...new Set(countedLines(file).map((t) => Number(t.date.slice(0, 4))))].sort((a, b) => a - b)

  return { year, months, partial, summaries: report.summaries, totals, bestMonth, worstMonth, biggestSpend, topCategories, topPayees, priorYear, categoryChanges, years }
}
