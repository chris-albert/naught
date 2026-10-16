import type { BudgetFile, Cents } from './types'

export interface BalancePoint {
  /** ISO date, YYYY-MM-DD */
  date: string
  /** Balance at the end of that day. */
  balance: Cents
}

export interface BalanceHistory {
  points: BalancePoint[]
  /** Balance at the end of the last day. */
  balance: Cents
  /** Last day's balance minus the first day's. */
  change: Cents
  low: Cents
  high: Cents
}

/** The ISO date `delta` days after `isoDate`. */
export function addDays(isoDate: string, delta: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}

/** Every day from `from` through `to`, inclusive. */
export function dayRange(from: string, to: string): string[] {
  const days: string[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d)
  return days
}

/**
 * One account's balance at the end of each day in the range: the sum of its transactions
 * dated that day or earlier. Everything before the range is folded into the first day;
 * transactions dated after it are ignored.
 */
export function balanceHistory(file: BudgetFile, accountId: string, from: string, to: string): BalanceHistory {
  const days = dayRange(from, to)
  const index = new Map(days.map((d, i) => [d, i]))
  const deltas = days.map(() => 0)
  for (const t of file.transactions) {
    if (t.accountId !== accountId || t.date > to) continue
    deltas[t.date < from ? 0 : index.get(t.date)!] += t.amount
  }
  let running = 0
  const points = days.map((date, i) => ({ date, balance: (running += deltas[i]) }))
  const balances = points.map((p) => p.balance)
  return {
    points,
    balance: balances[balances.length - 1] ?? 0,
    change: balances.length ? balances[balances.length - 1] - balances[0] : 0,
    low: balances.length ? Math.min(...balances) : 0,
    high: balances.length ? Math.max(...balances) : 0,
  }
}
