import { describe, expect, it } from 'vitest'
import { sampleBudget } from '../demo/sampleBudget'
import { ensurePaymentCategories } from './creditCards'
import { emptyBudget, INCOME_CATEGORY_ID, type BudgetFile, type Transaction } from './types'
import { validateToBudget } from './validate'

function fixture(): BudgetFile {
  const file = emptyBudget('test')
  file.accounts.push(
    { id: 'chk', name: 'Checking', type: 'checking', onBudget: true, closed: false },
    { id: 'visa', name: 'Visa', type: 'credit', onBudget: true, closed: false, paymentCategoryId: 'visa-pay' },
    { id: 'ira', name: 'IRA', type: 'investment', onBudget: false, closed: false },
  )
  file.categoryGroups.push({ id: 'g1', name: 'Living', hidden: false }, { id: 'cc', name: 'Credit Card Payments', hidden: false })
  file.categories.push(
    { id: 'food', groupId: 'g1', name: 'Food', hidden: false },
    { id: 'rent', groupId: 'g1', name: 'Rent', hidden: false },
    { id: 'visa-pay', groupId: 'cc', name: 'Visa', hidden: false },
  )
  return file
}

function txn(partial: Partial<Transaction> & Pick<Transaction, 'date' | 'amount'>): Transaction {
  return { id: Math.random().toString(36).slice(2), accountId: 'chk', payee: '', categoryId: null, memo: '', cleared: 'cleared', transferAccountId: null, ...partial }
}

const disagreements = (file: BudgetFile, today = '2026-03') =>
  validateToBudget(file, today)
    .filter((m) => m.ledger !== m.balance)
    .map((m) => `${m.month}: ledger ${m.ledger} vs balance ${m.balance}`)

describe('validateToBudget', () => {
  it('agrees with computeMonth on every month of the sample budget', () => {
    const months = validateToBudget(ensurePaymentCategories(sampleBudget()))
    expect(months.length).toBeGreaterThan(0)
    expect(months.filter((m) => m.ledger !== m.balance)).toEqual([])
  })

  it('cash overspending is charged the following month', () => {
    const file = fixture()
    file.transactions.push(txn({ date: '2026-01-01', amount: 100000, categoryId: INCOME_CATEGORY_ID }), txn({ date: '2026-01-10', amount: -30000, categoryId: 'food' }))
    file.assigned['2026-01'] = { food: 20000 }
    expect(disagreements(file)).toEqual([])
  })

  it('credit overspending, partly covered, across two months', () => {
    const file = fixture()
    file.transactions.push(
      txn({ date: '2026-01-01', amount: 100000, categoryId: INCOME_CATEGORY_ID }),
      txn({ date: '2026-01-10', amount: -30000, categoryId: 'food', accountId: 'visa' }),
      txn({ date: '2026-01-12', amount: -5000, categoryId: 'food' }),
      txn({ date: '2026-02-05', amount: -20000, accountId: 'chk', transferAccountId: 'visa' }),
      txn({ date: '2026-02-05', amount: 20000, accountId: 'visa', transferAccountId: 'chk' }),
    )
    file.assigned['2026-01'] = { food: 20000 }
    file.assigned['2026-02'] = { food: 10000, 'visa-pay': 5000 }
    expect(disagreements(file)).toEqual([])
  })

  it('closed card releases its payment envelope', () => {
    const file = fixture()
    file.accounts[1].closed = true
    file.transactions.push(
      txn({ date: '2026-01-01', amount: 100000, categoryId: INCOME_CATEGORY_ID }),
      txn({ date: '2026-01-10', amount: -10000, categoryId: 'food', accountId: 'visa' }),
      txn({ date: '2026-01-20', amount: -4000, accountId: 'chk', transferAccountId: 'visa' }),
      txn({ date: '2026-01-20', amount: 4000, accountId: 'visa', transferAccountId: 'chk' }),
    )
    file.assigned['2026-01'] = { food: 20000 }
    file.assigned['2026-02'] = { 'visa-pay': 1000 }
    expect(disagreements(file)).toEqual([])
  })

  it('money assigned ahead and a past month', () => {
    const file = fixture()
    file.transactions.push(txn({ date: '2026-01-01', amount: 100000, categoryId: INCOME_CATEGORY_ID }))
    file.assigned['2026-01'] = { food: 10000 }
    file.assigned['2026-03'] = { food: 10000 }
    file.assigned['2026-05'] = { rent: 10000 }
    expect(disagreements(file, '2026-03')).toEqual([])
  })

  it('uncategorized cash and transfers off budget', () => {
    const file = fixture()
    file.transactions.push(
      txn({ date: '2026-01-01', amount: 100000, categoryId: INCOME_CATEGORY_ID }),
      txn({ date: '2026-01-05', amount: -7000 }),
      txn({ date: '2026-01-06', amount: -8000, transferAccountId: 'ira' }),
      txn({ date: '2026-01-06', amount: 8000, accountId: 'ira', transferAccountId: 'chk' }),
      txn({ date: '2026-01-07', amount: -2000, accountId: 'visa' }),
    )
    expect(disagreements(file)).toEqual([])
  })

  // Known disagreement: computeMonth counts card income as income but never lets it reach To Budget
  // (cash and the payment envelope are both unchanged), so it is reported yet never assignable.
  it.fails('income received on a card', () => {
    const file = fixture()
    file.transactions.push(
      txn({ date: '2026-01-01', amount: 100000, categoryId: INCOME_CATEGORY_ID }),
      txn({ date: '2026-01-01', amount: -50000, accountId: 'visa', payee: 'Starting Balance', categoryId: INCOME_CATEGORY_ID }),
      txn({ date: '2026-01-15', amount: 2500, accountId: 'visa', payee: 'Cashback', categoryId: INCOME_CATEGORY_ID }),
    )
    expect(disagreements(file)).toEqual([])
  })
})
