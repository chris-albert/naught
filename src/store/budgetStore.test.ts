import { describe, expect, it } from 'vitest'
import { emptyBudget, type Transaction } from '../model/types'
import { useBudget } from './budgetStore'

const txn = (p: Partial<Transaction> & Pick<Transaction, 'id'>): Transaction => ({
  accountId: 'chk',
  date: '2026-09-01',
  payee: 'Hold',
  categoryId: null,
  memo: '',
  amount: -100,
  cleared: 'uncleared',
  transferAccountId: null,
  ...p,
})

describe('deleteTransaction', () => {
  it('remembers the bank id of a deleted imported transaction so sync does not bring it back', () => {
    const file = emptyBudget('t')
    file.transactions.push(txn({ id: 'a', importId: 'sfin:sf-1:hold' }), txn({ id: 'b' }))
    useBudget.getState().load(file, null)

    useBudget.getState().deleteTransaction('b')
    expect(useBudget.getState().file?.ignoredImportIds).toBeUndefined()

    useBudget.getState().deleteTransaction('a')
    expect(useBudget.getState().file?.transactions).toEqual([])
    expect(useBudget.getState().file?.ignoredImportIds).toEqual(['sfin:sf-1:hold'])
  })
})
