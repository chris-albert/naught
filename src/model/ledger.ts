import { linesOf } from './splits'
import type { BudgetFile, Category, Transaction } from './types'

/**
 * The pieces of the budget every report counts, so the report pages agree with
 * each other: on-budget accounts only, transfers between your own accounts left
 * out, a split transaction as its lines, and credit card payment categories
 * treated as not categories at all.
 */

/** Every category except the credit card payment ones. */
export function spendingCategories(file: BudgetFile): Map<string, Category> {
  const paymentCategoryIds = new Set(file.accounts.map((a) => a.paymentCategoryId).filter(Boolean))
  return new Map(file.categories.filter((c) => !paymentCategoryIds.has(c.id)).map((c) => [c.id, c]))
}

/** Transaction lines on on-budget accounts that are not transfers. A line of a payment category still comes through; filter with `spendingCategories` where that matters. */
export function countedLines(file: BudgetFile): Transaction[] {
  const onBudget = new Set(file.accounts.filter((a) => a.onBudget).map((a) => a.id))
  const out: Transaction[] = []
  for (const t of file.transactions) {
    if (!onBudget.has(t.accountId) || t.transferAccountId) continue
    for (const line of linesOf(t)) out.push(line)
  }
  return out
}

export function sum(xs: number[]): number {
  let t = 0
  for (const x of xs) t += x
  return t
}

export function avg(xs: number[]): number {
  return xs.length ? Math.round(sum(xs) / xs.length) : 0
}

/** Numeric day of an ISO date. */
export function dayOf(isoDate: string): number {
  return Number(isoDate.slice(8, 10))
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/**
 * `months` with the leading ones from before the budget's history dropped, so a
 * "12 months" range on a budget that started in May does not average over seven empty
 * months. The first month with a counted transaction line is where the range starts;
 * a budget with no history keeps the range as given.
 */
export function sinceFirstActivity(file: BudgetFile, months: string[]): string[] {
  let first: string | null = null
  for (const t of countedLines(file)) {
    const m = t.date.slice(0, 7)
    if (first === null || m < first) first = m
  }
  if (first === null) return months
  const trimmed = months.filter((m) => m >= first!)
  return trimmed.length ? trimmed : months
}
