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

describe('undo and redo', () => {
  it('steps back through changes and forward again', () => {
    const file = emptyBudget('t')
    useBudget.getState().load(file, null)
    useBudget.getState().addCategoryGroup('Bills')
    useBudget.getState().addCategoryGroup('Fun')
    expect(useBudget.getState().past.map((e) => e.label)).toEqual(['add group', 'add group'])

    useBudget.getState().undo()
    expect(useBudget.getState().file?.categoryGroups.map((g) => g.name)).toEqual(['Bills'])
    expect(useBudget.getState().future).toHaveLength(1)

    useBudget.getState().undo()
    expect(useBudget.getState().file?.categoryGroups).toEqual([])
    expect(useBudget.getState().past).toEqual([])
    useBudget.getState().undo() // nothing left: no-op
    expect(useBudget.getState().file?.categoryGroups).toEqual([])

    useBudget.getState().redo()
    useBudget.getState().redo()
    expect(useBudget.getState().file?.categoryGroups.map((g) => g.name)).toEqual(['Bills', 'Fun'])
    expect(useBudget.getState().future).toEqual([])
  })

  it('drops the redo stack on a new change and both stacks when a file is loaded', () => {
    useBudget.getState().load(emptyBudget('t'), null)
    useBudget.getState().addCategoryGroup('Bills')
    useBudget.getState().undo()
    useBudget.getState().addCategoryGroup('Fun')
    expect(useBudget.getState().future).toEqual([])
    expect(useBudget.getState().past).toHaveLength(1)

    useBudget.getState().load(emptyBudget('other'), null)
    expect(useBudget.getState().past).toEqual([])
  })

  it('ignores updates that change nothing', () => {
    useBudget.getState().load(emptyBudget('t'), null)
    useBudget.getState().moveAccount('missing', 1)
    expect(useBudget.getState().past).toEqual([])
  })
})
