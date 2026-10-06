import { computeMonth } from './budgetMath'
import { addMonths, monthOf } from './dates'
import { avg, countedLines, spendingCategories, sum } from './ledger'
import { buildReport } from './reports'
import type { BudgetFile, Category, Cents, MonthKey, Transaction } from './types'

/*
 * Insights: what the numbers say once you look across payees and targets
 * rather than month by month. Same counting rules as the Reports page (see ledger.ts).
 */

// ---------- targets vs reality ----------

export type TargetVerdict = 'over' | 'under' | 'on'

export interface TargetAdherence {
  category: Category
  target: Cents
  /** Living category: average net spending per month. Reserve: average assigned per month. */
  actual: Cents
  /** actual - target */
  delta: Cents
  /** delta / target */
  pct: number
  verdict: TargetVerdict
}

export interface TargetSummary {
  rows: TargetAdherence[]
  totals: { target: Cents; actual: Cents }
}

/** Every visible category with a target, against what actually happened over `months`. Biggest misses first. */
export function targetAdherence(file: BudgetFile, months: MonthKey[]): TargetSummary {
  const report = buildReport(file, months)
  const rows: TargetAdherence[] = []
  for (const g of report.groups) {
    for (const c of g.categories) {
      const target = c.category.target
      if (target === undefined || c.category.hidden) continue
      const actual = c.category.reserve ? avg(months.map((m) => file.assigned[m]?.[c.category.id] ?? 0)) : c.average
      const delta = actual - target
      const slack = Math.max(1000, Math.round(target * 0.15))
      const verdict: TargetVerdict = delta > slack ? 'over' : delta < -slack ? 'under' : 'on'
      rows.push({ category: c.category, target, actual, delta, pct: target ? delta / target : 0, verdict })
    }
  }
  rows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
  return { rows, totals: { target: sum(rows.map((r) => r.target)), actual: sum(rows.map((r) => r.actual)) } }
}

// ---------- recurring payees ----------

export type Cadence = 'monthly' | 'yearly'
export type RecurringStatus = 'active' | 'new' | 'stopped'

export interface RecurringPayee {
  payee: string
  categoryId: string | null
  cadence: Cadence
  /** Median charge, positive cents. */
  amount: Cents
  /** Most charges are within 15% of the median. */
  stable: boolean
  /** What it costs per month: the current price for monthly, a twelfth of the amount for yearly. */
  monthlyCost: Cents
  count: number
  firstDate: string
  lastDate: string
  lastAmount: Cents
  status: RecurringStatus
  /** Set when the last two charges agree with each other but not with the earlier ones. */
  priceChange?: { from: Cents; to: Cents; since: MonthKey }
}

export interface RecurringSummary {
  payees: RecurringPayee[]
  /** Sum of monthly cost over stable payees that are still charging. */
  fixedMonthly: Cents
  count: number
}

const DAY = 86_400_000
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY)

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2)
}

function mostCommon<T>(xs: T[]): T {
  const counts = new Map<T, number>()
  let best = xs[0]
  for (const x of xs) {
    const n = (counts.get(x) ?? 0) + 1
    counts.set(x, n)
    if (n > (counts.get(best) ?? 0)) best = x
  }
  return best
}

/**
 * Payees that charge on a schedule: monthly (three or more charges about a month
 * apart) or yearly (two or more about a year apart). Looks back `lookbackMonths`
 * months from `today`. Refunds and income never count; uncategorized charges do.
 */
export function recurringPayees(file: BudgetFile, today: string, lookbackMonths = 13): RecurringSummary {
  const categories = spendingCategories(file)
  const from = `${addMonths(monthOf(today), -(lookbackMonths - 1))}-01`
  const byPayee = new Map<string, Transaction[]>()
  for (const t of countedLines(file)) {
    if (t.amount >= 0 || !t.payee || t.date < from || t.date > today) continue
    if (t.categoryId !== null && !categories.has(t.categoryId)) continue
    let list = byPayee.get(t.payee)
    if (!list) byPayee.set(t.payee, (list = []))
    list.push(t)
  }

  const payees: RecurringPayee[] = []
  for (const [payee, charges] of byPayee) {
    charges.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    if (charges.length < 2) continue
    const gaps = charges.slice(1).map((t, i) => daysBetween(charges[i].date, t.date))
    const gap = median(gaps)
    let cadence: Cadence
    if (charges.length >= 3 && gap >= 24 && gap <= 38) cadence = 'monthly'
    else if (gap >= 330 && gap <= 400) cadence = 'yearly'
    else continue

    const amounts = charges.map((t) => -t.amount)
    const amount = median(amounts)
    const steady = (xs: number[], around: number) => xs.filter((a) => Math.abs(a - around) <= around * 0.15).length >= xs.length * 0.7
    // A price change makes the series bimodal: when the last two charges agree with each
    // other, judge steadiness on the charges before them so a raised price still reads as stable.
    const [penultimate, latest] = amounts.slice(-2)
    const repriced = charges.length >= 3 && Math.abs(penultimate - latest) <= Math.max(penultimate, latest) * 0.01
    const stable = steady(amounts, amount) || (repriced && steady(amounts.slice(0, -2), median(amounts.slice(0, -2))))
    const first = charges[0]
    const last = charges[charges.length - 1]
    const newSince = `${addMonths(monthOf(today), -2)}-01`
    let status: RecurringStatus = 'active'
    if (cadence === 'monthly') {
      if (daysBetween(last.date, today) > Math.max(45, 2 * gap)) status = 'stopped'
      else if (first.date >= newSince) status = 'new'
    }

    let priceChange: RecurringPayee['priceChange']
    if (cadence === 'monthly' && stable && repriced) {
      const earlier = median(amounts.slice(0, -2))
      if (Math.abs(latest - earlier) > earlier * 0.02) {
        priceChange = { from: earlier, to: latest, since: monthOf(charges[charges.length - 2].date) }
      }
    }

    payees.push({
      payee,
      categoryId: mostCommon(charges.map((t) => t.categoryId)),
      cadence,
      amount,
      stable,
      monthlyCost: cadence === 'monthly' ? (priceChange?.to ?? amount) : Math.round(amount / 12),
      count: charges.length,
      firstDate: first.date,
      lastDate: last.date,
      lastAmount: -last.amount,
      status,
      priceChange,
    })
  }
  payees.sort((a, b) => b.monthlyCost - a.monthlyCost)
  const fixedMonthly = sum(payees.filter((p) => p.stable && p.status !== 'stopped').map((p) => p.monthlyCost))
  return { payees, fixedMonthly, count: payees.length }
}

// ---------- top payees ----------

export interface PayeeTotal {
  payee: string
  categoryId: string | null
  /** Net money out per month, aligned with `months`. */
  byMonth: Cents[]
  total: Cents
  average: Cents
  count: number
  /** Average of the later half of the range minus the average of the earlier half. */
  shift: Cents
}

/** Who gets the most money over `months`, net of refunds. Income and payment categories left out. */
export function topPayees(file: BudgetFile, months: MonthKey[], limit = 15): PayeeTotal[] {
  const index = new Map(months.map((m, i) => [m, i]))
  const categories = spendingCategories(file)
  const rows = new Map<string, PayeeTotal & { categoryIds: (string | null)[] }>()
  for (const t of countedLines(file)) {
    if (!t.payee || (t.categoryId !== null && !categories.has(t.categoryId))) continue
    const i = index.get(monthOf(t.date))
    if (i === undefined) continue
    let r = rows.get(t.payee)
    if (!r) rows.set(t.payee, (r = { payee: t.payee, categoryId: null, byMonth: months.map(() => 0), total: 0, average: 0, count: 0, shift: 0, categoryIds: [] }))
    r.byMonth[i] -= t.amount
    r.count++
    r.categoryIds.push(t.categoryId)
  }
  const half = Math.floor(months.length / 2)
  return [...rows.values()]
    .map(({ categoryIds, ...r }) => ({
      ...r,
      categoryId: mostCommon(categoryIds),
      total: sum(r.byMonth),
      average: avg(r.byMonth),
      shift: half === 0 ? 0 : avg(r.byMonth.slice(months.length - half)) - avg(r.byMonth.slice(0, half)),
    }))
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, limit)
}

// ---------- reserve health ----------

export interface ReserveHealth {
  category: Category
  /** Available in the reserve as of `today`'s month. */
  balance: Cents
  /** Assigned plus inflows landing in it, per month. */
  avgSetAside: Cents
  avgAssigned: Cents
  /** Spent out of it, per month. */
  avgDrawn: Cents
  /** avgSetAside - avgDrawn */
  net: Cents
  target?: Cents
  /** avgAssigned - target, when there is a target. */
  vsTarget: Cents | null
  /** How many months of draws the balance covers, when it is being drawn from. */
  runwayMonths: number | null
}

/** How each reserve (sinking fund) is doing: what it holds, how fast it fills, how fast it drains. */
export function reserveHealth(file: BudgetFile, months: MonthKey[], today: string): ReserveHealth[] {
  const index = new Map(months.map((m, i) => [m, i]))
  const reserves = [...spendingCategories(file).values()].filter((c) => c.reserve)
  if (reserves.length === 0) return []
  const budget = computeMonth(file, monthOf(today))
  const available = new Map(budget.groups.flatMap((g) => g.rows).map((r) => [r.category.id, r.available]))
  const inflow = new Map(reserves.map((c) => [c.id, months.map(() => 0)]))
  const outflow = new Map(reserves.map((c) => [c.id, months.map(() => 0)]))
  for (const t of countedLines(file)) {
    if (!t.categoryId || !inflow.has(t.categoryId)) continue
    const i = index.get(monthOf(t.date))
    if (i === undefined) continue
    if (t.amount > 0) inflow.get(t.categoryId)![i] += t.amount
    else outflow.get(t.categoryId)![i] -= t.amount
  }
  return reserves.map((c) => {
    const assigned = months.map((m) => file.assigned[m]?.[c.id] ?? 0)
    const avgAssigned = avg(assigned)
    const avgSetAside = avg(months.map((_, i) => assigned[i] + inflow.get(c.id)![i]))
    const avgDrawn = avg(outflow.get(c.id)!)
    const balance = available.get(c.id) ?? 0
    return {
      category: c,
      balance,
      avgSetAside,
      avgAssigned,
      avgDrawn,
      net: avgSetAside - avgDrawn,
      target: c.target,
      vsTarget: c.target === undefined ? null : avgAssigned - c.target,
      runwayMonths: avgDrawn > 0 ? Math.round((10 * balance) / avgDrawn) / 10 : null,
    }
  })
}
