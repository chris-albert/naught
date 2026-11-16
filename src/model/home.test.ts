import { describe, expect, it } from 'vitest'
import { buildHome, spendingCurve } from './home'
import { INCOME_CATEGORY_ID, emptyBudget, type BudgetFile, type Transaction } from './types'

const txn = (p: Partial<Transaction> & Pick<Transaction, 'date' | 'amount'>): Transaction => ({
  id: p.id ?? Math.random().toString(36).slice(2),
  accountId: 'chk',
  payee: '',
  categoryId: null,
  memo: '',
  cleared: 'cleared',
  transferAccountId: null,
  ...p,
})

function fixture(): BudgetFile {
  const f = emptyBudget('t')
  f.accounts.push({ id: 'chk', name: 'Checking', type: 'checking', onBudget: true, closed: false })
  f.accounts.push({ id: 'sav', name: 'Savings', type: 'savings', onBudget: false, closed: false })
  f.categoryGroups.push({ id: 'g', name: 'Everyday', hidden: false })
  f.categories.push(
    { id: 'food', groupId: 'g', name: 'Food', hidden: false, target: 40000 },
    { id: 'fun', groupId: 'g', name: 'Fun', hidden: false, target: 10000 },
    { id: 'old', groupId: 'g', name: 'Old', hidden: true, target: 5000 },
  )
  f.transactions.push(txn({ id: 'pay', date: '2026-09-01', amount: 300000, categoryId: INCOME_CATEGORY_ID }))
  f.assigned['2026-09'] = { food: 25000, fun: 10000 }
  return f
}

describe('buildHome', () => {
  const today = '2026-09-20'

  it('reports what is left to budget for the current month', () => {
    const home = buildHome(fixture(), today)
    expect(home.month).toBe('2026-09')
    expect(home.toBudget).toBe(300000 - 35000)
  })

  it('counts transactions that still need a category, leaving transfers out', () => {
    const f = fixture()
    f.transactions.push(
      txn({ date: '2026-09-05', amount: -1200 }),
      txn({ date: '2026-09-06', amount: -5000, transferAccountId: 'sav' }),
      txn({ date: '2026-09-07', amount: -900, categoryId: 'food' }),
    )
    expect(buildHome(f, today).uncategorized).toBe(1)
  })

  it('lists overspent categories, worst first', () => {
    const f = fixture()
    f.transactions.push(
      txn({ date: '2026-09-10', amount: -26000, categoryId: 'food' }),
      txn({ date: '2026-09-11', amount: -15000, categoryId: 'fun' }),
    )
    const home = buildHome(f, today)
    expect(home.overspent.map((r) => [r.category.id, r.available])).toEqual([
      ['fun', -5000],
      ['food', -1000],
    ])
  })

  it('totals the targets that are not fully assigned, ignoring hidden categories', () => {
    expect(buildHome(fixture(), today).underfunded).toEqual({ count: 1, total: 15000 })
  })

  it('flags open accounts that do not tie out to the bank', () => {
    const f = fixture()
    f.accounts[0] = { ...f.accounts[0], bankBalance: 290000, bankBalanceDate: '2026-09-19T00:00:00.000Z' }
    expect(buildHome(f, today).unmatched.map((r) => [r.account.id, r.difference])).toEqual([['chk', -10000]])

    f.accounts[0] = { ...f.accounts[0], bankBalance: 300000 }
    expect(buildHome(f, today).unmatched).toEqual([])
  })

  it('gives net worth across every account and how it moved since last month ended', () => {
    const f = fixture()
    f.transactions.push(
      txn({ date: '2026-08-15', amount: 50000, accountId: 'sav' }),
      txn({ date: '2026-09-10', amount: -20000, categoryId: 'food' }),
    )
    const home = buildHome(f, today)
    expect(home.netWorth).toBe(330000)
    expect(home.netWorthChange).toBe(280000)
  })

  it('shows the latest transactions newest first, without future-dated ones', () => {
    const f = fixture()
    f.transactions.push(
      txn({ id: 'a', date: '2026-09-18', amount: -100, categoryId: 'food' }),
      txn({ id: 'b', date: '2026-09-25', amount: -100, categoryId: 'food' }),
    )
    expect(buildHome(f, today).recent.map((t) => t.id)).toEqual(['a', 'pay'])
  })
})

describe('spendingCurve', () => {
  const today = '2026-09-04'

  it('adds up living spending day by day through today, netting refunds', () => {
    const f = fixture()
    f.transactions.push(
      txn({ date: '2026-09-01', amount: -1000, categoryId: 'food' }),
      txn({ date: '2026-09-03', amount: -500, categoryId: 'fun' }),
      txn({ date: '2026-09-03', amount: 200, categoryId: 'food' }),
      txn({ date: '2026-09-10', amount: -9000, categoryId: 'food' }), // after today
    )
    expect(spendingCurve(f, today).actual).toEqual([1000, 1000, 1300, 1300])
  })

  it('leaves out income, transfers, uncategorized rows, reserves and off-budget accounts', () => {
    const f = fixture()
    f.categories.push({ id: 'trip', groupId: 'g', name: 'Trip', hidden: false, reserve: true })
    f.transactions.push(
      txn({ date: '2026-09-02', amount: -100 }),
      txn({ date: '2026-09-02', amount: -200, transferAccountId: 'sav' }),
      txn({ date: '2026-09-02', amount: -300, categoryId: 'trip' }),
      txn({ date: '2026-09-02', amount: -400, categoryId: 'food', accountId: 'sav' }),
    )
    expect(spendingCurve(f, today).actual).toEqual([0, 0, 0, 0])
  })

  it('averages the earlier months that had spending, one point per day of this month', () => {
    const f = fixture()
    f.transactions.push(
      txn({ date: '2026-08-01', amount: -1000, categoryId: 'food' }),
      txn({ date: '2026-08-31', amount: -3000, categoryId: 'food' }),
      txn({ date: '2026-07-02', amount: -2000, categoryId: 'food' }),
    )
    const { usual } = spendingCurve(f, today)
    expect(usual).toHaveLength(30)
    expect(usual.slice(0, 3)).toEqual([500, 1500, 1500])
    expect(usual[29]).toBe(1500) // August's charge on the 31st falls outside a 30-day month
  })

  it('has no usual line without history', () => {
    expect(spendingCurve(fixture(), today).usual).toEqual([])
  })
})
