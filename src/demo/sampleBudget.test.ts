import { describe, expect, it } from 'vitest'
import { computeMonth } from '../model/budgetMath'
import { currentMonth } from '../model/dates'
import { ensurePaymentCategories } from '../model/creditCards'
import { reconcile } from '../model/reconcile'
import { sampleBudget } from './sampleBudget'

describe('sampleBudget', () => {
  const today = new Date().toISOString().slice(0, 10)

  it('is deterministic', () => {
    expect(sampleBudget(today)).toEqual(sampleBudget(today))
  })

  it('has nothing dated in the future and only known accounts and categories', () => {
    const f = sampleBudget(today)
    const accountIds = new Set(f.accounts.map((a) => a.id))
    const categoryIds = new Set(f.categories.map((c) => c.id))
    for (const t of f.transactions) {
      expect(t.date <= today).toBe(true)
      expect(accountIds.has(t.accountId)).toBe(true)
      if (t.categoryId && t.categoryId !== 'income') expect(categoryIds.has(t.categoryId)).toBe(true)
      if (t.transferAccountId) expect(accountIds.has(t.transferAccountId)).toBe(true)
    }
  })

  it('transfers net to zero', () => {
    const f = sampleBudget(today)
    const transfers = f.transactions.filter((t) => t.transferAccountId)
    expect(transfers.length).toBeGreaterThan(0)
    expect(transfers.reduce((sum, t) => sum + t.amount, 0)).toBe(0)
  })

  it('is fully budgeted with a little left over and nothing overspent', () => {
    const f = ensurePaymentCategories(sampleBudget(today))
    const m = computeMonth(f, currentMonth())
    expect(m.toBudget).toBeGreaterThanOrEqual(0)
    expect(m.toBudget).toBeLessThan(20000)
    for (const g of m.groups) for (const r of g.rows) expect(r.available).toBeGreaterThanOrEqual(0)
  })

  it('has recent uncategorized card transactions, including a repeated payee, and rules only for categorized payees', () => {
    const f = sampleBudget(today)
    const uncategorized = f.transactions.filter((t) => !t.categoryId && !t.transferAccountId)
    expect(uncategorized.length).toBeGreaterThanOrEqual(5)
    expect(uncategorized.filter((t) => t.payee === 'Whole Foods').length).toBeGreaterThan(1)
    for (const t of uncategorized) expect(f.payeeRules).not.toHaveProperty(t.payee)
    for (const id of Object.values(f.payeeRules!)) expect(id === 'income' || f.categories.some((c) => c.id === id)).toBe(true)
  })

  it('reconciles against the pretend bank balances', () => {
    const f = sampleBudget(today)
    for (const a of f.accounts) expect(reconcile(f, a.id)?.difference).toBe(0)
  })
})
