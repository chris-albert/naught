import { describe, expect, it } from 'vitest'
import { applyPayeeRules, categoryForPayee, deletePayeeRule, setPayeeRule, uncategorizedFrom } from './payeeRules'
import { emptyBudget, type BudgetFile, type Transaction } from './types'

const txn = (p: Partial<Transaction> & Pick<Transaction, 'id' | 'payee'>): Transaction => ({
  accountId: 'chk',
  date: '2026-09-10',
  categoryId: null,
  memo: '',
  amount: -1000,
  cleared: 'cleared',
  transferAccountId: null,
  ...p,
})

function fileWith(transactions: Transaction[], payeeRules?: Record<string, string>): BudgetFile {
  return { ...emptyBudget('t'), transactions, ...(payeeRules ? { payeeRules } : {}) }
}

describe('payee rules', () => {
  it('looks up the category for a payee, exact match only', () => {
    const f = fileWith([], { Safeway: 'groceries' })
    expect(categoryForPayee(f, 'Safeway')).toBe('groceries')
    expect(categoryForPayee(f, 'safeway')).toBeNull()
    expect(categoryForPayee(emptyBudget('t'), 'Safeway')).toBeNull()
  })

  it('setting a rule categorizes uncategorized transactions from that payee and nothing else', () => {
    const f = fileWith([
      txn({ id: 'a', payee: 'Safeway' }),
      txn({ id: 'b', payee: 'Safeway', categoryId: 'dining' }),
      txn({ id: 'c', payee: 'Costco' }),
      txn({ id: 'd', payee: 'Safeway', transferAccountId: 'sav' }),
    ])
    expect(uncategorizedFrom(f, 'Safeway').map((t) => t.id)).toEqual(['a'])
    const out = setPayeeRule(f, 'Safeway', 'groceries')
    expect(out.payeeRules).toEqual({ Safeway: 'groceries' })
    expect(out.transactions.map((t) => t.categoryId)).toEqual(['groceries', 'dining', null, null])
    expect(f.transactions[0].categoryId).toBeNull() // input untouched
  })

  it('replacing a rule keeps the other rules', () => {
    const f = setPayeeRule(setPayeeRule(fileWith([]), 'Safeway', 'groceries'), 'Shell', 'gas')
    expect(setPayeeRule(f, 'Safeway', 'household').payeeRules).toEqual({ Safeway: 'household', Shell: 'gas' })
    expect(deletePayeeRule(f, 'Safeway').payeeRules).toEqual({ Shell: 'gas' })
  })

  it('applyPayeeRules returns the same file when nothing changes', () => {
    const f = fileWith([txn({ id: 'a', payee: 'Costco' })], { Safeway: 'groceries' })
    expect(applyPayeeRules(f)).toBe(f)
    expect(applyPayeeRules(fileWith([txn({ id: 'a', payee: 'Safeway' })]))).toBeDefined()
  })
})
