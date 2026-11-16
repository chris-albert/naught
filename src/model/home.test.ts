import { describe, expect, it } from 'vitest'
import { buildHome } from './home'
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
