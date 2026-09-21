import { describe, expect, it } from 'vitest'
import { computeMonth } from './budgetMath'
import { convertHoldingCategory, previewHoldingConversion } from './holding'
import { emptyBudget, INCOME_CATEGORY_ID, type BudgetFile, type Transaction } from './types'

const txn = (p: Partial<Transaction> & Pick<Transaction, 'date' | 'amount'>): Transaction => ({
  id: Math.random().toString(36).slice(2),
  accountId: 'chk',
  payee: 'Employer',
  categoryId: null,
  memo: '',
  cleared: 'cleared',
  transferAccountId: null,
  ...p,
})

function fixture(): BudgetFile {
  const f = emptyBudget('t')
  f.accounts.push(
    { id: 'chk', name: 'Checking', type: 'checking', onBudget: true, closed: false },
    { id: 'sav', name: 'Savings', type: 'savings', onBudget: true, closed: false },
    { id: 'visa', name: 'Visa', type: 'credit', onBudget: true, closed: false },
  )
  f.categoryGroups.push({ id: 'g', name: 'Living', hidden: false })
  f.categories.push({ id: 'buffer', groupId: 'g', name: 'Buffer', hidden: false }, { id: 'rent', groupId: 'g', name: 'Rent', hidden: false })
  f.transactions.push(
    txn({ date: '2026-01-15', amount: 500000, categoryId: 'buffer' }),
    txn({ date: '2026-01-30', amount: 500000, categoryId: 'buffer' }),
    txn({ date: '2026-01-20', amount: -20000, categoryId: 'buffer', payee: 'Emergency vet' }),
    txn({ date: '2026-01-21', amount: 3000, categoryId: 'buffer', transferAccountId: 'sav' }), // transfer, untouched
    txn({ date: '2026-01-22', amount: 4000, categoryId: 'buffer', accountId: 'visa', payee: 'Refund' }), // card refund, untouched
    txn({ date: '2026-02-05', amount: -900000, categoryId: 'rent' }),
    txn({ date: '2026-02-15', amount: 500000, categoryId: 'buffer' }),
  )
  f.assigned['2026-01'] = { buffer: 50000 }
  f.assigned['2026-02'] = { buffer: -980000, rent: 900000 }
  return f
}

describe('convertHoldingCategory', () => {
  it('previews only positive, non-transfer inflows', () => {
    expect(previewHoldingConversion(fixture(), 'buffer')).toEqual({ transactions: 3, total: 1500000, months: 2 })
  })

  it('moves inflows to income, offsets with assignments, and leaves every balance unchanged', () => {
    const before = fixture()
    const after = convertHoldingCategory(before, 'buffer')

    const income = after.transactions.filter((t) => t.categoryId === INCOME_CATEGORY_ID)
    expect(income).toHaveLength(3)
    expect(after.transactions.filter((t) => t.categoryId === 'buffer').map((t) => t.amount).sort()).toEqual([-20000, 3000, 4000])
    expect(after.assigned['2026-01'].buffer).toBe(1050000)
    expect(after.assigned['2026-02'].buffer).toBe(-480000)

    for (const m of ['2026-01', '2026-02', '2026-03']) {
      const a = computeMonth(before, m)
      const b = computeMonth(after, m)
      expect(b.toBudget).toBe(a.toBudget)
      expect(b.groups.flatMap((g) => g.rows.map((r) => [r.category.id, r.available]))).toEqual(
        a.groups.flatMap((g) => g.rows.map((r) => [r.category.id, r.available])),
      )
    }
    expect(computeMonth(after, '2026-01').income).toBe(1000000)
    expect(computeMonth(before, '2026-01').income).toBe(0)
  })
})
