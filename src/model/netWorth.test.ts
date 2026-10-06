import { describe, expect, it } from 'vitest'
import { netWorthHistory } from './netWorth'
import { emptyBudget, type BudgetFile, type Transaction } from './types'

function fixture(): BudgetFile {
  const f = emptyBudget('t')
  f.accounts.push(
    { id: 'chk', name: 'Checking', type: 'checking', onBudget: true, closed: false },
    { id: 'visa', name: 'Visa', type: 'credit', onBudget: true, closed: false },
    { id: 'ira', name: 'IRA', type: 'investment', onBudget: false, closed: false },
    { id: 'old', name: 'Old', type: 'checking', onBudget: true, closed: true },
  )
  return f
}

const txn = (p: Partial<Transaction> & Pick<Transaction, 'date' | 'amount' | 'accountId'>): Transaction => ({
  id: Math.random().toString(36).slice(2),
  payee: '',
  categoryId: null,
  memo: '',
  cleared: 'cleared',
  transferAccountId: null,
  ...p,
})

const months = ['2026-02', '2026-03', '2026-04']

describe('netWorthHistory', () => {
  it('carries balances forward month to month, including what happened before the range', () => {
    const f = fixture()
    f.transactions.push(
      txn({ accountId: 'chk', date: '2025-12-01', amount: 100000 }),
      txn({ accountId: 'chk', date: '2026-02-10', amount: 50000 }),
      txn({ accountId: 'chk', date: '2026-04-10', amount: -20000 }),
    )
    const h = netWorthHistory(f, months)
    expect(h.accounts.map((a) => a.account.id)).toEqual(['chk'])
    expect(h.accounts[0].byMonth).toEqual([150000, 150000, 130000])
    expect(h.summaries.map((s) => s.net)).toEqual([150000, 150000, 130000])
    expect(h.net).toBe(130000)
    expect(h.change).toBe(-20000)
    expect(h.changeLastMonth).toBe(-20000)
    expect(h.firstMonth).toBe('2025-12')
  })

  it('counts a card balance as debt and an off-budget account as an asset', () => {
    const f = fixture()
    f.transactions.push(
      txn({ accountId: 'chk', date: '2026-02-01', amount: 100000 }),
      txn({ accountId: 'visa', date: '2026-02-05', amount: -30000 }),
      txn({ accountId: 'ira', date: '2026-03-01', amount: 500000 }),
      txn({ accountId: 'chk', date: '2026-03-20', amount: -30000, transferAccountId: 'visa' }),
      txn({ accountId: 'visa', date: '2026-03-20', amount: 30000, transferAccountId: 'chk' }),
    )
    const h = netWorthHistory(f, months)
    const feb = h.summaries[0]
    expect([feb.assets, feb.debts, feb.net, feb.onBudget, feb.offBudget]).toEqual([100000, 30000, 70000, 70000, 0])
    const mar = h.summaries[1]
    expect([mar.assets, mar.debts, mar.net, mar.onBudget, mar.offBudget]).toEqual([570000, 0, 570000, 70000, 500000])
    expect(h.change).toBe(500000)
    expect(h.changeLastMonth).toBe(0)
  })

  it('drops accounts with nothing in the range and ignores transactions after it', () => {
    const f = fixture()
    f.transactions.push(txn({ accountId: 'chk', date: '2026-01-01', amount: 1000 }), txn({ accountId: 'old', date: '2026-05-01', amount: 999 }))
    const h = netWorthHistory(f, months)
    expect(h.accounts.map((a) => a.account.id)).toEqual(['chk'])
    expect(h.summaries.map((s) => s.net)).toEqual([1000, 1000, 1000])
  })

  it('is empty-safe', () => {
    const h = netWorthHistory(fixture(), months)
    expect(h.accounts).toEqual([])
    expect(h.net).toBe(0)
    expect(h.firstMonth).toBeNull()
  })
})
