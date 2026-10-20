import { addMonths, monthOf } from './dates'
import { recurringPayees, type RecurringPayee } from './insights'
import { countedLines, spendingCategories } from './ledger'
import { formatCents } from './money'
import type { BudgetFile, Cents, Transaction } from './types'

/*
 * A prompt that hands the recurring-payee list to a chat assistant (Claude, ChatGPT) so it can
 * tell subscriptions and memberships from habits and spot the annual renewals the detector
 * cannot name. Built in the browser; only payee names, amounts, dates and category names go
 * in. Nothing else about the budget leaves the page.
 */

export interface OneTimeCandidate {
  payee: string
  date: string
  /** Positive cents. */
  amount: Cents
  categoryId: string | null
  /** The charge before this one, when there was exactly one more in the window: a renewal the detector did not call yearly. */
  priorDate?: string
}

/** Cents endings a priced product tends to have; a restaurant tab or a grocery run rarely does. */
const ROUND_CENTS = new Set([0, 99, 95, 49, 50])
/** Cash and bank fees come in round amounts too, and are never a subscription. */
const NOT_A_PRODUCT = /^atm\b|\bfee\b|withdrawal|cash advance/i
/** A forgotten renewal is not a five-figure charge; a tax bill or a car is. */
const MAX_AMOUNT = 500_000

/**
 * Payees charged once or twice in the last two years, most recently within 13 months (so a
 * renewal due any day is still in), for a round amount of $20 or more: the shape of an annual
 * renewal the recurring detector cannot see because there is no second charge a year apart.
 * Cash, fees and anything over $5,000 are left out. Biggest first, at most `limit`.
 */
export function oneTimeCandidates(file: BudgetFile, today: string, recurring: RecurringPayee[], limit = 40): OneTimeCandidate[] {
  const categories = spendingCategories(file)
  const from = `${addMonths(monthOf(today), -24)}-01`
  const recentFrom = `${addMonths(monthOf(today), -12)}-01`
  const taken = new Set(recurring.map((p) => p.payee))
  const byPayee = new Map<string, Transaction[]>()
  for (const t of countedLines(file)) {
    if (t.amount >= 0 || !t.payee || t.date < from || t.date > today || taken.has(t.payee) || NOT_A_PRODUCT.test(t.payee)) continue
    if (t.categoryId !== null && !categories.has(t.categoryId)) continue
    let list = byPayee.get(t.payee)
    if (!list) byPayee.set(t.payee, (list = []))
    list.push(t)
  }
  const out: OneTimeCandidate[] = []
  for (const [payee, charges] of byPayee) {
    if (charges.length > 2) continue
    charges.sort((a, b) => (a.date < b.date ? -1 : 1))
    const last = charges[charges.length - 1]
    const amount = -last.amount
    if (last.date < recentFrom || amount < 2000 || amount > MAX_AMOUNT || !ROUND_CENTS.has(amount % 100)) continue
    out.push({ payee, date: last.date, amount, categoryId: last.categoryId, priorDate: charges.length === 2 ? charges[0].date : undefined })
  }
  out.sort((a, b) => b.amount - a.amount)
  return out.slice(0, limit)
}

export function buildSubscriptionPrompt(file: BudgetFile, today: string): string {
  const recurring = recurringPayees(file, today)
  const oneTime = oneTimeCandidates(file, today, recurring.payees)
  const name = (id: string | null) => (id === null ? 'uncategorized' : file.categories.find((c) => c.id === id)?.name ?? '?')
  const lines = [
    `I keep a zero-based budget. Below are the payees my budget app flagged as recurring, plus one-time charges that might be annual renewals. Amounts are USD; today is ${today}.`,
    '',
    'Help me find the subscriptions and memberships I am paying for, especially annual ones I forget about:',
    '1. Annual subscriptions and memberships with amount and next renewal date, soonest first. Include one-time charges that are likely renewals (software, memberships, domains, insurance, annual plans) and leave out restaurants, shops, events and medical visits.',
    '2. Monthly subscriptions with amount. Flag price increases, likely duplicates (one service under two names), trials that turned into charges, and anything that looks stale.',
    '3. Charges that probably belong to the same service under different names.',
    '4. What to cancel or review, and the total monthly and annual cost of what remains.',
    'Be concise and use tables.',
    '',
    'Recurring payees (payee | cadence | amount | last charged | next due | status | category | charges seen):',
    // A monthly payee that varied and then stopped is a habit that ended, not a subscription question.
    ...recurring.payees.filter((p) => !(p.cadence === 'monthly' && !p.stable && p.status === 'stopped')).map((p) =>
      [
        p.payee,
        p.cadence,
        formatCents(p.priceChange?.to ?? p.amount) + (p.priceChange ? ` (was ${formatCents(p.priceChange.from)})` : '') + (p.stable ? '' : ' varies'),
        p.lastDate,
        p.nextDate ?? '-',
        p.status,
        name(p.categoryId),
        String(p.count),
      ].join(' | '),
    ),
    '',
    'One-time charges in the last year that may be renewals (payee | date | amount | category | previous charge):',
    ...oneTime.map((c) => [c.payee, c.date, formatCents(c.amount), name(c.categoryId), c.priorDate ?? '-'].join(' | ')),
  ]
  return lines.join('\n')
}
