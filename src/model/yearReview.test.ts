import { describe, expect, it } from 'vitest'
import { emptyBudget, INCOME_CATEGORY_ID, type BudgetFile, type Transaction } from './types'
import { buildYearReview } from './yearReview'

function fixture(): BudgetFile {
  const f = emptyBudget('t')
  f.accounts.push(
    { id: 'chk', name: 'Checking', type: 'checking', onBudget: true, closed: false },
    { id: 'visa', name: 'Visa', type: 'credit', onBudget: true, closed: false, paymentCategoryId: 'pay' },
    { id: 'ira', name: 'IRA', type: 'investment', onBudget: false, closed: false },
  )
  f.categoryGroups.push({ id: 'g1', name: 'Living', hidden: false }, { id: 'gcc', name: 'Credit Card Payments', hidden: false })
  f.categories.push(
    { id: 'food', groupId: 'g1', name: 'Food', hidden: false },
    { id: 'rent', groupId: 'g1', name: 'Rent', hidden: false },
    { id: 'vac', groupId: 'g1', name: 'Vacation', hidden: false, reserve: true },
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

describe('buildYearReview', () => {
  it('covers a full past year and totals it', () => {
    const f = fixture()
    f.transactions.push(
      txn({ date: '2025-01-01', amount: 500000, categoryId: INCOME_CATEGORY_ID, payee: 'Job' }),
      txn({ date: '2025-01-05', amount: -100000, categoryId: 'rent', payee: 'Landlord' }),
      txn({ date: '2025-02-01', amount: 500000, categoryId: INCOME_CATEGORY_ID, payee: 'Job' }),
      txn({ date: '2025-02-05', amount: -100000, categoryId: 'rent', payee: 'Landlord' }),
      txn({ date: '2025-02-09', amount: -30000, categoryId: 'food', payee: 'Grocer' }),
      txn({ date: '2025-02-20', amount: -20000, categoryId: 'vac', payee: 'Hotel' }), // draw from reserve
    )
    f.assigned['2025-02'] = { vac: 10000 }
    const r = buildYearReview(f, 2025, '2026-10-06')
    expect(r.months).toHaveLength(12)
    expect(r.months[0]).toBe('2025-01')
    expect(r.months[11]).toBe('2025-12')
    expect(r.partial).toBe(false)
    expect(r.totals).toEqual({ income: 1000000, living: 230000, setAside: 10000, drawn: 20000, net: 760000, savingsRate: 0.77, monthsCounted: 2 })
    expect(r.bestMonth).toEqual({ month: '2025-01', value: 400000 })
    expect(r.worstMonth).toEqual({ month: '2025-02', value: 360000 })
    expect(r.biggestSpend).toEqual({ month: '2025-02', value: 130000 })
  })

  it('cuts the current year off at the current month', () => {
    const f = fixture()
    f.transactions.push(txn({ date: '2026-03-01', amount: -1000, categoryId: 'food' }))
    const r = buildYearReview(f, 2026, '2026-10-06')
    expect(r.months).toHaveLength(10)
    expect(r.months[9]).toBe('2026-10')
    expect(r.partial).toBe(true)
    expect(buildYearReview(f, 2027, '2026-10-06').months).toEqual([])
  })

  it('has no highlights without activity', () => {
    const r = buildYearReview(fixture(), 2025, '2026-10-06')
    expect(r.bestMonth).toBeNull()
    expect(r.worstMonth).toBeNull()
    expect(r.biggestSpend).toBeNull()
    expect(r.priorYear).toBeNull()
    expect(r.years).toEqual([])
  })

  it('ranks living categories with their share, leaving reserves out', () => {
    const f = fixture()
    f.transactions.push(
      txn({ date: '2025-01-05', amount: -75000, categoryId: 'rent' }),
      txn({ date: '2025-03-05', amount: -25000, categoryId: 'food' }),
      txn({ date: '2025-03-06', amount: -99000, categoryId: 'vac' }),
      txn({ date: '2025-03-07', amount: -99000, categoryId: 'pay', accountId: 'visa' }),
    )
    const r = buildYearReview(f, 2025, '2026-10-06')
    expect(r.topCategories.map((c) => [c.category.id, c.total, c.share])).toEqual([
      ['rent', 75000, 0.75],
      ['food', 25000, 0.25],
    ])
    expect(r.topCategories[0].average).toBe(37500) // per month with data: January and March
  })

  it('ranks payees by net money out, skipping income, transfers and off-budget accounts', () => {
    const f = fixture()
    f.transactions.push(
      txn({ date: '2025-01-05', amount: -10000, categoryId: 'food', payee: 'Grocer' }),
      txn({ date: '2025-02-05', amount: -20000, categoryId: 'food', payee: 'Grocer' }),
      txn({ date: '2025-02-06', amount: 5000, categoryId: 'food', payee: 'Grocer' }), // refund
      txn({ date: '2025-02-07', amount: -3000, categoryId: null, payee: 'Mystery' }), // uncategorized still counts
      txn({ date: '2025-02-08', amount: -40000, categoryId: 'vac', payee: 'Hotel' }),
      txn({ date: '2025-02-09', amount: 500000, categoryId: INCOME_CATEGORY_ID, payee: 'Job' }),
      txn({ date: '2025-02-10', amount: -99999, categoryId: 'food', payee: 'Grocer', accountId: 'ira' }),
      txn({ date: '2025-02-11', amount: -99999, categoryId: 'food', payee: 'Grocer', transferAccountId: 'ira' }),
      txn({ date: '2025-02-12', amount: -99999, categoryId: 'pay', payee: 'Visa', accountId: 'visa' }),
      txn({ date: '2024-12-31', amount: -99999, categoryId: 'food', payee: 'Grocer' }), // last year
    )
    const r = buildYearReview(f, 2025, '2026-10-06')
    expect(r.topPayees.map((p) => [p.payee, p.total, p.count])).toEqual([
      ['Hotel', 40000, 1],
      ['Grocer', 25000, 3],
      ['Mystery', 3000, 1],
    ])
  })

  it('compares with the prior year over the same months and lists category changes', () => {
    const f = fixture()
    f.transactions.push(
      txn({ date: '2025-01-01', amount: 100000, categoryId: INCOME_CATEGORY_ID }),
      txn({ date: '2025-01-05', amount: -50000, categoryId: 'rent' }),
      txn({ date: '2025-02-05', amount: -10000, categoryId: 'food' }),
      txn({ date: '2025-11-05', amount: -99999, categoryId: 'food' }), // outside the compared months
      txn({ date: '2026-01-01', amount: 120000, categoryId: INCOME_CATEGORY_ID }),
      txn({ date: '2026-01-05', amount: -60000, categoryId: 'rent' }),
      txn({ date: '2026-02-05', amount: -4000, categoryId: 'food' }),
    )
    const r = buildYearReview(f, 2026, '2026-03-15')
    expect(r.months).toEqual(['2026-01', '2026-02', '2026-03'])
    expect(r.priorYear).toEqual({ income: 100000, living: 60000, setAside: 0, drawn: 0, net: 40000, savingsRate: 0.4, monthsCounted: 2 })
    expect(r.categoryChanges.up.map((c) => [c.category.id, c.thisYear, c.priorYear, c.change])).toEqual([['rent', 60000, 50000, 10000]])
    expect(r.categoryChanges.down.map((c) => [c.category.id, c.change])).toEqual([['food', -6000]])
    expect(r.years).toEqual([2025, 2026])
  })
})
