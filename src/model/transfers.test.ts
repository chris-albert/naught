import { describe, expect, it } from 'vitest'
import { computeMonth } from './budgetMath'
import { ensurePaymentCategories } from './creditCards'
import { setTransfer } from './transfers'
import { emptyBudget, INCOME_CATEGORY_ID, type BudgetFile, type Transaction } from './types'

function fixture(): BudgetFile {
  const file = emptyBudget('test')
  file.accounts.push(
    { id: 'chk', name: 'Checking', type: 'checking', onBudget: true, closed: false },
    { id: 'sav', name: 'Savings', type: 'savings', onBudget: true, closed: false },
    { id: 'visa', name: 'Visa', type: 'credit', onBudget: true, closed: false },
  )
  file.categoryGroups.push({ id: 'g1', name: 'Living', hidden: false })
  file.categories.push({ id: 'food', groupId: 'g1', name: 'Food', hidden: false })
  return ensurePaymentCategories(file)
}

let n = 0
function txn(partial: Partial<Transaction> & Pick<Transaction, 'date' | 'amount'>): Transaction {
  return { id: `t${n++}`, accountId: 'chk', payee: '', categoryId: null, memo: '', cleared: 'cleared', transferAccountId: null, ...partial }
}

const on = (file: BudgetFile, accountId: string) => file.transactions.filter((t) => t.accountId === accountId)

describe('setTransfer', () => {
  it('links the other side to an unexplained bank row for the opposite amount', () => {
    const file = fixture()
    file.transactions.push(
      txn({ id: 'pay', date: '2026-10-01', amount: -605680, payee: 'Citi Credit Card Payment', categoryId: 'food' }),
      txn({ id: 'card', date: '2026-10-03', amount: 605680, accountId: 'visa', payee: 'PAYMENT THANK YOU', importId: 'sfin:1' }),
    )
    const out = setTransfer(file, 'pay', 'visa')
    const pay = out.transactions.find((t) => t.id === 'pay')!
    const card = out.transactions.find((t) => t.id === 'card')!
    expect(pay).toMatchObject({ payee: 'Transfer: Visa', categoryId: null, transferAccountId: 'visa' })
    expect(card).toMatchObject({ payee: 'Transfer: Checking', categoryId: null, transferAccountId: 'chk', importId: 'sfin:1' })
    expect(out.transactions).toHaveLength(2)
  })

  it('creates the other side, uncleared, when the bank has not sent it yet', () => {
    const file = fixture()
    file.transactions.push(
      txn({ id: 'pay', date: '2026-10-01', amount: -605680 }),
      // same amount but already explained, and a different amount: neither is the other side
      txn({ date: '2026-10-01', amount: 605680, accountId: 'visa', categoryId: 'food' }),
      txn({ date: '2026-10-01', amount: 605600, accountId: 'visa' }),
    )
    const out = setTransfer(file, 'pay', 'visa')
    expect(out.transactions).toHaveLength(4)
    const created = on(out, 'visa').find((t) => t.transferAccountId === 'chk')!
    expect(created).toMatchObject({ date: '2026-10-01', amount: 605680, payee: 'Transfer: Checking', categoryId: null, cleared: 'uncleared' })
    expect(created.importId).toBeUndefined()
  })

  it('does not reach past the matching window for the other side', () => {
    const file = fixture()
    file.transactions.push(txn({ id: 'pay', date: '2026-10-01', amount: -10000 }), txn({ id: 'old', date: '2026-09-10', amount: 10000, accountId: 'sav' }))
    const out = setTransfer(file, 'pay', 'sav')
    expect(out.transactions.find((t) => t.id === 'old')!.transferAccountId).toBeNull()
    expect(on(out, 'sav')).toHaveLength(2)
  })

  it('clearing a transfer leaves the other side behind, uncategorized', () => {
    const file = fixture()
    file.transactions.push(txn({ id: 'a', date: '2026-10-01', amount: -10000 }))
    let out = setTransfer(file, 'a', 'sav')
    out = setTransfer(out, 'a', null)
    expect(out.transactions.find((t) => t.id === 'a')!).toMatchObject({ payee: 'Transfer: Savings', transferAccountId: null })
    expect(on(out, 'sav')).toHaveLength(1)
    expect(on(out, 'sav')[0]).toMatchObject({ amount: 10000, categoryId: null, transferAccountId: null })
  })

  it('switching the target unlinks the old other side and links a new one', () => {
    const file = fixture()
    file.transactions.push(txn({ id: 'a', date: '2026-10-01', amount: -10000 }))
    const out = setTransfer(setTransfer(file, 'a', 'sav'), 'a', 'visa')
    expect(on(out, 'sav')[0].transferAccountId).toBeNull()
    expect(on(out, 'visa')).toHaveLength(1)
    expect(out.transactions.find((t) => t.id === 'a')!).toMatchObject({ payee: 'Transfer: Visa', transferAccountId: 'visa' })
  })

  it('ignores a transfer to the same account and leaves the file untouched', () => {
    const file = fixture()
    file.transactions.push(txn({ id: 'a', date: '2026-10-01', amount: -10000 }))
    expect(setTransfer(file, 'a', 'chk')).toBe(file)
    expect(setTransfer(file, 'missing', 'sav')).toBe(file)
  })

  it('a card payment recorded as a transfer leaves To budget alone', () => {
    const file = fixture()
    file.transactions.push(
      txn({ date: '2026-09-01', amount: 1000000, categoryId: INCOME_CATEGORY_ID }),
      txn({ date: '2026-09-10', amount: -60000, accountId: 'visa', categoryId: 'food' }),
      txn({ id: 'pay', date: '2026-10-01', amount: -60000, payee: 'Citi Credit Card Payment' }),
    )
    file.assigned['2026-09'] = { food: 60000 }
    const before = computeMonth(file, '2026-09', '2026-10').toBudget
    expect(computeMonth(file, '2026-10', '2026-10').toBudget).toBe(before - 60000) // uncategorized: money just leaves
    const out = setTransfer(file, 'pay', 'visa')
    expect(computeMonth(out, '2026-10', '2026-10').toBudget).toBe(before)
  })
})
