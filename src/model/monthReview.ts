import { computeMonth } from './budgetMath'
import { addMonths, monthOf } from './dates'
import { avg, countedLines, dayOf, daysInMonth, spendingCategories, sum } from './ledger'
import { buildReport, monthRange, type MonthSummary } from './reports'
import type { BudgetFile, Category, CategoryGroup, Cents, MonthKey, Transaction } from './types'

/** A figure for the month with how it compares to the month before and to the average of the earlier months. */
export interface Headline {
  value: Cents
  vsPrev: Cents
  vsAverage: Cents
}

export interface RateHeadline {
  value: number | null
  /** Difference in rate points (0.05 = five points); null when either side has no income. */
  vsPrev: number | null
  vsAverage: number | null
}

export interface Pace {
  livingSoFar: Cents
  /** What the month is heading for: spent so far plus what usually gets spent after this day of the month. */
  projected: Cents
  /** Average full-month living spending over the earlier months with data. */
  averageMonth: Cents
  daysLeft: number
  /** The same three figures per group and category, in budget order; groups and categories with nothing in any of them are left out. */
  groups: PaceGroup[]
}

export interface PaceFigures {
  soFar: Cents
  projected: Cents
  averageMonth: Cents
}

export interface PaceCategory extends PaceFigures {
  category: Category
}

export interface PaceGroup extends PaceFigures {
  group: CategoryGroup
  categories: PaceCategory[]
}

export interface BudgetRow {
  category: Category
  assigned: Cents
  activity: Cents
  available: Cents
}

export interface MissingUsual {
  category: Category
  /** Average net spending through `throughDay` in the earlier months that had some. */
  usual: Cents
}

export interface MonthReview {
  month: MonthKey
  prevMonth: MonthKey
  /** True when `month` is the one `today` falls in; the figures then only run through today. */
  current: boolean
  throughDay: number
  /** How many earlier months (up to 12) the averages are taken over. */
  comparedMonths: number
  income: Headline
  living: Headline
  setAside: Headline
  net: Headline
  savingsRate: RateHeadline
  pace: Pace | null
  budget: { assigned: Cents; spent: Cents; overspent: BudgetRow[] }
  missing: MissingUsual[]
  largest: Transaction[]
}

const WINDOW = 12

/**
 * One month in review: the headline numbers against the month before and the earlier
 * months' average, where the current month is heading, what the plan said versus what
 * happened, the usual spending that has not shown up, and the biggest single outflows.
 * A past month is read in full; the current one only through today.
 */
export function buildMonthReview(file: BudgetFile, month: MonthKey, today: string): MonthReview {
  const current = month === monthOf(today)
  const throughDay = current ? dayOf(today) : daysInMonth(month)
  const months = monthRange(month, WINDOW + 1)
  const report = buildReport(file, months, throughDay)
  const summaries = report.summaries
  const last = summaries[summaries.length - 1]
  const prev = summaries[summaries.length - 2]
  const earlier = summaries.slice(0, -1).filter(hasData)

  const headline = (pick: (s: MonthSummary) => Cents): Headline => ({
    value: pick(last),
    vsPrev: pick(last) - pick(prev),
    vsAverage: pick(last) - avg(earlier.map(pick)),
  })
  const rateOf = (s: MonthSummary) => (s.income > 0 ? (s.income - s.living) / s.income : null)
  const rate = rateOf(last)
  const prevRate = rateOf(prev)
  const earlierRates = earlier.map(rateOf).filter((r): r is number => r !== null)
  const avgRate = earlierRates.length ? earlierRates.reduce((t, r) => t + r, 0) / earlierRates.length : null
  const savingsRate: RateHeadline = {
    value: rate,
    vsPrev: rate !== null && prevRate !== null ? rate - prevRate : null,
    vsAverage: rate !== null && avgRate !== null ? rate - avgRate : null,
  }

  const categories = spendingCategories(file)
  const living = [...categories.values()].filter((c) => !c.reserve)
  const earlierMonths = new Set(earlier.map((s) => s.month))
  const index = new Map(months.map((m, i) => [m, i]))

  // Net spending per living category, through `throughDay` and for the whole month, for every month in range.
  const throughBy = new Map<string, Cents[]>()
  const fullBy = new Map<string, Cents[]>()
  for (const c of living) {
    throughBy.set(c.id, months.map(() => 0))
    fullBy.set(c.id, months.map(() => 0))
  }
  const thisMonth: Transaction[] = []
  for (const t of countedLines(file)) {
    const m = monthOf(t.date)
    if (m === month && t.amount < 0 && (!t.categoryId || categories.has(t.categoryId))) thisMonth.push(t)
    const i = index.get(m)
    if (i === undefined || !t.categoryId) continue
    const full = fullBy.get(t.categoryId)
    if (!full) continue
    full[i] -= t.amount
    if (dayOf(t.date) <= throughDay) throughBy.get(t.categoryId)![i] -= t.amount
  }
  const lastIndex = months.length - 1
  const earlierIndexes = months.map((_, i) => i).filter((i) => earlierMonths.has(months[i]))

  let pace: Pace | null = null
  if (current) {
    // Per category, the same way the summaries count living: a month's net inflow counts as income, not negative spending.
    const figures = (c: Category): PaceCategory => {
      const full = fullBy.get(c.id)!
      const through = throughBy.get(c.id)!
      const avgFull = avg(earlierIndexes.map((i) => full[i]))
      const avgThrough = avg(earlierIndexes.map((i) => through[i]))
      const soFar = Math.max(0, through[lastIndex])
      return {
        category: c,
        soFar,
        projected: soFar + Math.max(0, avgFull - avgThrough),
        averageMonth: avg(earlierIndexes.map((i) => Math.max(0, full[i]))),
      }
    }
    const groups: PaceGroup[] = []
    for (const g of file.categoryGroups) {
      const rows = living.filter((c) => c.groupId === g.id).map(figures).filter((r) => r.soFar || r.projected || r.averageMonth)
      if (!rows.length) continue
      groups.push({
        group: g,
        soFar: sum(rows.map((r) => r.soFar)),
        projected: sum(rows.map((r) => r.projected)),
        averageMonth: sum(rows.map((r) => r.averageMonth)),
        categories: rows,
      })
    }
    pace = {
      livingSoFar: last.living,
      projected: sum(groups.map((g) => g.projected)),
      averageMonth: avg(earlier.map((s) => s.living)),
      daysLeft: daysInMonth(month) - throughDay,
      groups,
    }
  }

  const missing: MissingUsual[] = []
  const recent = earlierIndexes.slice(-3)
  for (const c of living) {
    const through = throughBy.get(c.id)!
    if (through[lastIndex] !== 0 || recent.length < 2) continue
    const had = recent.filter((i) => through[i] > 0)
    if (had.length < 2) continue
    missing.push({ category: c, usual: avg(had.map((i) => through[i])) })
  }
  missing.sort((a, b) => b.usual - a.usual)

  const budget = computeMonth(file, month)
  const rows: BudgetRow[] = budget.groups.flatMap((g) => g.rows).filter((r) => categories.has(r.category.id))
  const overspent = rows.filter((r) => r.available < 0).sort((a, b) => a.available - b.available)

  const largest = thisMonth.sort((a, b) => a.amount - b.amount).slice(0, 5)

  return {
    month,
    prevMonth: addMonths(month, -1),
    current,
    throughDay,
    comparedMonths: earlier.length,
    income: headline((s) => s.income),
    living: headline((s) => s.living),
    setAside: headline((s) => s.setAside),
    net: headline((s) => s.net),
    savingsRate,
    pace,
    budget: {
      assigned: sum(rows.map((r) => r.assigned)),
      spent: sum(rows.map((r) => (r.activity < 0 ? -r.activity : 0))),
      overspent,
    },
    missing,
    largest,
  }
}

const hasData = (s: MonthSummary) => s.income > 0 || s.living > 0
