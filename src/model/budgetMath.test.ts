import { describe, expect, it } from 'vitest'
import { computeMonth } from './budgetMath'
import { emptyBudget, INCOME_CATEGORY_ID, type BudgetFile, type Transaction } from './types'

function fixture(): BudgetFile {
  const file = emptyBudget('test')
  file.accounts.push(
    { id: 'chk', name: 'Checking', type: 'checking', onBudget: true, closed: false },
    { id: 'visa', name: 'Visa', type: 'credit', onBudget: true, closed: false },
    { id: 'ira', name: 'IRA', type: 'investment', onBudget: false, closed: false },
  )
  file.categoryGroups.push({ id: 'g1', name: 'Living', hidden: false })
  file.categories.push(
    { id: 'food', groupId: 'g1', name: 'Food', hidden: false },
    { id: 'rent', groupId: 'g1', name: 'Rent', hidden: false },
  )
  return file
}

function txn(partial: Partial<Transaction> & Pick<Transaction, 'date' | 'amount'>): Transaction {
  return {
    id: Math.random().toString(36).slice(2),
    accountId: 'chk',
    payee: '',
    categoryId: null,
    memo: '',
    cleared: 'cleared',
    transferAccountId: null,
    ...partial,
  }
}

describe('computeMonth', () => {
  it('sums income, assigned and activity for a single month', () => {
    const file = fixture()
    file.transactions.push(
      txn({ date: '2026-01-02', amount: 300000, categoryId: INCOME_CATEGORY_ID }),
      txn({ date: '2026-01-05', amount: -12000, categoryId: 'food' }),
    )
    file.assigned['2026-01'] = { food: 40000, rent: 150000 }

    const m = computeMonth(file, '2026-01')
    expect(m.income).toBe(300000)
    expect(m.totalAssigned).toBe(190000)
    expect(m.toBudget).toBe(110000)
    const food = m.groups[0].rows.find((r) => r.category.id === 'food')!
    expect(food).toMatchObject({ assigned: 40000, activity: -12000, available: 28000 })
  })

  it('carries positive balances forward and does not carry overspending', () => {
    const file = fixture()
    file.transactions.push(
      txn({ date: '2026-01-01', amount: 100000, categoryId: INCOME_CATEGORY_ID }),
      txn({ date: '2026-01-10', amount: -5000, categoryId: 'food' }),
      txn({ date: '2026-01-11', amount: -30000, categoryId: 'rent' }),
    )
    file.assigned['2026-01'] = { food: 10000, rent: 20000 }

    const feb = computeMonth(file, '2026-02')
    const food = feb.groups[0].rows.find((r) => r.category.id === 'food')!
    const rent = feb.groups[0].rows.find((r) => r.category.id === 'rent')!
    expect(food.available).toBe(5000) // 10000 - 5000 carried
    expect(rent.available).toBe(0) // -10000 in Jan resets to 0
    // toBudget: 100000 income - 30000 assigned - 10000 overspent in Jan
    expect(feb.toBudget).toBe(60000)
  })

  it('transfers between budget accounts are neutral; uncategorized spending is unassigned cash gone', () => {
    const file = fixture()
    file.accounts.push({ id: 'sav', name: 'Savings', type: 'savings', onBudget: true, closed: false })
    file.transactions.push(
      txn({ date: '2026-03-01', amount: 100000, categoryId: INCOME_CATEGORY_ID }),
      txn({ date: '2026-03-01', amount: -5000, transferAccountId: 'sav', accountId: 'chk' }),
      txn({ date: '2026-03-01', amount: 5000, transferAccountId: 'chk', accountId: 'sav' }),
      txn({ date: '2026-03-02', amount: -700 }),
    )
    const m = computeMonth(file, '2026-03')
    expect(m.toBudget).toBe(99300)
    expect(m.groups[0].activity).toBe(0)
  })

  it('subtracts money assigned ahead from the present month, but not from past months', () => {
    const file = fixture()
    file.transactions.push(txn({ date: '2026-03-01', amount: 100000, categoryId: INCOME_CATEGORY_ID }))
    file.assigned['2026-04'] = { rent: 30000 }
    // viewed in March: April's assignment is money committed ahead
    expect(computeMonth(file, '2026-03', '2026-03').toBudget).toBe(70000)
    expect(computeMonth(file, '2026-04', '2026-03').toBudget).toBe(70000)
    // viewed later: March's figure is what was unassigned at the time
    expect(computeMonth(file, '2026-03', '2026-05').toBudget).toBe(100000)
    expect(computeMonth(file, '2026-04', '2026-05').toBudget).toBe(70000)
  })

  it('does not deduct credit card overspending from toBudget', () => {
    const file = fixture()
    file.transactions.push(
      txn({ date: '2026-01-01', amount: 100000, categoryId: INCOME_CATEGORY_ID }),
      txn({ date: '2026-01-10', amount: -8000, categoryId: 'food', accountId: 'visa' }),
      txn({ date: '2026-01-12', amount: -5000, categoryId: 'food', accountId: 'chk' }),
    )
    file.assigned['2026-01'] = { food: 3000 }
    // overspent by 10000: 8000 was on credit, so only 2000 is cash overspending
    const jan = computeMonth(file, '2026-01')
    expect(jan.groups[0].rows[0].available).toBe(-10000)
    expect(jan.toBudget).toBe(97000)
    const feb = computeMonth(file, '2026-02')
    expect(feb.groups[0].rows[0].available).toBe(0)
    expect(feb.toBudget).toBe(95000)
  })

  it('ignores off-budget accounts entirely', () => {
    const file = fixture()
    file.transactions.push(
      txn({ date: '2026-01-01', amount: 999900, categoryId: INCOME_CATEGORY_ID, accountId: 'ira' }),
      txn({ date: '2026-01-02', amount: -5000, categoryId: 'food', accountId: 'ira' }),
    )
    const m = computeMonth(file, '2026-01')
    expect(m.income).toBe(0)
    expect(m.toBudget).toBe(0)
    expect(m.groups[0].activity).toBe(0)
  })

  describe('credit card payment envelopes', () => {
    function cardFixture() {
      const file = fixture()
      file.categoryGroups.push({ id: 'gcc', name: 'Credit Card Payments', hidden: false })
      file.categories.push({ id: 'pay-visa', groupId: 'gcc', name: 'Visa', hidden: false })
      file.accounts.find((a) => a.id === 'visa')!.paymentCategoryId = 'pay-visa'
      return file
    }
    const row = (file: BudgetFile, month: string, id: string) =>
      computeMonth(file, month).groups.flatMap((g) => g.rows).find((r) => r.category.id === id)!

    it('moves covered card spending into the payment category', () => {
      const file = cardFixture()
      file.transactions.push(
        txn({ date: '2026-01-01', amount: 100000, categoryId: INCOME_CATEGORY_ID }),
        txn({ date: '2026-01-10', amount: -8000, categoryId: 'food', accountId: 'visa' }),
      )
      file.assigned['2026-01'] = { food: 10000 }
      expect(row(file, '2026-01', 'food')).toMatchObject({ activity: -8000, available: 2000 })
      expect(row(file, '2026-01', 'pay-visa')).toMatchObject({ assigned: 0, activity: 8000, available: 8000 })
      expect(computeMonth(file, '2026-01').toBudget).toBe(90000)
    })

    it('only funds the payment category with what the envelope could cover', () => {
      const file = cardFixture()
      file.transactions.push(
        txn({ date: '2026-01-01', amount: 100000, categoryId: INCOME_CATEGORY_ID }),
        txn({ date: '2026-01-10', amount: -8000, categoryId: 'food', accountId: 'visa' }),
      )
      file.assigned['2026-01'] = { food: 3000 }
      // food overspent by 5000 on credit: unfunded debt, not taken from toBudget
      expect(row(file, '2026-01', 'food').available).toBe(-5000)
      expect(row(file, '2026-01', 'pay-visa').available).toBe(3000)
      expect(computeMonth(file, '2026-02').toBudget).toBe(97000)
      expect(row(file, '2026-02', 'pay-visa').available).toBe(3000)
    })

    it('card payments and inflows on the card move money out of the payment category', () => {
      const file = cardFixture()
      file.transactions.push(
        txn({ date: '2026-01-01', amount: 100000, categoryId: INCOME_CATEGORY_ID }),
        txn({ date: '2026-01-10', amount: -8000, categoryId: 'food', accountId: 'visa' }),
        // pay the card from checking
        txn({ date: '2026-01-20', amount: -5000, transferAccountId: 'visa', accountId: 'chk' }),
        txn({ date: '2026-01-20', amount: 5000, transferAccountId: 'chk', accountId: 'visa' }),
        // refund of a categorized purchase
        txn({ date: '2026-01-22', amount: 1000, categoryId: 'food', accountId: 'visa' }),
        // uncategorized card charge has no effect yet
        txn({ date: '2026-01-23', amount: -999, accountId: 'visa' }),
      )
      file.assigned['2026-01'] = { food: 10000 }
      expect(row(file, '2026-01', 'food')).toMatchObject({ activity: -7000, available: 3000 })
      expect(row(file, '2026-01', 'pay-visa')).toMatchObject({ activity: 2000, available: 2000 })
    })

    it('income received on a card is reported as income but is not cash to budget', () => {
      const file = cardFixture()
      file.transactions.push(txn({ date: '2026-01-05', amount: 4000, categoryId: INCOME_CATEGORY_ID, accountId: 'visa' }))
      const jan = computeMonth(file, '2026-01')
      expect(jan.income).toBe(4000)
      expect(jan.toBudget).toBe(0)
      expect(row(file, '2026-01', 'pay-visa')).toMatchObject({ activity: 0, available: 0 })
    })

    it("a card's starting balance is pre-existing debt and affects nothing", () => {
      const file = cardFixture()
      file.transactions.push(
        txn({ date: '2026-01-01', amount: -50000, categoryId: INCOME_CATEGORY_ID, accountId: 'visa', payee: 'Starting Balance' }),
        txn({ date: '2026-01-01', amount: 1000, categoryId: INCOME_CATEGORY_ID, accountId: 'chk', payee: 'Starting Balance' }),
      )
      const jan = computeMonth(file, '2026-01')
      expect(jan.income).toBe(1000)
      expect(row(file, '2026-01', 'pay-visa').available).toBe(0)
    })

    it('overpaying a card from unbudgeted cash shows up in to budget next month', () => {
      const file = cardFixture()
      file.transactions.push(
        txn({ date: '2026-01-01', amount: 100000, categoryId: INCOME_CATEGORY_ID }),
        txn({ date: '2026-01-20', amount: -5000, transferAccountId: 'visa', accountId: 'chk' }),
        txn({ date: '2026-01-20', amount: 5000, transferAccountId: 'chk', accountId: 'visa' }),
      )
      expect(row(file, '2026-01', 'pay-visa').available).toBe(-5000)
      expect(computeMonth(file, '2026-01').toBudget).toBe(100000)
      expect(computeMonth(file, '2026-02').toBudget).toBe(95000)
    })
  })
})
