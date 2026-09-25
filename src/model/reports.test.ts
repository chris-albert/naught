import { describe, expect, it } from 'vitest'
import { buildReport, monthRange } from './reports'
import { emptyBudget, INCOME_CATEGORY_ID, type BudgetFile, type Transaction } from './types'

function fixture(): BudgetFile {
  const f = emptyBudget('t')
  f.accounts.push(
    { id: 'chk', name: 'Checking', type: 'checking', onBudget: true, closed: false },
    { id: 'visa', name: 'Visa', type: 'credit', onBudget: true, closed: false, paymentCategoryId: 'pay' },
    { id: 'ira', name: 'IRA', type: 'investment', onBudget: false, closed: false },
  )
  f.categoryGroups.push({ id: 'g1', name: 'Living', hidden: false }, { id: 'g2', name: 'Savings', hidden: false }, { id: 'gcc', name: 'Credit Card Payments', hidden: false })
  f.categories.push(
    { id: 'food', groupId: 'g1', name: 'Food', hidden: false },
    { id: 'rent', groupId: 'g1', name: 'Rent', hidden: false },
    { id: 'vacation', groupId: 'g2', name: 'Vacation', hidden: false, reserve: true },
    { id: 'buffer', groupId: 'g2', name: 'Buffer', hidden: false, reserve: true },
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

describe('monthRange', () => {
  it('produces consecutive months ending at the given one', () => {
    expect(monthRange('2026-02', 3)).toEqual(['2025-12', '2026-01', '2026-02'])
  })
})

describe('buildReport', () => {
  it('summarises income, living spending, net and uncategorized per month', () => {
    const f = fixture()
    f.transactions.push(
      txn({ date: '2026-01-01', amount: 500000, categoryId: INCOME_CATEGORY_ID }),
      txn({ date: '2026-01-05', amount: -10000, categoryId: 'food' }),
      txn({ date: '2026-01-06', amount: 2000, categoryId: 'food' }), // refund
      txn({ date: '2026-01-07', amount: -150000, categoryId: 'rent', accountId: 'visa' }),
      txn({ date: '2026-01-08', amount: -700 }), // uncategorized
      txn({ date: '2026-01-09', amount: -3000, transferAccountId: 'visa' }), // transfer
      txn({ date: '2026-01-12', amount: -250000, categoryId: 'vacation', transferAccountId: 'ira' }), // categorized transfer out
      txn({ date: '2026-01-13', amount: 250000, categoryId: 'vacation', transferAccountId: 'ira' }), // and back
      txn({ date: '2026-01-10', amount: -99999, categoryId: 'food', accountId: 'ira' }), // off budget
      txn({ date: '2026-01-11', amount: 100, categoryId: INCOME_CATEGORY_ID, payee: 'Starting Balance' }),
    )
    const r = buildReport(f, ['2026-01'])
    expect(r.summaries[0]).toEqual({
      month: '2026-01',
      income: 500000,
      living: 158000,
      setAside: 0,
      drawn: 0,
      net: 342000,
      cumulativeNet: 342000,
      uncategorized: 1,
    })
    expect(r.savingsRate).toBeCloseTo(0.684)
  })

  it('puts a vacation in the month it was funded, not the month it was taken', () => {
    const f = fixture()
    f.transactions.push(
      txn({ date: '2026-06-01', amount: 1000000, categoryId: INCOME_CATEGORY_ID }),
      txn({ date: '2026-06-05', amount: -600000, categoryId: 'rent' }),
      txn({ date: '2026-07-01', amount: 1000000, categoryId: INCOME_CATEGORY_ID }),
      txn({ date: '2026-07-05', amount: -600000, categoryId: 'rent' }),
      txn({ date: '2026-07-15', amount: -500000, categoryId: 'vacation' }),
    )
    f.assigned['2026-06'] = { rent: 600000, vacation: 400000 }
    f.assigned['2026-07'] = { rent: 600000 }
    const r = buildReport(f, ['2026-06', '2026-07'])
    expect(r.summaries[0]).toMatchObject({ income: 1000000, living: 600000, setAside: 400000, drawn: 0, net: 0 })
    expect(r.summaries[1]).toMatchObject({ income: 1000000, living: 600000, setAside: 0, drawn: 500000, net: 400000, cumulativeNet: 400000 })
    expect(r.avgSetAside).toBe(200000)
  })

  it('treats a paycheck parked in a reserve as income and its release as nothing new', () => {
    const f = fixture()
    f.transactions.push(
      txn({ date: '2026-01-01', amount: 800000, categoryId: 'buffer' }), // paycheck into Buffer
      txn({ date: '2026-01-05', amount: -300000, categoryId: 'rent' }),
    )
    f.assigned['2026-01'] = { buffer: -800000, rent: 300000 } // released from Buffer, assigned to rent
    const r = buildReport(f, ['2026-01'])
    expect(r.summaries[0]).toMatchObject({ income: 800000, living: 300000, setAside: 0, net: 500000 })
  })

  it('reports categories by group with net inflows negative, and excludes reserves and payment categories from movers', () => {
    const f = fixture()
    f.transactions.push(
      txn({ date: '2026-01-05', amount: -10000, categoryId: 'food' }),
      txn({ date: '2026-02-05', amount: -30000, categoryId: 'food' }),
      txn({ date: '2026-02-07', amount: -150000, categoryId: 'rent' }),
      txn({ date: '2026-02-08', amount: -900000, categoryId: 'vacation' }),
      txn({ date: '2026-02-09', amount: 50000, categoryId: 'buffer' }),
    )
    const r = buildReport(f, ['2026-01', '2026-02'])
    expect(r.groups.map((g) => g.group.id)).toEqual(['g1', 'g2'])
    const food = r.groups[0].categories.find((c) => c.category.id === 'food')!
    expect(food).toMatchObject({ byMonth: [10000, 30000], total: 40000, average: 20000, soFar: 30000, soFarAverage: 10000, deltaVsAverage: 20000 })
    expect(r.groups[1].categories.find((c) => c.category.id === 'buffer')!.byMonth).toEqual([0, -50000])
    expect(r.movers.map((c) => c.category.id)).toEqual(['rent', 'food'])
  })

  it('compares the last month through a given day with the same window in earlier months', () => {
    const f = fixture()
    f.transactions.push(
      txn({ date: '2026-01-01', amount: -150000, categoryId: 'rent' }),
      txn({ date: '2026-01-05', amount: -10000, categoryId: 'food' }),
      txn({ date: '2026-01-20', amount: -20000, categoryId: 'food' }),
      txn({ date: '2026-02-01', amount: -150000, categoryId: 'rent' }),
      txn({ date: '2026-02-05', amount: -25000, categoryId: 'food' }),
      txn({ date: '2026-02-20', amount: -5000, categoryId: 'food' }), // after the cutoff, so not counted
      txn({ date: '2026-03-01', amount: -150000, categoryId: 'rent' }),
      txn({ date: '2026-03-06', amount: 3000, categoryId: 'food' }), // refund inside the window
    )
    const r = buildReport(f, ['2026-01', '2026-02', '2026-03'], 10)
    const byId = Object.fromEntries(r.groups[0].categories.map((c) => [c.category.id, c]))
    expect(byId.rent).toMatchObject({ soFar: 150000, soFarAverage: 150000, deltaVsAverage: 0 })
    expect(byId.food).toMatchObject({ byMonth: [30000, 30000, -3000], soFar: -3000, soFarAverage: 17500, deltaVsAverage: -20500 })
    expect(r.movers.map((c) => c.category.id)).toEqual(['food', 'rent'])
  })

  it('totals monthly targets on visible categories, skipping hidden and payment categories', () => {
    const f = fixture()
    f.categories.find((c) => c.id === 'rent')!.target = 150000
    f.categories.find((c) => c.id === 'vacation')!.target = 20000
    f.categories.find((c) => c.id === 'pay')!.target = 99999
    f.categories.push({ id: 'old', groupId: 'g1', name: 'Old', hidden: true, target: 5000 })
    expect(buildReport(f, ['2026-01']).targets).toBe(170000)
  })
})
