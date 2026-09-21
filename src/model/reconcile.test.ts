import { describe, expect, it } from 'vitest'
import { reconcile } from './reconcile'
import { emptyBudget, type BudgetFile, type Transaction } from './types'

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
  f.accounts.push({ id: 'chk', name: 'Checking', type: 'checking', onBudget: true, closed: false, simplefinId: 'x', bankBalance: 100000, bankBalanceDate: '2026-09-15T00:00:00.000Z' })
  f.accounts.push({ id: 'cash', name: 'Cash', type: 'cash', onBudget: true, closed: false })
  return f
}

describe('reconcile', () => {
  const now = new Date('2026-09-20T00:00:00Z')

  it('returns null for accounts without a bank balance', () => {
    expect(reconcile(fixture(), 'cash', now)).toBeNull()
  })

  it('compares the bank balance to cleared transactions and lists what explains the gap', () => {
    const f = fixture()
    f.transactions.push(
      txn({ id: 'a', date: '2026-08-01', amount: 120000, cleared: 'reconciled', importId: 'sfin:x:1' }),
      txn({ id: 'b', date: '2026-09-10', amount: -15000, cleared: 'cleared', importId: 'sfin:x:2' }),
      txn({ id: 'c', date: '2026-09-18', amount: -2000, cleared: 'uncleared' }), // pending at bank, fine
      txn({ id: 'd', date: '2026-09-01', amount: -5000, cleared: 'cleared' }), // manual, 19 days old, never matched
      txn({ id: 'e', date: '2026-05-01', amount: -777, cleared: 'cleared' }), // too old to be within a sync window
      txn({ id: 'f', date: '2026-09-15', amount: -100, cleared: 'cleared' }), // 5 days old, still within match window
    )
    const r = reconcile(f, 'chk', now)!
    expect(r.clearedBalance).toBe(120000 - 15000 - 5000 - 777 - 100)
    expect(r.difference).toBe(100000 - r.clearedBalance)
    expect(r.uncleared.map((t) => t.id)).toEqual(['c'])
    expect(r.unconfirmed.map((t) => t.id)).toEqual(['d'])
    expect(r.toLock).toBe(4)
  })

  it('accepts a bank balance that includes pending charges', () => {
    const f = fixture()
    f.accounts[0].bankBalance = 98000
    f.accounts[0].bankPending = -2000
    f.transactions.push(txn({ date: '2026-09-01', amount: 100000, cleared: 'reconciled', importId: 'sfin:x:1' }))
    const r = reconcile(f, 'chk', now)!
    expect(r).toMatchObject({ pending: -2000, matchedBy: 'balance-less-pending', difference: 0 })
  })

  it('accepts a bank balance that excludes pending charges', () => {
    const f = fixture()
    f.accounts[0].bankBalance = 100000
    f.accounts[0].bankPending = -2000
    f.transactions.push(txn({ date: '2026-09-01', amount: 100000, cleared: 'reconciled', importId: 'sfin:x:1' }))
    const r = reconcile(f, 'chk', now)!
    expect(r).toMatchObject({ pending: -2000, matchedBy: 'balance', difference: 0 })
  })

  it('ties out against the available balance when the bank hides pending activity in its balance', () => {
    const f = fixture()
    f.accounts[0].bankBalance = 98000 // includes a $20 hold the bank never lists
    f.accounts[0].bankAvailable = 100000
    f.transactions.push(txn({ date: '2026-09-01', amount: 100000, cleared: 'reconciled', importId: 'sfin:x:1' }))
    expect(reconcile(f, 'chk', now)).toMatchObject({ matchedBy: 'available', difference: 0 })
  })

  it('reports the raw gap when neither convention ties out', () => {
    const f = fixture()
    f.accounts[0].bankBalance = 97000
    f.accounts[0].bankPending = -2000
    f.transactions.push(txn({ date: '2026-09-01', amount: 100000, cleared: 'reconciled', importId: 'sfin:x:1' }))
    expect(reconcile(f, 'chk', now)).toMatchObject({ matchedBy: null, difference: -3000 })
  })
})
