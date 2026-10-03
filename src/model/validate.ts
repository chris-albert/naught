import { computeMonth } from './budgetMath'
import { addMonths, currentMonth, monthOf } from './dates'
import { INCOME_CATEGORY_ID, type BudgetFile, type Cents, type MonthKey } from './types'

/**
 * One month of "To Budget" derived as a running ledger, next to the
 * balance-based figure computeMonth produces. The two should always agree.
 */
export interface LedgerMonth {
  month: MonthKey
  /** Inflows categorized as income. */
  income: Cents
  /** Everything assigned this month (negative values move money back out). */
  assigned: Cents
  /** Cash that left on-budget accounts with no category, including transfers off budget. Negative when money left. */
  uncategorized: Cents
  /** Last month's cash overspending, charged now that the envelopes have reset. */
  cashOverspentPrior: Cents
  /** Leftovers released from the payment category of a closed card. */
  released: Cents
  /** Change in money assigned to later months (only tracked from the present month on). */
  aheadChange: Cents
  /** To Budget by the ledger: last month's figure plus this month's entries. */
  ledger: Cents
  /** To Budget as computeMonth derives it from balances. */
  balance: Cents
}

/**
 * Re-derives To Budget month by month as a ledger:
 *
 *   toBudget(m) = toBudget(m-1) + income(m) - assigned(m) + uncategorized(m)
 *                 - cashOverspent(m-1) + released(m) - aheadChange(m)
 *
 * It leans on computeMonth only for each month's per-category available,
 * which it uses to find overspending and what a closed card's payment
 * category still held. The way those feed To Budget is worked out here
 * independently, so a disagreement points at the composition in computeMonth.
 */
export function validateToBudget(file: BudgetFile, today: MonthKey = currentMonth()): LedgerMonth[] {
  const onBudget = new Set(file.accounts.filter((a) => a.onBudget).map((a) => a.id))
  const cards = file.accounts.filter((a) => a.onBudget && a.type === 'credit')
  const cardIds = new Set(cards.map((a) => a.id))
  const paymentCategoryIds = new Set(cards.flatMap((a) => (a.paymentCategoryId ? [a.paymentCategoryId] : [])))

  const transactions = file.transactions.filter((t) => onBudget.has(t.accountId))
  const months = [...transactions.map((t) => monthOf(t.date)), ...Object.keys(file.assigned)]
  if (months.length === 0) return []
  const first = months.reduce((a, b) => (a < b ? a : b))
  const last = [...months, today].reduce((a, b) => (a > b ? a : b))

  const lastCardMonth = new Map<string, MonthKey>()
  for (const t of transactions) {
    if (!cardIds.has(t.accountId)) continue
    const m = monthOf(t.date)
    if (m > (lastCardMonth.get(t.accountId) ?? '')) lastCardMonth.set(t.accountId, m)
  }

  const assignedIn = (m: MonthKey) => Object.values(file.assigned[m] ?? {}).reduce((s, v) => s + v, 0)
  const ahead = (m: MonthKey) => {
    if (m < today) return 0
    let total = 0
    for (const k of Object.keys(file.assigned)) if (k > m) total += assignedIn(k)
    return total
  }

  const out: LedgerMonth[] = []
  let ledger = 0
  let prevRows = new Map<string, Cents>() // category id -> available last month
  let prevCardSpend = new Map<string, Map<string, Cents>>() // category id -> card id -> spend last month (negative)

  for (let m = first; m <= last; m = addMonths(m, 1)) {
    const inMonth = transactions.filter((t) => monthOf(t.date) === m)

    let income = 0
    let uncategorized = 0
    const cardSpend = new Map<string, Map<string, Cents>>()
    const cardFlow = new Map<string, Cents>() // card id -> money into its payment category
    for (const t of inMonth) {
      const card = cardIds.has(t.accountId)
      if (t.categoryId === INCOME_CATEGORY_ID) {
        if (!(card && t.payee === 'Starting Balance')) income += t.amount
        continue
      }
      if (!card && !t.categoryId && !(t.transferAccountId && onBudget.has(t.transferAccountId))) uncategorized += t.amount
      if (card && t.categoryId && !paymentCategoryIds.has(t.categoryId)) {
        let byCard = cardSpend.get(t.categoryId)
        if (!byCard) cardSpend.set(t.categoryId, (byCard = new Map()))
        byCard.set(t.accountId, (byCard.get(t.accountId) ?? 0) + t.amount)
      }
      if (card && (t.categoryId || t.transferAccountId)) cardFlow.set(t.accountId, (cardFlow.get(t.accountId) ?? 0) - t.amount)
    }

    // Last month's overspending, split into the cash part (charged now) and the credit part (debt, never charged).
    let cashOverspentPrior = 0
    for (const [categoryId, available] of prevRows) {
      if (available >= 0) continue
      const onCredit = -[...(prevCardSpend.get(categoryId) ?? new Map<string, Cents>()).values()].reduce((s, v) => s + v, 0)
      cashOverspentPrior += -available - Math.min(-available, Math.max(0, onCredit))
    }

    const budget = computeMonth(file, m, today)
    const rows = new Map<string, Cents>()
    for (const g of budget.groups) for (const r of g.rows) rows.set(r.category.id, r.available)

    // This month's credit overspending that the payment envelopes will not receive, per card.
    const unfunded = new Map<string, Cents>()
    for (const [categoryId, available] of rows) {
      if (available >= 0 || paymentCategoryIds.has(categoryId)) continue
      const spends = [...(cardSpend.get(categoryId) ?? new Map<string, Cents>())].map(([c, v]) => [c, Math.max(0, -v)] as const).filter(([, v]) => v > 0)
      const onCredit = spends.reduce((s, [, v]) => s + v, 0)
      const share = Math.min(-available, onCredit)
      if (share === 0) continue
      let remaining = share
      spends.forEach(([c, v], i) => {
        const part = i === spends.length - 1 ? remaining : Math.round((share * v) / onCredit)
        remaining -= part
        unfunded.set(c, (unfunded.get(c) ?? 0) + part)
      })
    }

    // A closed card's payment category gives back whatever it still holds.
    let released = 0
    for (const categoryId of paymentCategoryIds) {
      const its = cards.filter((a) => a.paymentCategoryId === categoryId)
      const closed = its.some((a) => a.closed && lastCardMonth.has(a.id) && m >= lastCardMonth.get(a.id)!)
      if (!closed) continue
      let flow = 0
      for (const a of its) flow += (cardFlow.get(a.id) ?? 0) - (unfunded.get(a.id) ?? 0)
      released += Math.max(0, Math.max(0, prevRows.get(categoryId) ?? 0) + (file.assigned[m]?.[categoryId] ?? 0) + flow)
    }

    const assigned = assignedIn(m)
    const aheadChange = ahead(m) - (m > first ? ahead(addMonths(m, -1)) : 0)
    ledger += income - assigned + uncategorized - cashOverspentPrior + released - aheadChange

    out.push({ month: m, income, assigned, uncategorized, cashOverspentPrior, released, aheadChange, ledger, balance: budget.toBudget })
    prevRows = rows
    prevCardSpend = cardSpend
  }
  return out
}
