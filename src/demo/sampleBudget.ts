import { addMonths, currentMonth } from '../model/dates'
import { INCOME_CATEGORY_ID, type Account, type BudgetFile, type Category, type Cents, type MonthKey, type Transaction } from '../model/types'

/**
 * A made-up household budget for the demo: six months of paychecks, bills,
 * card spending, card payments and savings transfers, ending today, plus a
 * handful of freshly imported card transactions that still need a category.
 * The same input always produces the same file so the demo looks identical on
 * every visit and in tests.
 */

const MONTHS = 6

const checking: Account = { id: 'demo-checking', name: 'Checking', type: 'checking', onBudget: true, closed: false }
const savings: Account = { id: 'demo-savings', name: 'Savings', type: 'savings', onBudget: true, closed: false }
const visa: Account = { id: 'demo-visa', name: 'Visa', type: 'credit', onBudget: true, closed: false }

const groups = [
  { id: 'demo-g-bills', name: 'Bills', hidden: false },
  { id: 'demo-g-everyday', name: 'Everyday', hidden: false },
  { id: 'demo-g-goals', name: 'Goals', hidden: false },
]

interface Plan {
  category: Category
  /** Assigned every month. */
  assigned: Cents
  /** Spending pattern, if the category is spent from. */
  spend?: { account: Account; day?: number; perMonth: number; min: Cents; max: Cents; payees: string[] }
}

const plans: Plan[] = [
  { category: cat('rent', 'demo-g-bills', 'Rent'), assigned: 165000, spend: { account: checking, day: 1, perMonth: 1, min: 165000, max: 165000, payees: ['Maple Street Apartments'] } },
  { category: cat('electric', 'demo-g-bills', 'Electric'), assigned: 12000, spend: { account: checking, day: 12, perMonth: 1, min: 6400, max: 11800, payees: ['City Power & Light'] } },
  { category: cat('internet', 'demo-g-bills', 'Internet'), assigned: 7000, spend: { account: visa, day: 8, perMonth: 1, min: 6999, max: 6999, payees: ['Fiber Co'] } },
  { category: cat('phone', 'demo-g-bills', 'Phone'), assigned: 5500, spend: { account: visa, day: 19, perMonth: 1, min: 5500, max: 5500, payees: ['Mint Mobile'] } },
  { category: cat('insurance', 'demo-g-bills', 'Car insurance'), assigned: 14000, spend: { account: checking, day: 4, perMonth: 1, min: 14000, max: 14000, payees: ['Lemonade'] } },
  { category: cat('groceries', 'demo-g-everyday', 'Groceries'), assigned: 65000, spend: { account: visa, perMonth: 5, min: 6000, max: 13000, payees: ["Trader Joe's", 'Safeway', 'Costco', 'Berkeley Bowl'] } },
  { category: cat('dining', 'demo-g-everyday', 'Dining out'), assigned: 30000, spend: { account: visa, perMonth: 6, min: 1400, max: 5000, payees: ['Chipotle', 'Pho 88', 'Blue Bottle', 'Zachary’s Pizza', 'Sushi Ran'] } },
  { category: cat('gas', 'demo-g-everyday', 'Gas'), assigned: 13500, spend: { account: visa, perMonth: 2, min: 4200, max: 6600, payees: ['Shell', 'Chevron'] } },
  { category: cat('household', 'demo-g-everyday', 'Household'), assigned: 14500, spend: { account: visa, perMonth: 2, min: 1800, max: 7200, payees: ['Target', 'Ace Hardware', 'Amazon'] } },
  { category: cat('fun', 'demo-g-everyday', 'Fun money'), assigned: 18000, spend: { account: visa, perMonth: 3, min: 1200, max: 5900, payees: ['Steam', 'AMC Theatres', 'Moe’s Books', 'Spotify'] } },
  { category: cat('vacation', 'demo-g-goals', 'Vacation', true), assigned: 40000 },
  { category: cat('emergency', 'demo-g-goals', 'Emergency fund', true), assigned: 50000 },
  { category: cat('house', 'demo-g-goals', 'House down payment', true), assigned: 85000 },
]

/** Recent card transactions the "bank" just imported, not yet categorized: [days ago, payee, amount]. */
const UNCATEGORIZED: [number, string, Cents][] = [
  [1, 'Whole Foods', -8734],
  [2, 'Netflix', -1549],
  [3, 'Safeway', -6210],
  [4, 'Uber', -2380],
  [6, 'Whole Foods', -4315],
  [7, 'Shell', -5122],
  [9, 'Whole Foods', -11260],
  [11, 'Safeway', -7890],
]

/** Rules the demo household already made; see src/model/payeeRules.ts. */
const payeeRules: Record<string, string> = { 'Acme Corp': INCOME_CATEGORY_ID, 'Maple Street Apartments': 'demo-rent' }

const PAYCHECK: Cents = 260000 // twice a month; the plans above assign almost all of it
const SAVINGS_TRANSFER: Cents = 200000 // roughly what the goals set aside
const OPENING_CHECKING: Cents = 320000
const OPENING_SAVINGS: Cents = 850000

function cat(id: string, groupId: string, name: string, reserve = false): Category {
  return { id: `demo-${id}`, groupId, name, hidden: false, ...(reserve ? { reserve } : {}) }
}

/** mulberry32: small seeded PRNG so the demo is deterministic. */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function daysIn(month: MonthKey): number {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

const iso = (month: MonthKey, day: number) => `${month}-${String(day).padStart(2, '0')}`

export function sampleBudget(today = new Date().toISOString().slice(0, 10)): BudgetFile {
  const random = rng(20260101)
  const thisMonth = currentMonth()
  const months = Array.from({ length: MONTHS }, (_, i) => addMonths(thisMonth, i - (MONTHS - 1)))
  const first = months[0]

  const transactions: Transaction[] = []
  let n = 0
  const add = (t: Omit<Transaction, 'id' | 'cleared' | 'memo'> & { memo?: string }) => {
    if (t.date > today) return
    // Old months are reconciled, recent ones cleared, and the last few days are still pending.
    const age = (new Date(today).getTime() - new Date(t.date).getTime()) / 86400000
    const cleared = age > 45 ? 'reconciled' : age > 3 ? 'cleared' : 'uncleared'
    transactions.push({ id: `demo-t${++n}`, memo: '', cleared, ...t })
  }
  const between = (min: Cents, max: Cents) => min + Math.round(random() * (max - min))
  const pick = <T,>(xs: T[]) => xs[Math.floor(random() * xs.length)]

  // Opening balances, entered as income in the first month.
  add({ accountId: checking.id, date: iso(first, 1), payee: 'Starting balance', categoryId: INCOME_CATEGORY_ID, amount: OPENING_CHECKING, transferAccountId: null })
  add({ accountId: savings.id, date: iso(first, 1), payee: 'Starting balance', categoryId: INCOME_CATEGORY_ID, amount: OPENING_SAVINGS, transferAccountId: null })

  const assigned: BudgetFile['assigned'] = {}
  let cardSpend = 0 // pays off last month's card spend on the 20th
  for (const month of months) {
    assigned[month] = Object.fromEntries(plans.map((p) => [p.category.id, p.assigned]))
    // The opening balances were already saved up: park them in the emergency fund.
    if (month === first) assigned[month]['demo-emergency'] += OPENING_CHECKING + OPENING_SAVINGS

    for (const day of [1, 15]) {
      add({ accountId: checking.id, date: iso(month, day), payee: 'Acme Corp', categoryId: INCOME_CATEGORY_ID, amount: PAYCHECK, transferAccountId: null })
    }

    let spentOnCard = 0
    for (const p of plans) {
      if (!p.spend) continue
      const days = p.spend.day ? [p.spend.day] : Array.from({ length: p.spend.perMonth }, () => 1 + Math.floor(random() * daysIn(month))).sort((a, b) => a - b)
      for (const day of days) {
        const amount = -between(p.spend.min, p.spend.max)
        if (p.spend.account === visa) spentOnCard += amount
        add({ accountId: p.spend.account.id, date: iso(month, day), payee: pick(p.spend.payees), categoryId: p.category.id, amount, transferAccountId: null })
      }
    }

    if (cardSpend !== 0) {
      add({ accountId: checking.id, date: iso(month, 20), payee: 'Transfer : Visa', categoryId: null, amount: cardSpend, transferAccountId: visa.id })
      add({ accountId: visa.id, date: iso(month, 20), payee: 'Transfer : Checking', categoryId: null, amount: -cardSpend, transferAccountId: checking.id })
    }
    cardSpend = spentOnCard

    add({ accountId: checking.id, date: iso(month, 16), payee: 'Transfer : Savings', categoryId: null, amount: -SAVINGS_TRANSFER, transferAccountId: savings.id })
    add({ accountId: savings.id, date: iso(month, 16), payee: 'Transfer : Checking', categoryId: null, amount: SAVINGS_TRANSFER, transferAccountId: checking.id })
  }

  const daysAgo = (n: number) => new Date(Date.parse(today) - n * 86400000).toISOString().slice(0, 10)
  for (const [ago, payee, amount] of UNCATEGORIZED) {
    add({ accountId: visa.id, date: daysAgo(ago), payee, categoryId: null, amount, transferAccountId: null })
  }

  transactions.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))

  // Pretend the bank agrees with everything that has cleared, so reconciliation shows green.
  const accounts = [checking, savings, visa].map((a) => ({
    ...a,
    bankBalance: transactions.filter((t) => t.accountId === a.id && t.cleared !== 'uncleared').reduce((sum, t) => sum + t.amount, 0),
    bankBalanceDate: today,
  }))

  return {
    version: 1,
    name: 'Demo budget',
    accounts,
    categoryGroups: groups,
    categories: plans.map((p) => p.category),
    transactions,
    assigned,
    payeeRules,
  }
}
