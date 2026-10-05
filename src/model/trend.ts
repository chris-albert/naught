import { monthOf } from './dates'
import { linesOf } from './splits'
import { INCOME_CATEGORY_ID, type BudgetFile, type Cents, type MonthKey, type Transaction } from './types'

/** What the trend page is looking at: one category group, one category, or one payee. */
export type TrendScope = { kind: 'group'; id: string } | { kind: 'category'; id: string } | { kind: 'payee'; name: string }

/** One row of the breakdown: a category under a group, a payee under a category, or a category under a payee. */
export interface TrendRow {
  key: string
  label: string
  /** Where clicking the row goes; absent for rows with nowhere to drill (uncategorized, income). */
  scope?: TrendScope
  /** Net money out per month, aligned with `months`. Negative = net money in. */
  byMonth: Cents[]
  total: Cents
  average: Cents
  count: number
}

export interface Trend {
  scope: TrendScope
  /** Display name: the group's, the category's, or the payee. Null when the scope points at nothing. */
  name: string | null
  months: MonthKey[]
  byMonth: Cents[]
  total: Cents
  average: Cents
  /** Average of the later half of the range minus the average of the earlier half. */
  shift: Cents
  rows: TrendRow[]
  /** Everything counted, newest first. */
  transactions: Transaction[]
}

/**
 * Month-by-month spending on one group, category or payee, with the same rules as the
 * Reports page: on-budget accounts only, transfers and credit card payment categories
 * ignored, money out positive and net money in negative. A payee's transactions count
 * whatever category they carry, including income and none. A split transaction
 * counts line by line, each line listed as a transaction of its own.
 */
export function buildTrend(file: BudgetFile, months: MonthKey[], scope: TrendScope): Trend {
  const index = new Map(months.map((m, i) => [m, i]))
  const onBudget = new Set(file.accounts.filter((a) => a.onBudget).map((a) => a.id))
  const paymentCategoryIds = new Set(file.accounts.map((a) => a.paymentCategoryId).filter(Boolean))
  const categories = new Map(file.categories.filter((c) => !paymentCategoryIds.has(c.id)).map((c) => [c.id, c]))
  const groups = new Map(file.categoryGroups.map((g) => [g.id, g]))

  let name: string | null = null
  let matches: (t: Transaction) => boolean
  if (scope.kind === 'group') {
    name = groups.get(scope.id)?.name ?? null
    matches = (t) => !!t.categoryId && categories.get(t.categoryId)?.groupId === scope.id
  } else if (scope.kind === 'category') {
    name = categories.get(scope.id)?.name ?? null
    matches = (t) => t.categoryId === scope.id
  } else {
    name = scope.name
    matches = (t) => t.payee === scope.name && (!t.categoryId || t.categoryId === INCOME_CATEGORY_ID || categories.has(t.categoryId))
  }

  const rows = new Map<string, TrendRow>()
  const row = (key: string, label: string, scope?: TrendScope): TrendRow => {
    let r = rows.get(key)
    if (!r) {
      r = { key, label, scope, byMonth: months.map(() => 0), total: 0, average: 0, count: 0 }
      rows.set(key, r)
    }
    return r
  }
  const rowFor = (t: Transaction): TrendRow => {
    if (scope.kind === 'group') {
      const c = categories.get(t.categoryId!)!
      return row(c.id, c.name, { kind: 'category', id: c.id })
    }
    if (scope.kind === 'category') return row(t.payee, t.payee || 'No payee', t.payee ? { kind: 'payee', name: t.payee } : undefined)
    if (!t.categoryId) return row('', 'Uncategorized')
    if (t.categoryId === INCOME_CATEGORY_ID) return row(INCOME_CATEGORY_ID, 'Income')
    const c = categories.get(t.categoryId)!
    return row(c.id, c.name, { kind: 'category', id: c.id })
  }

  const byMonth = months.map(() => 0)
  const transactions: Transaction[] = []
  for (const t of file.transactions.flatMap(linesOf)) {
    if (!onBudget.has(t.accountId) || t.transferAccountId || !matches(t)) continue
    const i = index.get(monthOf(t.date))
    if (i === undefined) continue
    byMonth[i] -= t.amount
    const r = rowFor(t)
    r.byMonth[i] -= t.amount
    r.count++
    transactions.push(t)
  }
  transactions.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))

  const finished = [...rows.values()]
    .map((r) => ({ ...r, total: sum(r.byMonth), average: avg(r.byMonth) }))
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total))

  const half = Math.floor(months.length / 2)
  const shift = half === 0 ? 0 : avg(byMonth.slice(months.length - half)) - avg(byMonth.slice(0, half))

  return { scope, name, months, byMonth, total: sum(byMonth), average: avg(byMonth), shift, rows: finished, transactions }
}

/** Query string for a scope, e.g. "category=food". */
export function scopeParams(scope: TrendScope): string {
  const p = new URLSearchParams()
  if (scope.kind === 'payee') p.set('payee', scope.name)
  else p.set(scope.kind, scope.id)
  return p.toString()
}

export function trendPath(scope: TrendScope): string {
  return `/app/reports/trend?${scopeParams(scope)}`
}

/** Reads a scope back out of the query string; null when none is there. */
export function scopeFromParams(params: URLSearchParams): TrendScope | null {
  const group = params.get('group')
  if (group) return { kind: 'group', id: group }
  const category = params.get('category')
  if (category) return { kind: 'category', id: category }
  const payee = params.get('payee')
  if (payee !== null) return { kind: 'payee', name: payee }
  return null
}

function sum(xs: number[]): number {
  let t = 0
  for (const x of xs) t += x
  return t
}

function avg(xs: number[]): number {
  return xs.length ? Math.round(sum(xs) / xs.length) : 0
}
