import { describe, expect, it } from 'vitest'
import { computeMonth } from './budgetMath'
import { assignGroupTargets, assignTarget, targetShortfall } from './targets'
import { emptyBudget, type BudgetFile } from './types'

function fixture(): BudgetFile {
  const f = emptyBudget('t')
  f.accounts.push({ id: 'chk', name: 'Checking', type: 'checking', onBudget: true, closed: false })
  f.categoryGroups.push({ id: 'bills', name: 'Bills', hidden: false }, { id: 'fun', name: 'Fun', hidden: false })
  f.categories.push(
    { id: 'rent', groupId: 'bills', name: 'Rent', hidden: false, target: 150000 },
    { id: 'power', groupId: 'bills', name: 'Power', hidden: false, target: 12000 },
    { id: 'water', groupId: 'bills', name: 'Water', hidden: false, target: 5000 },
    { id: 'misc', groupId: 'bills', name: 'Misc', hidden: false },
    { id: 'games', groupId: 'fun', name: 'Games', hidden: false, target: 4000 },
  )
  f.transactions.push({
    id: 'pay',
    accountId: 'chk',
    date: '2026-03-01',
    payee: 'Employer',
    categoryId: 'income',
    memo: '',
    amount: 300000,
    cleared: 'cleared',
    transferAccountId: null,
  })
  f.assigned['2026-03'] = { rent: 100000, water: 6000, misc: 2000 }
  f.assigned['2026-02'] = { rent: 150000 }
  return f
}

describe('targetShortfall', () => {
  it('is what is left to reach the target, never negative, and zero without a target', () => {
    expect(targetShortfall({ id: 'a', groupId: 'g', name: 'A', hidden: false, target: 5000 }, 1000)).toBe(4000)
    expect(targetShortfall({ id: 'a', groupId: 'g', name: 'A', hidden: false, target: 5000 }, 7000)).toBe(0)
    expect(targetShortfall({ id: 'a', groupId: 'g', name: 'A', hidden: false }, 0)).toBe(0)
  })
})

describe('assignTarget', () => {
  it('tops the category up to its target', () => {
    const after = assignTarget(fixture(), '2026-03', 'rent')
    expect(after.assigned['2026-03']).toEqual({ rent: 150000, water: 6000, misc: 2000 })
  })

  it('starts from zero in a month with nothing assigned yet', () => {
    const after = assignTarget(fixture(), '2026-04', 'power')
    expect(after.assigned['2026-04']).toEqual({ power: 12000 })
    expect(after.assigned['2026-03']).toEqual({ rent: 100000, water: 6000, misc: 2000 })
  })

  it('leaves a funded category, one without a target, or an unknown id alone', () => {
    const before = fixture()
    expect(assignTarget(before, '2026-03', 'water')).toBe(before)
    expect(assignTarget(before, '2026-03', 'misc')).toBe(before)
    expect(assignTarget(before, '2026-03', 'nope')).toBe(before)
  })
})

describe('assignGroupTargets', () => {
  it('assigns every targeted category in the group its shortfall and nothing else', () => {
    const before = fixture()
    const after = assignGroupTargets(before, '2026-03', 'bills')
    expect(after.assigned['2026-03']).toEqual({ rent: 150000, power: 12000, water: 6000, misc: 2000 })
    expect(after.assigned['2026-02']).toEqual(before.assigned['2026-02'])
    expect(after.categories).toBe(before.categories)
    expect(after.transactions).toBe(before.transactions)
  })

  it('moves exactly the group shortfall out of To budget', () => {
    const before = fixture()
    const after = assignGroupTargets(before, '2026-03', 'bills')
    expect(computeMonth(before, '2026-03').toBudget - computeMonth(after, '2026-03').toBudget).toBe(50000 + 12000)
  })

  it('returns the same file when the group is already funded or has no targets', () => {
    const funded = assignGroupTargets(fixture(), '2026-03', 'bills')
    expect(assignGroupTargets(funded, '2026-03', 'bills')).toBe(funded)
    const before = fixture()
    expect(assignGroupTargets(before, '2026-03', 'nope')).toBe(before)
  })
})
