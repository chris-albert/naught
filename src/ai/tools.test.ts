import { describe, expect, it } from 'vitest'
import { sampleBudget } from '../demo/sampleBudget'
import { accountBalance } from '../model/budgetMath'
import { ensurePaymentCategories } from '../model/creditCards'
import { addMonths, currentMonth } from '../model/dates'
import { recurringPayees } from '../model/insights'
import { formatCents } from '../model/money'
import { netWorthHistory } from '../model/netWorth'
import { buildReport, monthRange } from '../model/reports'
import { emptyBudget, type BudgetFile } from '../model/types'
import { financeTools } from './tools'

const today = new Date().toISOString().slice(0, 10)
const thisMonth = currentMonth()

function run(file: BudgetFile, name: string, input: unknown = {}): string {
  const tool = financeTools(file, today).find((t) => t.name === name)!
  tool.inputSchema.parse(input)
  return tool.run(input)
}

describe('financeTools', () => {
  // As the store opens it: with a payment category for the Visa.
  const file = ensurePaymentCategories(sampleBudget(today))

  it('names every tool the page promises', () => {
    expect(financeTools(file, today).map((t) => t.name)).toEqual([
      'spending_by_category',
      'transactions',
      'recurring_payees',
      'month_review',
      'net_worth',
      'budget_month',
      'categories',
      'accounts',
    ])
  })

  it('spending_by_category agrees with the report for the same months', () => {
    const months = monthRange(thisMonth, 3)
    const report = buildReport(file, months, Number(today.slice(8)))
    const text = run(file, 'spending_by_category', { fromMonth: months[0], toMonth: thisMonth })
    const groceries = report.groups.flatMap((g) => g.categories).find((c) => c.category.name === 'Groceries')!
    expect(text).toContain(`Groceries | ${groceries.byMonth.map(formatCents).join(' | ')} | ${formatCents(groceries.total)} | ${formatCents(groceries.average)}`)
    const last = report.summaries[report.summaries.length - 1]
    expect(text).toContain(`${thisMonth} | ${formatCents(last.income)} | ${formatCents(last.living)}`)
    expect(text).toContain('== Bills')
  })

  it('spending_by_category accepts a reversed range and keeps at most 24 months', () => {
    const text = run(file, 'spending_by_category', { fromMonth: thisMonth, toMonth: addMonths(thisMonth, -30) })
    const header = text.split('\n').find((l) => l.startsWith('Category | '))!
    expect(header.split(' | ')).toHaveLength(1 + 24 + 2)
  })

  it('transactions filters by payee and category name, newest first, and caps the rows', () => {
    const text = run(file, 'transactions', { payee: 'safeway', limit: 3 })
    const rows = text.split('\n').slice(2)
    expect(rows).toHaveLength(3)
    for (const r of rows) expect(r).toContain('Safeway')
    expect(rows[0].slice(0, 10) >= rows[1].slice(0, 10)).toBe(true)
    const all = file.transactions.filter((t) => t.payee === 'Safeway')
    expect(text).toContain(`${all.length} matching transactions, net total ${formatCents(all.reduce((s, t) => s + t.amount, 0))}`)

    expect(run(file, 'transactions', { category: 'transfer' })).toContain('Transfer: Savings')
    const uncategorized = run(file, 'transactions', { category: 'uncategorized' })
    expect(uncategorized).toContain('Netflix')
    expect(uncategorized).toContain('(uncategorized)')
  })

  it('transactions applies the minimum amount in dollars and the date range', () => {
    const text = run(file, 'transactions', { minAmount: 1000, fromDate: `${thisMonth}-01`, toDate: today })
    const rows = text.split('\n').slice(2)
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows) {
      expect(r.slice(0, 7)).toBe(thisMonth)
      expect(Math.abs(Number(r.split(' | ')[4].replace(/[$,]/g, '')))).toBeGreaterThanOrEqual(1000)
    }
  })

  it('recurring_payees lists what the insights report finds', () => {
    const summary = recurringPayees(file, today)
    const text = run(file, 'recurring_payees')
    expect(text).toContain(`${summary.count} recurring payees`)
    expect(text).toContain(formatCents(summary.fixedMonthly))
    for (const p of summary.payees) expect(text).toContain(`${p.payee} | `)
  })

  it('month_review covers the current month with its pace and a past month without', () => {
    const current = run(file, 'month_review', {})
    expect(current).toContain('current month')
    expect(current).toContain('Pace with')
    expect(current).toContain('Largest outflows:')
    const past = run(file, 'month_review', { month: addMonths(thisMonth, -1) })
    expect(past).not.toContain('Pace with')
    expect(past).toContain('Income: ')
  })

  it('net_worth matches the net worth history and shows each account', () => {
    const history = netWorthHistory(file, monthRange(thisMonth, 6))
    const text = run(file, 'net_worth', { months: 6 })
    expect(text).toContain(`Net worth ${formatCents(history.net)}`)
    expect(text.split('\n').filter((l) => /^\d{4}-\d{2} \| /.test(l))).toHaveLength(6)
    expect(text).toContain('Checking | on | ')
    expect(text).toContain('Visa | on | ')
  })

  it('budget_month lists groups and categories with assigned, activity and available', () => {
    const text = run(file, 'budget_month', {})
    expect(text).toContain(`Budget for`)
    expect(text).toContain('== Everyday | ')
    expect(text).toMatch(/\nGroceries \| \$650\.00 \| -\$[\d,.]+ \| /)
  })

  it('categories and accounts describe names, kinds and balances', () => {
    const categories = run(file, 'categories')
    expect(categories).toContain('Vacation | Goals | reserve | $500.00 | ')
    expect(categories).toContain('Visa | Credit Card Payments | credit card payment | ')
    const accounts = run(file, 'accounts')
    expect(accounts).toContain(`Checking | checking | on | open | ${formatCents(accountBalance(file, 'demo-checking'))} | `)
  })

  it('handles an empty budget without throwing', () => {
    const empty = emptyBudget('x')
    for (const t of financeTools(empty, today)) {
      const input = t.name === 'spending_by_category' ? { fromMonth: thisMonth, toMonth: thisMonth } : {}
      expect(() => t.run(input)).not.toThrow()
    }
  })
})
