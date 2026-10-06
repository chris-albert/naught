import { describe, expect, it } from 'vitest'
import { sinceFirstActivity } from './ledger'
import { emptyBudget } from './types'

describe('sinceFirstActivity', () => {
  const months = ['2026-01', '2026-02', '2026-03', '2026-04']
  const budget = () => {
    const f = emptyBudget('t')
    f.accounts.push({ id: 'chk', name: 'Checking', type: 'checking', onBudget: true, closed: false })
    return f
  }

  it('drops the months before the first transaction', () => {
    const f = budget()
    f.transactions.push({ id: 't1', accountId: 'chk', date: '2026-03-10', payee: '', categoryId: null, memo: '', amount: -100, cleared: 'cleared', transferAccountId: null })
    expect(sinceFirstActivity(f, months)).toEqual(['2026-03', '2026-04'])
  })

  it('keeps the whole range when history starts before it or there is none', () => {
    const f = budget()
    expect(sinceFirstActivity(f, months)).toEqual(months)
    f.transactions.push({ id: 't1', accountId: 'chk', date: '2025-06-01', payee: '', categoryId: null, memo: '', amount: -100, cleared: 'cleared', transferAccountId: null })
    expect(sinceFirstActivity(f, months)).toEqual(months)
  })

  it('keeps the range when all of it predates the first transaction', () => {
    const f = budget()
    f.transactions.push({ id: 't1', accountId: 'chk', date: '2026-09-01', payee: '', categoryId: null, memo: '', amount: -100, cleared: 'cleared', transferAccountId: null })
    expect(sinceFirstActivity(f, months)).toEqual(months)
  })
})
