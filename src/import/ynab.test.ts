import { describe, expect, it } from 'vitest'
import { INCOME_CATEGORY_ID } from '../model/types'
import { importYnab } from './ynab'

const sample = {
  data: {
    budget: {
      name: 'Sample',
      accounts: [
        { id: 'a1', name: 'Checking', type: 'checking', on_budget: true, closed: false, deleted: false },
        { id: 'a2', name: 'Visa', type: 'creditCard', on_budget: true, closed: false, deleted: false },
        { id: 'a3', name: 'Old', type: 'savings', on_budget: true, closed: true, deleted: true },
        { id: 'a4', name: 'IRA', type: 'otherAsset', on_budget: false, closed: false, deleted: false },
      ],
      payees: [
        { id: 'p1', name: 'Grocer', deleted: false },
        { id: 'p2', name: 'Employer', deleted: false },
      ],
      category_groups: [
        { id: 'g1', name: 'Living', hidden: false, internal: false, deleted: false },
        { id: 'gi', name: 'Internal Master Category', hidden: false, internal: true, deleted: false },
        { id: 'gc', name: 'Credit Card Payments', hidden: false, internal: true, deleted: false },
        { id: 'gh', name: 'Hidden Categories', hidden: false, internal: true, deleted: false },
      ],
      categories: [
        { id: 'c1', category_group_id: 'g1', name: 'Food', hidden: false, internal: false, deleted: false },
        { id: 'c2', category_group_id: 'g1', name: 'Fun', hidden: true, internal: false, deleted: false },
        { id: 'ci', category_group_id: 'gi', name: 'Inflow: Ready to Assign', hidden: false, internal: true, deleted: false },
        { id: 'cu', category_group_id: 'gi', name: 'Uncategorized', hidden: false, internal: true, deleted: false },
        { id: 'cc', category_group_id: 'gc', name: 'Visa', hidden: false, internal: false, deleted: false },
      ],
      months: [
        { month: '2026-01-01', deleted: false, categories: [{ id: 'c1', budgeted: 400000 }, { id: 'ci', budgeted: 0 }] },
      ],
      transactions: [
        { id: 't1', date: '2026-01-03', amount: 3000000, memo: null, cleared: 'reconciled', account_id: 'a1', payee_id: 'p2', category_id: 'ci', transfer_account_id: null, deleted: false },
        { id: 't2', date: '2026-01-05', amount: -55550, memo: 'weekly', cleared: 'cleared', account_id: 'a2', payee_id: 'p1', category_id: 'c1', transfer_account_id: null, deleted: false },
        { id: 't3', date: '2026-01-06', amount: -20000, memo: '', cleared: 'uncleared', account_id: 'a1', payee_id: 'p1', category_id: null, transfer_account_id: null, deleted: false },
        { id: 't4', date: '2026-01-07', amount: -100000, memo: 'pay card', cleared: 'cleared', account_id: 'a1', payee_id: null, category_id: null, transfer_account_id: 'a2', deleted: false },
        { id: 't5', date: '2026-01-08', amount: -1000, memo: '', cleared: 'cleared', account_id: 'a1', payee_id: 'p1', category_id: 'c1', transfer_account_id: null, deleted: true },
      ],
      subtransactions: [
        { id: 's1', transaction_id: 't3', amount: -15000, memo: 'a', payee_id: null, category_id: 'c1', transfer_account_id: null, deleted: false },
        { id: 's2', transaction_id: 't3', amount: -5000, memo: 'b', payee_id: null, category_id: 'c2', transfer_account_id: null, deleted: false },
      ],
    },
  },
}

describe('importYnab', () => {
  const file = importYnab(sample)

  it('maps accounts, drops deleted ones, and links cards to their payment category by name', () => {
    expect(file.accounts).toEqual([
      { id: 'a1', name: 'Checking', type: 'checking', onBudget: true, closed: false },
      { id: 'a2', name: 'Visa', type: 'credit', onBudget: true, closed: false, paymentCategoryId: 'cc' },
      { id: 'a4', name: 'IRA', type: 'investment', onBudget: false, closed: false },
    ])
  })

  it('drops internal categories and empty groups but keeps credit card payments', () => {
    expect(file.categoryGroups.map((g) => g.id)).toEqual(['g1', 'gc'])
    expect(file.categories.map((c) => c.id)).toEqual(['c1', 'c2', 'cc'])
  })

  it('converts milliunits to cents and maps income and transfers', () => {
    const byId = new Map(file.transactions.map((t) => [t.id, t]))
    expect(byId.get('t1')).toMatchObject({ amount: 300000, categoryId: INCOME_CATEGORY_ID, payee: 'Employer' })
    expect(byId.get('t2')).toMatchObject({ amount: -5555, categoryId: 'c1', cleared: 'cleared', memo: 'weekly' })
    expect(byId.get('t4')).toMatchObject({ amount: -10000, categoryId: null, transferAccountId: 'a2' })
    expect(byId.has('t5')).toBe(false)
  })

  it('flattens splits into one transaction per line', () => {
    expect(file.transactions.find((t) => t.id === 't3')).toBeUndefined()
    const s1 = file.transactions.find((t) => t.id === 's1')!
    const s2 = file.transactions.find((t) => t.id === 's2')!
    expect(s1).toMatchObject({ amount: -1500, categoryId: 'c1', accountId: 'a1', payee: 'Grocer', memo: 'a (split 1/2)' })
    expect(s2).toMatchObject({ amount: -500, categoryId: 'c2', memo: 'b (split 2/2)' })
  })

  it('imports monthly assignments in cents, skipping zeros and internal categories', () => {
    expect(file.assigned).toEqual({ '2026-01': { c1: 40000 } })
  })

  it('sorts transactions newest first', () => {
    const dates = file.transactions.map((t) => t.date)
    expect(dates).toEqual([...dates].sort().reverse())
  })
})
