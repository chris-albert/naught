import { describe, expect, it } from 'vitest'
import { ensurePaymentCategories } from './creditCards'
import { CREDIT_CARD_PAYMENTS_GROUP, emptyBudget } from './types'

describe('ensurePaymentCategories', () => {
  it('creates the group and a category for a new card, and is a no-op afterwards', () => {
    const file = emptyBudget('t')
    file.accounts.push({ id: 'visa', name: 'Visa', type: 'credit', onBudget: true, closed: false })
    const out = ensurePaymentCategories(file)
    const group = out.categoryGroups.find((g) => g.name === CREDIT_CARD_PAYMENTS_GROUP)!
    const cat = out.categories.find((c) => c.groupId === group.id && c.name === 'Visa')!
    expect(out.accounts[0].paymentCategoryId).toBe(cat.id)
    expect(ensurePaymentCategories(out)).toBe(out)
  })

  it('links by name to an existing category and ignores off-budget or non-credit accounts', () => {
    const file = emptyBudget('t')
    file.categoryGroups.push({ id: 'g', name: CREDIT_CARD_PAYMENTS_GROUP, hidden: false })
    file.categories.push({ id: 'c', groupId: 'g', name: 'Amex', hidden: false })
    file.accounts.push(
      { id: 'amex', name: 'Amex', type: 'credit', onBudget: true, closed: false },
      { id: 'loan', name: 'Loan', type: 'credit', onBudget: false, closed: false },
      { id: 'chk', name: 'Checking', type: 'checking', onBudget: true, closed: false },
    )
    const out = ensurePaymentCategories(file)
    expect(out.accounts.map((a) => a.paymentCategoryId)).toEqual(['c', undefined, undefined])
    expect(out.categories).toHaveLength(1)
  })
})
