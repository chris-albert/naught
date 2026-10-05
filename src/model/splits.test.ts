import { describe, expect, it } from 'vitest'
import { computeMonth } from './budgetMath'
import { applyPayeeRules } from './payeeRules'
import { buildReport } from './reports'
import { isUncategorized, linesOf, unassigned } from './splits'
import { setTransfer } from './transfers'
import { buildTrend } from './trend'
import { emptyBudget, INCOME_CATEGORY_ID, type BudgetFile, type Transaction } from './types'

function fixture(): BudgetFile {
  const f = emptyBudget('t')
  f.accounts.push(
    { id: 'chk', name: 'Checking', type: 'checking', onBudget: true, closed: false },
    { id: 'sav', name: 'Savings', type: 'savings', onBudget: true, closed: false },
  )
  f.categoryGroups.push({ id: 'g1', name: 'Living', hidden: false }, { id: 'g2', name: 'Savings', hidden: false })
  f.categories.push(
    { id: 'dining', groupId: 'g1', name: 'Dining', hidden: false },
    { id: 'vacation', groupId: 'g2', name: 'Vacation', hidden: false, reserve: true },
  )
  return f
}

const txn = (p: Partial<Transaction> & Pick<Transaction, 'date' | 'amount'>): Transaction => ({
  id: Math.random().toString(36).slice(2),
  accountId: 'chk',
  payee: '',
  categoryId: null,
  memo: '',
  cleared: 'cleared',
  transferAccountId: null,
  ...p,
})

/** A $150 Venmo payout: $50 pays back a dinner, $100 is for the vacation fund. */
const venmo = (splits = [{ categoryId: 'dining', amount: 5000 }, { categoryId: 'vacation', amount: 10000 }] as Transaction['splits']) =>
  txn({ id: 'venmo', date: '2026-01-10', amount: 15000, payee: 'Venmo', splits })

describe('linesOf', () => {
  it('returns an unsplit transaction as it is', () => {
    const t = txn({ date: '2026-01-10', amount: -500, categoryId: 'dining' })
    expect(linesOf(t)).toEqual([t])
    expect(unassigned(t)).toBe(0)
  })

  it('returns one line per split', () => {
    const lines = linesOf(venmo())
    expect(lines.map((l) => [l.id, l.categoryId, l.amount])).toEqual([
      ['venmo:0', 'dining', 5000],
      ['venmo:1', 'vacation', 10000],
    ])
    expect(isUncategorized(venmo())).toBe(false)
  })

  it('adds an uncategorized line for what the splits leave over', () => {
    const t = venmo([{ categoryId: 'dining', amount: 5000 }])
    expect(unassigned(t)).toBe(10000)
    expect(linesOf(t).map((l) => [l.categoryId, l.amount])).toEqual([
      ['dining', 5000],
      [null, 10000],
    ])
    expect(isUncategorized(t)).toBe(true)
  })
})

describe('split transactions', () => {
  it('count each line under its own category in the budget', () => {
    const f = fixture()
    f.transactions.push(venmo(), txn({ date: '2026-01-08', amount: -12000, categoryId: 'dining' }))
    f.assigned['2026-01'] = { dining: 12000 }
    const rows = computeMonth(f, '2026-01', '2026-01').groups.flatMap((g) => g.rows)
    const dining = rows.find((r) => r.category.id === 'dining')!
    const vacation = rows.find((r) => r.category.id === 'vacation')!
    expect(dining.activity).toBe(-7000)
    expect(dining.available).toBe(5000)
    expect(vacation.available).toBe(10000)
  })

  it('leave the leftover of an unfinished split in To Budget', () => {
    const f = fixture()
    f.transactions.push(venmo([{ categoryId: 'dining', amount: 5000 }]))
    const month = computeMonth(f, '2026-01', '2026-01')
    expect(month.toBudget).toBe(10000)
  })

  it('report a reimbursement as less spending and reserve money as income set aside', () => {
    const f = fixture()
    f.transactions.push(
      txn({ date: '2026-01-02', amount: 300000, categoryId: INCOME_CATEGORY_ID }),
      txn({ date: '2026-01-08', amount: -12000, categoryId: 'dining' }),
      venmo(),
    )
    const [s] = buildReport(f, ['2026-01']).summaries
    expect(s.income).toBe(310000)
    expect(s.living).toBe(7000)
    expect(s.setAside).toBe(10000)
    expect(s.uncategorized).toBe(0)
  })

  it('count once as uncategorized in reports while a line needs a category', () => {
    const f = fixture()
    f.transactions.push(venmo([{ categoryId: null, amount: 5000 }]))
    expect(buildReport(f, ['2026-01']).summaries[0].uncategorized).toBe(1)
  })

  it('show only the matching line in a category trend', () => {
    const f = fixture()
    f.transactions.push(venmo())
    const trend = buildTrend(f, ['2026-01'], { kind: 'category', id: 'dining' })
    expect(trend.byMonth).toEqual([-5000])
    expect(trend.transactions.map((t) => t.amount)).toEqual([5000])
  })

  it('are left alone by payee rules', () => {
    const f = fixture()
    f.transactions.push(venmo([{ categoryId: null, amount: 5000 }]))
    f.payeeRules = { Venmo: 'dining' }
    expect(applyPayeeRules(f)).toBe(f)
  })

  it('lose their lines when turned into a transfer', () => {
    const f = fixture()
    f.transactions.push(venmo())
    const t = setTransfer(f, 'venmo', 'sav').transactions.find((x) => x.id === 'venmo')!
    expect(t.transferAccountId).toBe('sav')
    expect(t.splits).toBeUndefined()
  })
})
