import { describe, expect, it } from 'vitest'
import { recurringPayees } from './insights'
import { buildSubscriptionPrompt, oneTimeCandidates } from './subscriptionPrompt'
import { emptyBudget, type BudgetFile, type Transaction } from './types'

function fixture(): BudgetFile {
  const f = emptyBudget('t')
  f.accounts.push(
    { id: 'chk', name: 'Checking', type: 'checking', onBudget: true, closed: false },
    { id: 'visa', name: 'Visa', type: 'credit', onBudget: true, closed: false, paymentCategoryId: 'pay' },
  )
  f.categoryGroups.push({ id: 'g1', name: 'Living', hidden: false }, { id: 'gcc', name: 'Credit Card Payments', hidden: false })
  f.categories.push({ id: 'fun', groupId: 'g1', name: 'Fun', hidden: false }, { id: 'pay', groupId: 'gcc', name: 'Visa', hidden: false })
  return f
}

const txn = (p: Partial<Transaction> & Pick<Transaction, 'date' | 'amount' | 'payee'>): Transaction => ({
  id: Math.random().toString(36).slice(2),
  accountId: 'chk',
  categoryId: 'fun',
  memo: '',
  cleared: 'cleared',
  transferAccountId: null,
  ...p,
})

const today = '2026-10-19'

describe('oneTimeCandidates', () => {
  it('keeps round single charges, drops recurring payees, odd amounts, small and old ones', () => {
    const f = fixture()
    f.transactions.push(
      txn({ date: '2025-10-14', amount: -29900, payee: 'Shapr3D' }),
      txn({ date: '2026-06-03', amount: -9999, payee: 'Monarch Money', categoryId: null }),
      // charged twice, 14 months apart: not yearly to the detector, but the prior date is worth showing
      txn({ date: '2025-03-09', amount: -37900, payee: 'Academy of Sciences' }),
      txn({ date: '2026-04-25', amount: -37900, payee: 'Academy of Sciences' }),
      txn({ date: '2026-05-20', amount: -7598, payee: 'Tallboy' }), // not a round amount
      txn({ date: '2026-07-01', amount: -1200, payee: 'PTA' }), // under $20
      txn({ date: '2025-09-30', amount: -9900, payee: 'Old Thing' }), // more than 13 months ago
      txn({ date: '2026-02-01', amount: 9900, payee: 'Refund Co' }), // inflow
      txn({ date: '2026-09-20', amount: -10000, payee: 'ATM Main St' }), // cash
      txn({ date: '2026-08-20', amount: -6250, payee: 'ADVANCES*TRANSACTION FEE' }),
      txn({ date: '2026-04-14', amount: -4096500, payee: 'IRS' }), // a tax bill, not a renewal
      txn({ date: '2026-02-01', amount: -50000, payee: 'Visa', categoryId: 'pay', accountId: 'visa' }),
      ...['2026-07-21', '2026-08-21', '2026-09-21'].map((date) => txn({ date, amount: -4999, payee: 'Peloton' })),
    )
    const recurring = recurringPayees(f, today)
    expect(recurring.payees.map((p) => p.payee)).toEqual(['Peloton'])
    expect(oneTimeCandidates(f, today, recurring.payees)).toEqual([
      { payee: 'Academy of Sciences', date: '2026-04-25', amount: 37900, categoryId: 'fun', priorDate: '2025-03-09' },
      { payee: 'Shapr3D', date: '2025-10-14', amount: 29900, categoryId: 'fun', priorDate: undefined },
      { payee: 'Monarch Money', date: '2026-06-03', amount: 9999, categoryId: null, priorDate: undefined },
    ])
  })
})

describe('buildSubscriptionPrompt', () => {
  it('lists recurring payees and one-time candidates as pipe-separated rows', () => {
    const f = fixture()
    f.transactions.push(
      txn({ date: '2025-04-27', amount: -7999, payee: 'Strava' }),
      txn({ date: '2026-04-27', amount: -7999, payee: 'Strava' }),
      ...['2026-05-21', '2026-06-21', '2026-07-21'].map((date) => txn({ date, amount: -4400, payee: 'Peloton' })),
      ...['2026-08-21', '2026-09-21'].map((date) => txn({ date, amount: -4999, payee: 'Peloton' })),
      txn({ date: '2026-06-03', amount: -9999, payee: 'Monarch Money', categoryId: null }),
    )
    const prompt = buildSubscriptionPrompt(f, today)
    expect(prompt).toContain('today is 2026-10-19')
    expect(prompt).toContain('Strava | yearly | $79.99 | 2026-04-27 | 2027-04-27 | active | Fun | 2')
    expect(prompt).toContain('Peloton | monthly | $49.99 (was $44.00) | 2026-09-21 | - | active | Fun | 5')
    expect(prompt).toContain('Monarch Money | 2026-06-03 | $99.99 | uncategorized | -')
    expect(prompt).not.toContain('Checking')
  })
})
