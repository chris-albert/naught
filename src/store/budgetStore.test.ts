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

describe('acceptSuggestions', () => {
  it('categorizes and renames in one undoable step and notes the sync run', () => {
    const file = emptyBudget('t')
    file.categories.push({ id: 'cat-food', groupId: 'g', name: 'Food', hidden: false })
    file.transactions.push(
      txn({ id: 'a', payee: 'SQ *COFFEE 4421' }),
      txn({ id: 'b', payee: 'Shop', categoryId: 'cat-other' }),
      txn({ id: 'c', payee: 'Transfer', transferAccountId: 'sav' }),
    )
    file.syncRuns = [{ id: 'run', at: '2026-09-01T00:00:00Z', added: ['a', 'c'], categorized: [], matched: [], updated: [], unchanged: 0, removed: 0 }]
    useBudget.getState().load(file, null)

    useBudget.getState().acceptSuggestions([
      { transactionId: 'a', categoryId: 'cat-food', payee: 'Coffee' },
      { transactionId: 'b', categoryId: 'cat-food' }, // already categorized: left alone
      { transactionId: 'c', categoryId: 'cat-food', payee: 'X' }, // transfer: left alone
    ])
    const byId = (id: string) => useBudget.getState().file!.transactions.find((t) => t.id === id)!
    expect(byId('a')).toMatchObject({ categoryId: 'cat-food', payee: 'Coffee' })
    expect(byId('b').categoryId).toBe('cat-other')
    expect(byId('c')).toMatchObject({ categoryId: null, payee: 'Transfer' })
    expect(useBudget.getState().file!.syncRuns![0].aiCategorized).toEqual(['a'])
    expect(useBudget.getState().past.map((e) => e.label)).toEqual(['accept suggestions'])

    useBudget.getState().undo()
    expect(byId('a')).toMatchObject({ categoryId: null, payee: 'SQ *COFFEE 4421' })
    expect(useBudget.getState().file!.syncRuns![0].aiCategorized).toBeUndefined()
  })

  it('is a no-op when nothing applies', () => {
    const file = emptyBudget('t')
    file.transactions.push(txn({ id: 'b', categoryId: 'cat-other' }))
    useBudget.getState().load(file, null)
    useBudget.getState().acceptSuggestions([{ transactionId: 'b', categoryId: 'cat-food' }, { transactionId: 'missing', payee: 'X' }])
    expect(useBudget.getState().past).toEqual([])
  })
})
