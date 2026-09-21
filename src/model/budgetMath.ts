import { addMonths, currentMonth, monthOf } from './dates'
import { INCOME_CATEGORY_ID, type BudgetFile, type Category, type CategoryGroup, type Cents, type MonthKey } from './types'

export interface CategoryRow {
  category: Category
  assigned: Cents
  activity: Cents
  available: Cents
}

export interface GroupRow {
  group: CategoryGroup
  rows: CategoryRow[]
  assigned: Cents
  activity: Cents
  available: Cents
}

export interface MonthBudget {
  month: MonthKey
  toBudget: Cents
  income: Cents
  totalAssigned: Cents
  groups: GroupRow[]
}

interface Activity {
  total: Cents
  /** Portion of `total` that happened on credit accounts. */
  credit: Cents
  /** Credit portion broken down by card account id. */
  byCard: Map<string, Cents>
}

const noActivity = (): Activity => ({ total: 0, credit: 0, byCard: new Map() })

/**
 * Envelope budget for one month, following YNAB's rules.
 *
 * - Only on-budget accounts count.
 * - available = carried-over available (if positive) + assigned + activity.
 * - Overspending never carries forward. The cash part reduces next month's
 *   "to budget"; the credit part is debt with no envelope behind it.
 * - Each credit card has a payment category. Categorized spending on the card
 *   moves that much into it (only what the envelope could cover) and card
 *   payments move money out of it. Income received on a card counts as income
 *   but leaves the payment category alone, and a card's starting balance is
 *   pre-existing debt that touches nothing (both as YNAB does).
 * - Once a card is closed (after its last transaction), whatever is left in its
 *   payment category is released back to "to budget" and it stays at zero.
 * - toBudget is derived from balances, not a running ledger:
 *   cash in on-budget accounts - money sitting in envelopes - this month's
 *   credit overspending (debt, not cash) - money assigned ahead. "Assigned
 *   ahead" only applies from the present month on: a past month's later
 *   assignments were funded by later income, so they do not reduce it.
 *   Cash overspending shows up the following month, when the envelope resets.
 */
export function computeMonth(file: BudgetFile, month: MonthKey, today: MonthKey = currentMonth()): MonthBudget {
  const onBudget = new Set(file.accounts.filter((a) => a.onBudget).map((a) => a.id))
  const creditAccounts = new Set(file.accounts.filter((a) => a.onBudget && a.type === 'credit').map((a) => a.id))
  const paymentCategoryOf = new Map<string, string>() // card account id -> payment category id
  for (const a of file.accounts) if (creditAccounts.has(a.id) && a.paymentCategoryId) paymentCategoryOf.set(a.id, a.paymentCategoryId)
  const paymentCategoryIds = new Set(paymentCategoryOf.values())

  // Closed cards: month of the last transaction; the payment category is released after it.
  const closedAfter = new Map<string, MonthKey>()
  for (const a of file.accounts) {
    if (!a.closed || !paymentCategoryOf.has(a.id)) continue
    let last = '0000-00'
    for (const t of file.transactions) if (t.accountId === a.id && t.date.slice(0, 7) > last) last = t.date.slice(0, 7)
    closedAfter.set(a.id, last)
  }

  const activityByMonth = new Map<MonthKey, Map<string, Activity>>()
  const paymentByMonth = new Map<MonthKey, Map<string, Cents>>() // month -> card account id -> flow into its payment category
  const incomeByMonth = new Map<MonthKey, Cents>()
  const cashByMonth = new Map<MonthKey, Cents>()
  let firstMonth = month

  for (const t of file.transactions) {
    if (!onBudget.has(t.accountId)) continue
    const m = monthOf(t.date)
    if (m > month) continue
    const card = creditAccounts.has(t.accountId) ? t.accountId : null
    if (!card) cashByMonth.set(m, (cashByMonth.get(m) ?? 0) + t.amount)

    if (t.categoryId === INCOME_CATEGORY_ID) {
      if (card && t.payee === 'Starting Balance') continue
      if (m < firstMonth) firstMonth = m
      incomeByMonth.set(m, (incomeByMonth.get(m) ?? 0) + t.amount)
      continue
    } else if (t.categoryId && !paymentCategoryIds.has(t.categoryId)) {
      if (m < firstMonth) firstMonth = m
      let byCat = activityByMonth.get(m)
      if (!byCat) activityByMonth.set(m, (byCat = new Map()))
      let a = byCat.get(t.categoryId)
      if (!a) byCat.set(t.categoryId, (a = noActivity()))
      a.total += t.amount
      if (card) {
        a.credit += t.amount
        a.byCard.set(card, (a.byCard.get(card) ?? 0) + t.amount)
      }
    }

    // Categorized spending on a card moves money into its payment category;
    // transfers (payments) move it out.
    if (card && paymentCategoryOf.has(card) && (t.categoryId || t.transferAccountId)) {
      if (m < firstMonth) firstMonth = m
      let byCard = paymentByMonth.get(m)
      if (!byCard) paymentByMonth.set(m, (byCard = new Map()))
      byCard.set(card, (byCard.get(card) ?? 0) - t.amount)
    }
  }
  for (const m of Object.keys(file.assigned)) {
    if (m <= month && m < firstMonth) firstMonth = m
  }

  const carry = new Map<string, Cents>()
  let cashToDate = 0
  let current: MonthBudget | null = null

  const regular = file.categories.filter((c) => !paymentCategoryIds.has(c.id))
  const payment = file.categories.filter((c) => paymentCategoryIds.has(c.id))

  for (let m = firstMonth; m <= month; m = addMonths(m, 1)) {
    const assigned = file.assigned[m] ?? {}
    const activity = activityByMonth.get(m) ?? new Map<string, Activity>()
    const paymentFlow = paymentByMonth.get(m) ?? new Map<string, Cents>()
    cashToDate += cashByMonth.get(m) ?? 0
    let creditOverspent = 0

    // Credit overspending that the payment envelopes will not receive, per card.
    const unfunded = new Map<string, Cents>()
    const rows = new Map<string, CategoryRow>()

    const settle = (category: Category, act: Activity) => {
      const a = assigned[category.id] ?? 0
      const available = (carry.get(category.id) ?? 0) + a + act.total
      if (available < 0) {
        const overspent = -available
        const onCredit = Math.min(overspent, Math.max(0, -act.credit))
        creditOverspent += onCredit
        if (onCredit > 0) attribute(onCredit, act.byCard, unfunded)
        carry.set(category.id, 0)
      } else {
        carry.set(category.id, available)
      }
      rows.set(category.id, { category, assigned: a, activity: act.total, available })
    }

    for (const c of regular) settle(c, activity.get(c.id) ?? noActivity())
    for (const c of payment) {
      let flow = 0
      let released = false
      for (const [card, catId] of paymentCategoryOf) {
        if (catId !== c.id) continue
        flow += (paymentFlow.get(card) ?? 0) - (unfunded.get(card) ?? 0)
        const closed = closedAfter.get(card)
        if (closed !== undefined && m >= closed) released = true
      }
      settle(c, { total: flow, credit: 0, byCard: new Map() })
      if (released) {
        const row = rows.get(c.id)!
        const leftover = carry.get(c.id) ?? 0 // already clamped at zero
        carry.set(c.id, 0)
        rows.set(c.id, { ...row, activity: row.activity - leftover, available: 0 })
      }
    }

    const groups: GroupRow[] = file.categoryGroups.map((group) => {
      const groupRows = file.categories.filter((c) => c.groupId === group.id).map((c) => rows.get(c.id)!)
      return {
        group,
        rows: groupRows,
        assigned: sum(groupRows, (r) => r.assigned),
        activity: sum(groupRows, (r) => r.activity),
        available: sum(groupRows, (r) => r.available),
      }
    })

    let futureAssigned = 0
    if (m >= today) {
      for (const [k, cats] of Object.entries(file.assigned)) if (k > m) for (const v of Object.values(cats)) futureAssigned += v
    }

    current = {
      month: m,
      income: incomeByMonth.get(m) ?? 0,
      totalAssigned: sum(groups, (g) => g.assigned),
      toBudget: cashToDate - sum(groups, (g) => g.available) - creditOverspent - futureAssigned,
      groups,
    }
  }

  return current ?? { month, toBudget: 0, income: 0, totalAssigned: 0, groups: [] }
}

/** Split `amount` across cards in proportion to how much each spent (negative entries in byCard). */
function attribute(amount: Cents, byCard: Map<string, Cents>, into: Map<string, Cents>) {
  const spends = [...byCard].map(([card, v]) => [card, Math.max(0, -v)] as const).filter(([, v]) => v > 0)
  const total = spends.reduce((s, [, v]) => s + v, 0)
  if (total === 0) return
  let remaining = amount
  spends.forEach(([card, v], i) => {
    const share = i === spends.length - 1 ? remaining : Math.round((amount * v) / total)
    remaining -= share
    into.set(card, (into.get(card) ?? 0) + share)
  })
}

export function accountBalance(file: BudgetFile, accountId: string): Cents {
  let total = 0
  for (const t of file.transactions) if (t.accountId === accountId) total += t.amount
  return total
}

function sum<T>(items: T[], pick: (item: T) => number): number {
  let total = 0
  for (const item of items) total += pick(item)
  return total
}
