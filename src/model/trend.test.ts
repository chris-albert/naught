import { describe, expect, it } from 'vitest'
import { buildTrend, scopeFromParams, trendPath } from './trend'
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

const months = ['2026-01', '2026-02', '2026-03', '2026-04']

describe('buildTrend', () => {
  it('breaks a category down by payee, newest transactions first', () => {
    const f = fixture()
    f.transactions.push(
      txn({ date: '2026-01-05', amount: -10000, categoryId: 'food', payee: 'Grocer' }),
      txn({ date: '2026-02-05', amount: -20000, categoryId: 'food', payee: 'Grocer' }),
      txn({ date: '2026-02-09', amount: -5000, categoryId: 'food', payee: 'Cafe' }),
      txn({ date: '2026-03-01', amount: 2000, categoryId: 'food', payee: 'Grocer' }), // refund
      txn({ date: '2026-04-01', amount: -40000, categoryId: 'food', payee: 'Grocer' }),
      txn({ date: '2026-04-02', amount: -99999, categoryId: 'food', payee: 'Grocer', accountId: 'ira' }), // off budget
      txn({ date: '2026-04-03', amount: -99999, categoryId: 'food', payee: 'Grocer', transferAccountId: 'ira' }), // transfer
      txn({ date: '2025-12-31', amount: -99999, categoryId: 'food', payee: 'Grocer' }), // out of range
      txn({ date: '2026-04-04', amount: -700, categoryId: 'rent', payee: 'Grocer' }), // other category
    )
    const t = buildTrend(f, months, { kind: 'category', id: 'food' })
    expect(t.name).toBe('Food')
    expect(t.byMonth).toEqual([10000, 25000, -2000, 40000])
    expect(t.total).toBe(73000)
    expect(t.average).toBe(18250)
    expect(t.shift).toBe(19000 - 17500)
    expect(t.rows.map((r) => [r.label, r.total, r.count])).toEqual([
      ['Grocer', 68000, 4],
      ['Cafe', 5000, 1],
    ])
    expect(t.rows[0].scope).toEqual({ kind: 'payee', name: 'Grocer' })
    expect(t.transactions.map((x) => x.date)).toEqual(['2026-04-01', '2026-03-01', '2026-02-09', '2026-02-05', '2026-01-05'])
  })

  it('breaks a group down by category and skips payment categories', () => {
    const f = fixture()
    f.transactions.push(
      txn({ date: '2026-01-05', amount: -10000, categoryId: 'food' }),
      txn({ date: '2026-01-06', amount: -150000, categoryId: 'rent' }),
      txn({ date: '2026-01-07', amount: -50000, categoryId: 'pay', accountId: 'visa' }),
    )
    const t = buildTrend(f, months, { kind: 'group', id: 'g1' })
    expect(t.name).toBe('Living')
    expect(t.byMonth).toEqual([160000, 0, 0, 0])
    expect(t.rows.map((r) => [r.label, r.scope])).toEqual([
      ['Rent', { kind: 'category', id: 'rent' }],
      ['Food', { kind: 'category', id: 'food' }],
    ])
  })

  it('breaks a payee down by category, including income and uncategorized', () => {
    const f = fixture()
    f.transactions.push(
      txn({ date: '2026-01-05', amount: -10000, categoryId: 'food', payee: 'Costco' }),
      txn({ date: '2026-02-05', amount: -3000, categoryId: null, payee: 'Costco' }),
      txn({ date: '2026-03-05', amount: 4000, categoryId: INCOME_CATEGORY_ID, payee: 'Costco' }),
      txn({ date: '2026-03-06', amount: -5000, categoryId: 'pay', payee: 'Costco', accountId: 'visa' }),
      txn({ date: '2026-03-07', amount: -5000, categoryId: 'food', payee: 'Other' }),
    )
    const t = buildTrend(f, months, { kind: 'payee', name: 'Costco' })
    expect(t.name).toBe('Costco')
    expect(t.byMonth).toEqual([10000, 3000, -4000, 0])
    expect(t.rows.map((r) => [r.label, r.total, r.scope])).toEqual([
      ['Food', 10000, { kind: 'category', id: 'food' }],
      ['Income', -4000, undefined],
      ['Uncategorized', 3000, undefined],
    ])
  })

  it('has no name when the scope points at nothing', () => {
    expect(buildTrend(fixture(), months, { kind: 'category', id: 'nope' }).name).toBeNull()
  })
})

describe('scope in the URL', () => {
  it('round-trips every kind of scope, including payees with awkward characters', () => {
    for (const scope of [
      { kind: 'group', id: 'g1' } as const,
      { kind: 'category', id: 'food' } as const,
      { kind: 'payee', name: 'A/B & C?d=e' } as const,
    ]) {
      const path = trendPath(scope)
      expect(scopeFromParams(new URL(path, 'http://x').searchParams)).toEqual(scope)
    }
    expect(scopeFromParams(new URLSearchParams(''))).toBeNull()
  })
})
