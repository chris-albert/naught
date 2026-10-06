import { monthOf } from './dates'
import type { Account, BudgetFile, Cents, MonthKey } from './types'

export interface AccountHistory {
  account: Account
  /** Balance at the end of each month, aligned with `months`. */
  byMonth: Cents[]
}

export interface NetWorthMonth {
  month: MonthKey
  /** Sum of every positive account balance. */
  assets: Cents
  /** Sum of every negative account balance, as a positive number. */
  debts: Cents
  /** assets - debts */
  net: Cents
  onBudget: Cents
  offBudget: Cents
}

export interface NetWorthHistory {
  months: MonthKey[]
  /** Accounts with a balance somewhere in the range, in the file's order. */
  accounts: AccountHistory[]
  summaries: NetWorthMonth[]
  /** Net worth at the end of the last month. */
  net: Cents
  /** Last month's net minus the first month's. */
  change: Cents
  /** Last month's net minus the month before it; 0 for a single month. */
  changeLastMonth: Cents
  /** Month of the earliest transaction in the file, or null without any. */
  firstMonth: MonthKey | null
}

/**
 * Month-end balance of every account, on-budget or off, open or closed: the sum of its
 * transactions dated in that month or earlier. Transfers count on both sides as they are,
 * so moving money between accounts leaves the total unchanged.
 */
export function netWorthHistory(file: BudgetFile, months: MonthKey[]): NetWorthHistory {
  const index = new Map(months.map((m, i) => [m, i]))
  const first = months[0]
  const perAccount = new Map(file.accounts.map((a) => [a.id, months.map(() => 0)]))
  let firstMonth: MonthKey | null = null

  for (const t of file.transactions) {
    const m = monthOf(t.date)
    if (firstMonth === null || m < firstMonth) firstMonth = m
    const series = perAccount.get(t.accountId)
    if (!series) continue
    // everything before the range lands in the first month; later months carry it forward below
    const i = m < first ? 0 : index.get(m)
    if (i === undefined) continue
    series[i] += t.amount
  }
  for (const series of perAccount.values()) for (let i = 1; i < series.length; i++) series[i] += series[i - 1]

  const accounts: AccountHistory[] = file.accounts
    .map((account) => ({ account, byMonth: perAccount.get(account.id)! }))
    .filter((a) => a.byMonth.some((v) => v !== 0))

  const summaries: NetWorthMonth[] = months.map((month, i) => {
    let assets = 0
    let debts = 0
    let onBudget = 0
    let offBudget = 0
    for (const a of accounts) {
      const v = a.byMonth[i]
      if (v > 0) assets += v
      else debts -= v
      if (a.account.onBudget) onBudget += v
      else offBudget += v
    }
    return { month, assets, debts, net: assets - debts, onBudget, offBudget }
  })

  const nets = summaries.map((s) => s.net)
  const last = nets[nets.length - 1] ?? 0
  return {
    months,
    accounts,
    summaries,
    net: last,
    change: nets.length ? last - nets[0] : 0,
    changeLastMonth: nets.length > 1 ? last - nets[nets.length - 2] : 0,
    firstMonth,
  }
}
