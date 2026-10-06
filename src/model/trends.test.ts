import { describe, expect, it } from 'vitest'
import { buildReport, monthRange } from './reports'
import { categoryDirections, planVsActual, rollingAverage, sameMonthLastYear, savingsRateByMonth } from './trends'
import { emptyBudget, INCOME_CATEGORY_ID, type BudgetFile, type Transaction } from './types'

function fixture(): BudgetFile {
  const f = emptyBudget('t')
  f.accounts.push(
    { id: 'chk', name: 'Checking', type: 'checking', onBudget: true, closed: false },
    { id: 'visa', name: 'Visa', type: 'credit', onBudget: true, closed: false, paymentCategoryId: 'pay' },
  )
  f.categoryGroups.push({ id: 'g1', name: 'Living', hidden: false }, { id: 'g2', name: 'Savings', hidden: false }, { id: 'gcc', name: 'Credit Card Payments', hidden: false })
  f.categories.push(
    { id: 'food', groupId: 'g1', name: 'Food', hidden: false },
    { id: 'rent', groupId: 'g1', name: 'Rent', hidden: false },
    { id: 'vacation', groupId: 'g2', name: 'Vacation', hidden: false, reserve: true },
    { id: 'pay', groupId: 'gcc', name: 'Visa', hidden: false },
  )
  return f
}

const txn = (p: Partial<Transaction> & Pick<Transaction, 'date' | 'amount'>): Transaction => ({
  id: Math.random().toString(36).slice(2),
  accountId: 'chk',
  payee: '',
  categoryId: null,
  memo: '',
  cleared: 'cleared',
  transferAccountId: null,
  ...p,
})

describe('rollingAverage', () => {
  it('averages each value with the ones before it, up to the window', () => {
    expect(rollingAverage([100, 200, 300, 400])).toEqual([100, 150, 200, 300])
    expect(rollingAverage([100, 200, 300, 400], 2)).toEqual([100, 150, 250, 350])
    expect(rollingAverage([])).toEqual([])
  })
})

describe('savingsRateByMonth', () => {
  it('is income minus living over income, or null without income', () => {
    const f = fixture()
    f.transactions.push(
      txn({ date: '2026-01-02', amount: 100000, categoryId: INCOME_CATEGORY_ID }),
      txn({ date: '2026-01-05', amount: -25000, categoryId: 'food' }),
      txn({ date: '2026-02-05', amount: -25000, categoryId: 'food' }),
    )
    const report = buildReport(f, ['2026-01', '2026-02'])
    expect(savingsRateByMonth(report.summaries)).toEqual([0.75, null])
  })
})

describe('categoryDirections', () => {
  it('compares the recent half of the range with the earlier half, biggest move first, reserves left out', () => {
    const f = fixture()
    const months = monthRange('2026-04', 4)
    f.transactions.push(
      txn({ date: '2026-01-05', amount: -10000, categoryId: 'food' }),
      txn({ date: '2026-02-05', amount: -10000, categoryId: 'food' }),
      txn({ date: '2026-03-05', amount: -30000, categoryId: 'food' }),
      txn({ date: '2026-04-05', amount: -30000, categoryId: 'food' }),
      txn({ date: '2026-01-01', amount: -100000, categoryId: 'rent' }),
      txn({ date: '2026-02-01', amount: -100000, categoryId: 'rent' }),
      txn({ date: '2026-03-01', amount: -90000, categoryId: 'rent' }),
      txn({ date: '2026-04-01', amount: -90000, categoryId: 'rent' }),
      txn({ date: '2026-04-01', amount: -500000, categoryId: 'vacation' }),
    )
    const d = categoryDirections(buildReport(f, months))
    expect(d.map((x) => [x.category.id, x.earlierAvg, x.recentAvg, x.shift, x.pct])).toEqual([
      ['food', 10000, 30000, 20000, 2],
      ['rent', 100000, 90000, -10000, -0.1],
    ])
    expect(d[0].byMonth).toEqual([10000, 10000, 30000, 30000])
  })

  it('reports no percentage when nothing was spent earlier', () => {
    const f = fixture()
    f.transactions.push(txn({ date: '2026-04-05', amount: -5000, categoryId: 'food' }))
    const d = categoryDirections(buildReport(f, monthRange('2026-04', 4)))
    expect(d[0].pct).toBeNull()
    expect(d[0].shift).toBe(2500)
  })
})

describe('sameMonthLastYear', () => {
  it('lines a month up against the same month a year before', () => {
    const f = fixture()
    f.transactions.push(
      txn({ date: '2025-03-02', amount: 100000, categoryId: INCOME_CATEGORY_ID }),
      txn({ date: '2025-03-05', amount: -20000, categoryId: 'food' }),
      txn({ date: '2025-03-06', amount: -50000, categoryId: 'rent' }),
      txn({ date: '2026-03-02', amount: 120000, categoryId: INCOME_CATEGORY_ID }),
      txn({ date: '2026-03-05', amount: -26000, categoryId: 'food' }),
      txn({ date: '2026-03-06', amount: -50000, categoryId: 'rent' }),
      txn({ date: '2026-02-06', amount: -99999, categoryId: 'rent' }), // another month, ignored
    )
    const y = sameMonthLastYear(f, '2026-03')
    expect(y.lastYear).toBe('2025-03')
    expect(y.hasLastYear).toBe(true)
    expect(y.totals.income).toEqual({ now: 120000, before: 100000, change: 20000 })
    expect(y.totals.living).toEqual({ now: 76000, before: 70000, change: 6000 })
    expect(y.totals.net).toEqual({ now: 44000, before: 30000, change: 14000 })
    expect(y.categories.map((c) => [c.category.id, c.now, c.before, c.change])).toEqual([
      ['food', 26000, 20000, 6000],
      ['rent', 50000, 50000, 0],
    ])
  })

  it('says when last year has nothing', () => {
    const f = fixture()
    f.transactions.push(txn({ date: '2026-03-05', amount: -26000, categoryId: 'food' }))
    expect(sameMonthLastYear(f, '2026-03').hasLastYear).toBe(false)
  })
})

describe('planVsActual', () => {
  it('sets assigned against living spending and counts overspent categories', () => {
    const f = fixture()
    f.assigned['2026-01'] = { food: 20000, rent: 100000, vacation: 50000, pay: 999 }
    f.assigned['2026-02'] = { food: 20000, rent: 100000 }
    f.transactions.push(
      txn({ date: '2026-01-02', amount: 300000, categoryId: INCOME_CATEGORY_ID }),
      txn({ date: '2026-01-05', amount: -25000, categoryId: 'food' }), // over by 5000
      txn({ date: '2026-01-06', amount: -100000, categoryId: 'rent' }),
      txn({ date: '2026-02-05', amount: -15000, categoryId: 'food' }),
      txn({ date: '2026-02-06', amount: -100000, categoryId: 'rent' }),
    )
    const plan = planVsActual(f, ['2026-01', '2026-02'])
    expect(plan).toEqual([
      { month: '2026-01', assigned: 120000, spent: 125000, difference: -5000, overspent: 1 },
      { month: '2026-02', assigned: 120000, spent: 115000, difference: 5000, overspent: 0 },
    ])
  })
})
