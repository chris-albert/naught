import { describe, expect, it } from 'vitest'
import { buildMonthReview } from './monthReview'
import { emptyBudget, INCOME_CATEGORY_ID, type BudgetFile, type Transaction } from './types'

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

/** Three full months (Jan–Mar) of paychecks, rent on the 1st and food on the 5th and 20th, then a partial April. */
function withHistory(f: BudgetFile) {
  for (const m of ['2026-01', '2026-02', '2026-03']) {
    f.transactions.push(
      txn({ date: `${m}-01`, amount: 500000, categoryId: INCOME_CATEGORY_ID, payee: 'Acme' }),
      txn({ date: `${m}-01`, amount: -150000, categoryId: 'rent', payee: 'Landlord' }),
      txn({ date: `${m}-05`, amount: -20000, categoryId: 'food', payee: 'Grocer' }),
      txn({ date: `${m}-20`, amount: -30000, categoryId: 'food', payee: 'Grocer' }),
    )
  }
  f.transactions.push(
    txn({ date: '2026-04-01', amount: 500000, categoryId: INCOME_CATEGORY_ID, payee: 'Acme' }),
    txn({ date: '2026-04-05', amount: -25000, categoryId: 'food', payee: 'Grocer' }),
  )
  return f
}

describe('buildMonthReview', () => {
  it('reads the current month through today and compares with the month before and the earlier average', () => {
    const r = buildMonthReview(withHistory(fixture()), '2026-04', '2026-04-10')
    expect(r.current).toBe(true)
    expect(r.throughDay).toBe(10)
    expect(r.prevMonth).toBe('2026-03')
    expect(r.comparedMonths).toBe(3)
    expect(r.income).toEqual({ value: 500000, vsPrev: 0, vsAverage: 0 })
    // March living was 200000; the earlier average is the same
    expect(r.living).toEqual({ value: 25000, vsPrev: -175000, vsAverage: -175000 })
    expect(r.net).toEqual({ value: 475000, vsPrev: 175000, vsAverage: 175000 })
    expect(r.savingsRate.value).toBeCloseTo(0.95)
    expect(r.savingsRate.vsPrev).toBeCloseTo(0.95 - 0.6)
    expect(r.savingsRate.vsAverage).toBeCloseTo(0.95 - 0.6)
  })

  it('projects the month by adding what usually gets spent after today', () => {
    const r = buildMonthReview(withHistory(fixture()), '2026-04', '2026-04-10')
    // rent: always in by the 10th, nothing left; food: 50000 a month, 20000 by the 10th, so 30000 still to come
    expect(r.pace).toEqual({ livingSoFar: 25000, projected: 55000, averageMonth: 200000, daysLeft: 20 })
  })

  it('reads a past month in full with no pace', () => {
    const r = buildMonthReview(withHistory(fixture()), '2026-03', '2026-04-10')
    expect(r.current).toBe(false)
    expect(r.throughDay).toBe(31)
    expect(r.pace).toBeNull()
    expect(r.living.value).toBe(200000)
    expect(r.living.vsPrev).toBe(0)
    expect(r.missing).toEqual([])
  })

  it('lists the usual spending that has not shown up yet', () => {
    const r = buildMonthReview(withHistory(fixture()), '2026-04', '2026-04-10')
    // food has been spent this month; rent (usually on the 1st) has not
    expect(r.missing.map((m) => [m.category.id, m.usual])).toEqual([['rent', 150000]])
  })

  it('does not call a category missing when it rarely has spending by now', () => {
    const f = withHistory(fixture())
    f.categories.push({ id: 'gift', groupId: 'g1', name: 'Gifts', hidden: false })
    f.transactions.push(txn({ date: '2026-02-03', amount: -5000, categoryId: 'gift' }))
    const r = buildMonthReview(f, '2026-04', '2026-04-10')
    expect(r.missing.map((m) => m.category.id)).toEqual(['rent'])
  })

  it('reports the plan against what happened and the overspent categories', () => {
    const f = withHistory(fixture())
    f.assigned['2026-03'] = { rent: 150000, food: 40000, vac: 10000, pay: 999 }
    const r = buildMonthReview(f, '2026-03', '2026-04-10')
    expect(r.budget.assigned).toBe(200000)
    expect(r.budget.spent).toBe(200000)
    expect(r.budget.overspent.map((o) => [o.category.id, o.assigned, o.activity, o.available])).toEqual([['food', 40000, -50000, -10000]])
  })

  it('lists the five biggest outflows, counting uncategorized ones and skipping transfers, off-budget and card payments', () => {
    const f = withHistory(fixture())
    f.transactions.push(
      txn({ date: '2026-04-02', amount: -90000, categoryId: null, payee: 'Mystery' }),
      txn({ date: '2026-04-03', amount: -1000, categoryId: 'food', payee: 'Cafe' }),
      txn({ date: '2026-04-03', amount: -2000, categoryId: 'food', payee: 'Cafe' }),
      txn({ date: '2026-04-03', amount: -3000, categoryId: 'food', payee: 'Cafe' }),
      txn({ date: '2026-04-04', amount: -4000, categoryId: 'food', payee: 'Cafe' }),
      txn({ date: '2026-04-04', amount: -999999, categoryId: 'food', accountId: 'ira' }),
      txn({ date: '2026-04-04', amount: -999999, categoryId: null, transferAccountId: 'ira' }),
      txn({ date: '2026-04-04', amount: -999999, categoryId: 'pay', accountId: 'visa' }),
    )
    const r = buildMonthReview(f, '2026-04', '2026-04-10')
    expect(r.largest.map((t) => t.amount)).toEqual([-90000, -25000, -4000, -3000, -2000])
  })

  it('leaves the deltas at zero and the rates null with no history', () => {
    const r = buildMonthReview(fixture(), '2026-04', '2026-04-10')
    expect(r.comparedMonths).toBe(0)
    expect(r.income).toEqual({ value: 0, vsPrev: 0, vsAverage: 0 })
    expect(r.savingsRate).toEqual({ value: null, vsPrev: null, vsAverage: null })
    expect(r.pace).toEqual({ livingSoFar: 0, projected: 0, averageMonth: 0, daysLeft: 20 })
    expect(r.budget).toEqual({ assigned: 0, spent: 0, overspent: [] })
  })
})
