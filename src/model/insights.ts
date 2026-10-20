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
  /** Yearly only: a year after the last charge, when the next one should land. */
  nextDate?: string
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

/** Card processors that prefix the merchant in a raw bank string: "SQ *ZEITGEIST", "TST*FLOUR & WATER". */
const PROCESSOR_PREFIXES = new Set(['sq', 'tst', 'dd', 'sp', 'pp', 'paypal', 'tcb', 'med', 'py'])

/** A payee the bank wrote and nobody renamed: card digits, "null", a processor star, or shouting. */
export function looksRaw(payee: string): boolean {
  return /\bnull\b|x{4,}|[*#]|\d{4,}/i.test(payee) || (payee.length > 6 && payee === payee.toUpperCase() && /[A-Z]/.test(payee))
}

/**
 * Lower-case words of a payee with the bank's noise dropped: card-number masks, "null",
 * any token holding a digit, and a leading processor prefix. "PELOTON* MEMBERSHIP NEW YORK
 * NY null XXXXXXXXXXXX8464" becomes "peloton membership new york ny".
 */
export function normalizePayee(payee: string): string {
  const words = payee
    .toLowerCase()
    .replace(/[*#]/g, ' ')
    .split(/[^a-z0-9&']+/)
    .filter((w) => w && w !== 'null' && !/\d/.test(w) && !/^x{3,}$/.test(w))
  if (words.length > 1 && PROCESSOR_PREFIXES.has(words[0])) words.shift()
  return words.join(' ')
}

const isPrefixOf = (shorter: string, longer: string) => longer === shorter || longer.startsWith(shorter + ' ')

/**
 * The name each payee should be counted under, so a renamed or re-spelled payee is one series.
 *
 * - A raw bank string adopts the clean payee whose normalized name it starts with
 *   ("NETFLIX.COM LOS GATOS CA null XXXX9678" counts as "Netflix"); the longest match wins.
 *   Raw strings with no clean counterpart are merged with each other by their normalized
 *   form, so a new card number does not split a series.
 * - Two clean payees merge when one's name starts with the other's ("Hulu", "Hulu Plus") and
 *   they never charge within 20 days of each other: that is a rename, where "Amazon" and
 *   "Amazon Prime" charging in the same week are two products. The name with more charges wins.
 */
function payeeGroups(charges: Transaction[]): Map<string, string> {
  const dates = new Map<string, string[]>()
  for (const t of charges) {
    let list = dates.get(t.payee)
    if (!list) dates.set(t.payee, (list = []))
    list.push(t.date)
  }
  const clean = new Map<string, string>() // normalized -> display name
  const raw: string[] = []
  for (const p of dates.keys()) {
    if (looksRaw(p)) raw.push(p)
    else {
      const key = normalizePayee(p)
      if (key && !clean.has(key)) clean.set(key, p)
    }
  }

  const groups = new Map<string, string>()
  const apart = (a: string, b: string) => dates.get(a)!.every((da) => dates.get(b)!.every((db) => Math.abs(daysBetween(da, db)) > 20))
  const keys = [...clean.keys()].filter((k) => k.length >= 4).sort((a, b) => a.length - b.length)
  for (const [key, name] of clean) {
    const shorter = keys.find((k) => k.length < key.length && isPrefixOf(k, key) && apart(clean.get(k)!, name))
    if (!shorter) groups.set(name, name)
    else {
      const other = clean.get(shorter)!
      const winner = dates.get(name)!.length > dates.get(other)!.length ? name : other
      groups.set(name, winner)
      groups.set(other, winner)
    }
  }

  const prefixes = [...keys].reverse()
  const rawByKey = new Map<string, string>()
  for (const p of raw) {
    const key = normalizePayee(p)
    const match = prefixes.find((k) => isPrefixOf(k, key))
    if (match) groups.set(p, groups.get(clean.get(match)!)!)
    else {
      const first = rawByKey.get(key) ?? p
      rawByKey.set(key, first)
      groups.set(p, first)
    }
  }
  return groups
}

/** `isoDate` a year later; Feb 29 lands on Feb 28. */
function yearAfter(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  const next = new Date(Date.UTC(y + 1, m - 1, d))
  if (next.getUTCMonth() !== m - 1) next.setUTCDate(0)
  return next.toISOString().slice(0, 10)
}

/**
 * Payees that charge on a schedule: monthly (three or more charges about a month
 * apart, the last within `lookbackMonths` months of `today`) or yearly (two or more
 * about a year apart, looked for over twice that span so both charges of a new annual
 * plan can be seen). Refunds and income never count; uncategorized charges do. Raw bank
 * strings are counted under the clean payee they match (see `payeeGroups`).
 */
export function recurringPayees(file: BudgetFile, today: string, lookbackMonths = 13): RecurringSummary {
  const categories = spendingCategories(file)
  const monthlyFrom = `${addMonths(monthOf(today), -(lookbackMonths - 1))}-01`
  const from = `${addMonths(monthOf(today), -(2 * lookbackMonths - 1))}-01`
  const counted = countedLines(file).filter(
    (t) => t.amount < 0 && t.payee && t.date >= from && t.date <= today && (t.categoryId === null || categories.has(t.categoryId)),
  )
  const groups = payeeGroups(counted)
  const byPayee = new Map<string, Transaction[]>()
  for (const t of counted) {
    const name = groups.get(t.payee) ?? t.payee
    let list = byPayee.get(name)
    if (!list) byPayee.set(name, (list = []))
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
    if (cadence === 'monthly' && charges[charges.length - 1].date < monthlyFrom) continue

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
    } else if (daysBetween(last.date, today) > 400) status = 'stopped' // the renewal never came

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
      nextDate: cadence === 'yearly' && status === 'active' ? yearAfter(last.date) : undefined,
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
