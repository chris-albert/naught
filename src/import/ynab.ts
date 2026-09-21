import { ensurePaymentCategories } from '../model/creditCards'
import {
  INCOME_CATEGORY_ID,
  type Account,
  type AccountType,
  type BudgetFile,
  type Category,
  type CategoryGroup,
  type ClearedState,
  type Transaction,
} from '../model/types'

/**
 * Importer for a YNAB API budget export: the JSON returned by
 * GET https://api.ynab.com/v1/budgets/{id} (what the ynab-export tool writes).
 * Amounts in that file are milliunits (1000 = $1.00).
 */

interface YnabExport {
  data: { budget?: YnabBudget; plan?: YnabBudget }
}

interface YnabBudget {
  name: string
  accounts: YnabAccount[]
  payees: { id: string; name: string; deleted: boolean }[]
  category_groups: { id: string; name: string; hidden: boolean; internal: boolean; deleted: boolean }[]
  categories: YnabCategory[]
  months: { month: string; categories: { id: string; budgeted: number }[]; deleted: boolean }[]
  transactions: YnabTransaction[]
  subtransactions: YnabSubtransaction[]
}

interface YnabAccount {
  id: string
  name: string
  type: string
  on_budget: boolean
  closed: boolean
  deleted: boolean
}

interface YnabCategory {
  id: string
  category_group_id: string
  name: string
  hidden: boolean
  internal: boolean
  deleted: boolean
}

interface YnabTransaction {
  id: string
  date: string
  amount: number
  memo: string | null
  cleared: string
  account_id: string
  payee_id: string | null
  category_id: string | null
  transfer_account_id: string | null
  deleted: boolean
}

interface YnabSubtransaction {
  id: string
  transaction_id: string
  amount: number
  memo: string | null
  payee_id: string | null
  category_id: string | null
  transfer_account_id: string | null
  deleted: boolean
}

const accountTypes: Record<string, AccountType> = {
  checking: 'checking',
  savings: 'savings',
  cash: 'cash',
  creditCard: 'credit',
  lineOfCredit: 'credit',
  otherAsset: 'investment',
  otherLiability: 'other',
}

export function importYnab(json: unknown): BudgetFile {
  const root = json as YnabExport
  const b = root?.data?.budget ?? root?.data?.plan
  if (!b || !Array.isArray(b.transactions)) throw new Error('Not a YNAB budget export')

  const milli = (n: number) => Math.round(n / 10)

  const accounts: Account[] = b.accounts
    .filter((a) => !a.deleted)
    .map((a) => ({ id: a.id, name: a.name, type: accountTypes[a.type] ?? 'other', onBudget: a.on_budget, closed: a.closed }))

  // YNAB marks its income and "Uncategorized" categories as internal; neither
  // is a real envelope. Groups left empty after that (e.g. "Hidden Categories",
  // which is only a display container) are dropped too. "Credit Card Payments"
  // is an internal *group* with real categories, so it stays.
  const incomeIds = new Set(
    b.categories.filter((c) => c.internal && /inflow|ready to assign|to be budgeted/i.test(c.name)).map((c) => c.id),
  )
  const droppedCategoryIds = new Set(b.categories.filter((c) => c.internal || c.deleted).map((c) => c.id))

  const categories: Category[] = b.categories
    .filter((c) => !droppedCategoryIds.has(c.id))
    .map((c) => ({ id: c.id, groupId: c.category_group_id, name: c.name, hidden: c.hidden }))

  const usedGroupIds = new Set(categories.map((c) => c.groupId))
  const categoryGroups: CategoryGroup[] = b.category_groups
    .filter((g) => !g.deleted && usedGroupIds.has(g.id))
    .map((g) => ({ id: g.id, name: g.name, hidden: g.hidden }))

  const payeeName = new Map(b.payees.map((p) => [p.id, p.name]))
  const mapCategory = (id: string | null): string | null => {
    if (!id) return null
    if (incomeIds.has(id)) return INCOME_CATEGORY_ID
    if (droppedCategoryIds.has(id)) return null
    return id
  }
  const mapCleared = (c: string): ClearedState =>
    c === 'reconciled' ? 'reconciled' : c === 'cleared' ? 'cleared' : 'uncleared'

  const subsByParent = new Map<string, YnabSubtransaction[]>()
  for (const s of b.subtransactions) {
    if (s.deleted) continue
    const list = subsByParent.get(s.transaction_id) ?? []
    list.push(s)
    subsByParent.set(s.transaction_id, list)
  }

  const transactions: Transaction[] = []
  for (const t of b.transactions) {
    if (t.deleted) continue
    const base = {
      accountId: t.account_id,
      date: t.date,
      payee: (t.payee_id && payeeName.get(t.payee_id)) || '',
      cleared: mapCleared(t.cleared),
    }
    const subs = subsByParent.get(t.id)
    if (subs && subs.length > 0) {
      // Splits are flattened into one transaction per split line.
      subs.forEach((s, i) => {
        transactions.push({
          ...base,
          id: s.id,
          payee: (s.payee_id && payeeName.get(s.payee_id)) || base.payee,
          categoryId: mapCategory(s.category_id),
          memo: [s.memo ?? t.memo ?? '', `(split ${i + 1}/${subs.length})`].filter(Boolean).join(' '),
          amount: milli(s.amount),
          transferAccountId: s.transfer_account_id,
        })
      })
    } else {
      transactions.push({
        ...base,
        id: t.id,
        categoryId: mapCategory(t.category_id),
        memo: t.memo ?? '',
        amount: milli(t.amount),
        transferAccountId: t.transfer_account_id,
      })
    }
  }
  transactions.sort((a, b2) => (a.date < b2.date ? 1 : a.date > b2.date ? -1 : 0))

  const assigned: BudgetFile['assigned'] = {}
  const knownCategoryIds = new Set(categories.map((c) => c.id))
  for (const m of b.months) {
    if (m.deleted) continue
    const month = m.month.slice(0, 7)
    for (const c of m.categories) {
      if (!knownCategoryIds.has(c.id) || c.budgeted === 0) continue
      ;(assigned[month] ??= {})[c.id] = milli(c.budgeted)
    }
  }

  return ensurePaymentCategories({ version: 1, name: b.name, accounts, categoryGroups, categories, transactions, assigned })
}
