import { describe, expect, it } from 'vitest'
import { addDays, balanceHistory, dayRange } from './accountBalances'
import { emptyBudget, type BudgetFile, type Transaction } from './types'

function fixture(): BudgetFile {
  const f = emptyBudget('t')
  f.accounts.push(
    { id: 'chk', name: 'Checking', type: 'checking', onBudget: true, closed: false },
    { id: 'visa', name: 'Visa', type: 'credit', onBudget: true, closed: false },
  )
  return f
}

const txn = (p: Pick<Transaction, 'date' | 'amount' | 'accountId'>): Transaction => ({
  id: Math.random().toString(36).slice(2),
  payee: '',
  categoryId: null,
  memo: '',
  cleared: 'cleared',
  transferAccountId: null,
  ...p,
})

describe('addDays / dayRange', () => {
  it('crosses month and year ends', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDays('2025-12-31', 1)).toBe('2026-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('lists every day inclusive', () => {
    expect(dayRange('2026-02-27', '2026-03-02')).toEqual(['2026-02-27', '2026-02-28', '2026-03-01', '2026-03-02'])
    expect(dayRange('2026-03-02', '2026-03-01')).toEqual([])
  })
})

describe('balanceHistory', () => {
  it('carries the balance forward day by day, folding earlier history into the first day', () => {
    const f = fixture()
    f.transactions.push(
      txn({ accountId: 'chk', date: '2025-12-01', amount: 100000 }),
      txn({ accountId: 'chk', date: '2026-03-01', amount: -20000 }),
      txn({ accountId: 'chk', date: '2026-03-03', amount: 5000 }),
      txn({ accountId: 'chk', date: '2026-03-03', amount: -1000 }),
      txn({ accountId: 'visa', date: '2026-03-02', amount: -99999 }),
      txn({ accountId: 'chk', date: '2026-03-05', amount: 77777 }),
    )
    const h = balanceHistory(f, 'chk', '2026-03-01', '2026-03-04')
    expect(h.points.map((p) => p.balance)).toEqual([80000, 80000, 84000, 84000])
    expect(h.points.map((p) => p.date)).toEqual(['2026-03-01', '2026-03-02', '2026-03-03', '2026-03-04'])
    expect(h.balance).toBe(84000)
    expect(h.change).toBe(4000)
    expect(h.low).toBe(80000)
    expect(h.high).toBe(84000)
  })

  it('shows a card balance as negative', () => {
    const f = fixture()
    f.transactions.push(txn({ accountId: 'visa', date: '2026-03-01', amount: -30000 }), txn({ accountId: 'visa', date: '2026-03-02', amount: 30000 }))
    const h = balanceHistory(f, 'visa', '2026-03-01', '2026-03-02')
    expect(h.points.map((p) => p.balance)).toEqual([-30000, 0])
    expect(h.low).toBe(-30000)
    expect(h.high).toBe(0)
  })

  it('is empty-safe', () => {
    const h = balanceHistory(fixture(), 'chk', '2026-03-01', '2026-03-02')
    expect(h.points.map((p) => p.balance)).toEqual([0, 0])
    expect(h.balance).toBe(0)
    expect(h.change).toBe(0)
  })
})
