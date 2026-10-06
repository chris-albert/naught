import { describe, expect, it } from 'vitest'
import { recurringPayees, reserveHealth, targetAdherence, topPayees } from './insights'
import { emptyBudget, INCOME_CATEGORY_ID, type BudgetFile, type Transaction } from './types'

function fixture(): BudgetFile {
  const f = emptyBudget('t')
  f.accounts.push(
    { id: 'chk', name: 'Checking', type: 'checking', onBudget: true, closed: false },
    { id: 'visa', name: 'Visa', type: 'credit', onBudget: true, closed: false, paymentCategoryId: 'pay' },
    { id: 'ira', name: 'IRA', type: 'investment', onBudget: false, closed: false },
  )
  f.categoryGroups.push({ id: 'g1', name: 'Living', hidden: false }, { id: 'gcc', name: 'Credit Card Payments', hidden: false })
  f.categories.push(
    { id: 'food', groupId: 'g1', name: 'Food', hidden: false, target: 50000 },
    { id: 'rent', groupId: 'g1', name: 'Rent', hidden: false, target: 150000 },
    { id: 'fun', groupId: 'g1', name: 'Fun', hidden: false, target: 10000 },
    { id: 'vacation', groupId: 'g1', name: 'Vacation', hidden: false, reserve: true, target: 20000 },
    { id: 'pay', groupId: 'gcc', name: 'Visa', hidden: false },
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

const months = ['2026-01', '2026-02', '2026-03', '2026-04']

describe('targetAdherence', () => {
  it('compares living spending and reserve assignments with their targets', () => {
    const f = fixture()
    f.transactions.push(
      txn({ date: '2026-01-05', amount: -60000, categoryId: 'food' }),
      txn({ date: '2026-02-05', amount: -60000, categoryId: 'food' }),
      txn({ date: '2026-03-05', amount: -60000, categoryId: 'food' }),
      txn({ date: '2026-04-05', amount: -60000, categoryId: 'food' }),
      ...months.map((m) => txn({ date: `${m}-01`, amount: -150500, categoryId: 'rent' })),
      ...months.map((m) => txn({ date: `${m}-10`, amount: -2000, categoryId: 'fun' })),
      // draws from the reserve do not count as its "actual"
      txn({ date: '2026-03-15', amount: -80000, categoryId: 'vacation' }),
    )
    for (const m of months) f.assigned[m] = { vacation: 10000 }
    const s = targetAdherence(f, months)
    expect(s.rows.map((r) => [r.category.id, r.actual, r.delta, r.verdict])).toEqual([
      ['food', 60000, 10000, 'over'],
      ['vacation', 10000, -10000, 'under'],
      ['fun', 2000, -8000, 'under'],
      ['rent', 150500, 500, 'on'],
    ])
    expect(s.rows[0].pct).toBeCloseTo(0.2)
    expect(s.totals).toEqual({ target: 230000, actual: 222500 })
  })

  it('leaves out hidden categories and ones without a target', () => {
    const f = fixture()
    f.categories.find((c) => c.id === 'rent')!.hidden = true
    f.categories.push({ id: 'misc', groupId: 'g1', name: 'Misc', hidden: false })
    f.transactions.push(txn({ date: '2026-01-05', amount: -999, categoryId: 'misc' }))
    expect(targetAdherence(f, months).rows.map((r) => r.category.id).sort()).toEqual(['food', 'fun', 'vacation'])
  })
})

describe('recurringPayees', () => {
  const today = '2026-04-20'

  it('spots monthly and yearly payees and skips the rest', () => {
    const f = fixture()
    f.transactions.push(
      txn({ date: '2025-11-03', amount: -1549, payee: 'Netflix', categoryId: 'fun' }),
      txn({ date: '2025-12-03', amount: -1549, payee: 'Netflix', categoryId: 'fun' }),
      txn({ date: '2026-01-03', amount: -1549, payee: 'Netflix', categoryId: 'fun' }),
      txn({ date: '2026-02-03', amount: -1549, payee: 'Netflix', categoryId: 'fun' }),
      txn({ date: '2026-03-03', amount: -1549, payee: 'Netflix', categoryId: 'fun' }),
      txn({ date: '2026-04-03', amount: -1549, payee: 'Netflix', categoryId: 'fun' }),
      txn({ date: '2025-05-10', amount: -13900, payee: 'Amazon Prime', categoryId: 'fun' }),
      txn({ date: '2026-05-10', amount: -13900, payee: 'Amazon Prime', categoryId: 'fun' }), // after today: ignored
      txn({ date: '2024-05-10', amount: -13900, payee: 'Amazon Prime', categoryId: 'fun' }), // before the window
      txn({ date: '2025-05-10', amount: -14900, payee: 'Costco', categoryId: 'food' }),
      txn({ date: '2026-04-10', amount: -14900, payee: 'Costco', categoryId: 'food' }),
      txn({ date: '2026-04-01', amount: -500, payee: 'Grocer', categoryId: 'food' }),
      txn({ date: '2026-04-02', amount: -500, payee: 'Grocer', categoryId: 'food' }),
      txn({ date: '2026-04-09', amount: -500, payee: 'Grocer', categoryId: 'food' }),
      txn({ date: '2026-02-01', amount: 1549, payee: 'Netflix', categoryId: 'fun' }), // refund: not a charge
      txn({ date: '2026-02-01', amount: -50000, payee: 'Acme', categoryId: INCOME_CATEGORY_ID }),
      txn({ date: '2026-02-01', amount: -50000, payee: 'Visa', categoryId: 'pay', accountId: 'visa' }),
    )
    const s = recurringPayees(f, today)
    expect(s.payees.map((p) => [p.payee, p.cadence, p.amount, p.monthlyCost, p.status, p.stable])).toEqual([
      ['Netflix', 'monthly', 1549, 1549, 'active', true],
      ['Costco', 'yearly', 14900, 1242, 'active', true],
    ])
    expect(s.count).toBe(2)
    expect(s.fixedMonthly).toBe(1549 + 1242)
    expect(s.payees[0].categoryId).toBe('fun')
    expect(s.payees[0].count).toBe(6)
    expect(s.payees[0].priceChange).toBeUndefined()
  })

  it('marks new and stopped payees and detects a price change', () => {
    const f = fixture()
    f.transactions.push(
      txn({ date: '2025-10-15', amount: -1549, payee: 'Netflix', categoryId: 'fun' }),
      txn({ date: '2025-11-15', amount: -1549, payee: 'Netflix', categoryId: 'fun' }),
      txn({ date: '2025-12-15', amount: -1549, payee: 'Netflix', categoryId: 'fun' }),
      txn({ date: '2026-01-15', amount: -1549, payee: 'Netflix', categoryId: 'fun' }),
      txn({ date: '2026-02-15', amount: -1799, payee: 'Netflix', categoryId: 'fun' }),
      txn({ date: '2026-03-15', amount: -1799, payee: 'Netflix', categoryId: 'fun' }),
      txn({ date: '2026-02-05', amount: -999, payee: 'Spotify', categoryId: 'fun' }),
      txn({ date: '2026-03-05', amount: -999, payee: 'Spotify', categoryId: 'fun' }),
      txn({ date: '2026-04-05', amount: -999, payee: 'Spotify', categoryId: 'fun' }),
      txn({ date: '2025-10-20', amount: -4000, payee: 'Gym', categoryId: 'fun' }),
      txn({ date: '2025-11-20', amount: -4000, payee: 'Gym', categoryId: 'fun' }),
      txn({ date: '2025-12-20', amount: -4000, payee: 'Gym', categoryId: 'fun' }),
      txn({ date: '2026-01-20', amount: -4000, payee: 'Gym', categoryId: 'fun' }),
      // varies: utility bill, three of five outside 15% of the median
      txn({ date: '2025-12-01', amount: -5000, payee: 'Power Co', categoryId: 'rent' }),
      txn({ date: '2026-01-01', amount: -9000, payee: 'Power Co', categoryId: 'rent' }),
      txn({ date: '2026-02-01', amount: -12000, payee: 'Power Co', categoryId: 'rent' }),
      txn({ date: '2026-03-01', amount: -7000, payee: 'Power Co', categoryId: 'rent' }),
      txn({ date: '2026-04-01', amount: -3000, payee: 'Power Co', categoryId: 'rent' }),
    )
    const s = recurringPayees(f, today)
    const by = Object.fromEntries(s.payees.map((p) => [p.payee, p]))
    expect(by.Netflix.status).toBe('active')
    expect(by.Netflix.priceChange).toEqual({ from: 1549, to: 1799, since: '2026-02' })
    expect(by.Spotify.status).toBe('new')
    expect(by.Gym.status).toBe('stopped')
    expect(by.Gym.lastDate).toBe('2026-01-20')
    expect(by['Power Co'].stable).toBe(false)
    expect(by['Power Co'].amount).toBe(7000)
    expect(by['Power Co'].priceChange).toBeUndefined()
    // stopped and unstable payees are not fixed costs
    expect(s.fixedMonthly).toBe(1799 + 999)
    expect(s.payees.map((p) => p.payee)).toEqual(['Power Co', 'Gym', 'Netflix', 'Spotify'])
  })
})

describe('topPayees', () => {
  it('ranks payees by net money out and reports the recent shift', () => {
    const f = fixture()
    f.transactions.push(
      txn({ date: '2026-01-05', amount: -10000, payee: 'Grocer', categoryId: 'food' }),
      txn({ date: '2026-02-05', amount: -10000, payee: 'Grocer', categoryId: 'food' }),
      txn({ date: '2026-03-05', amount: -20000, payee: 'Grocer', categoryId: 'food' }),
      txn({ date: '2026-04-05', amount: -20000, payee: 'Grocer', categoryId: 'food' }),
      txn({ date: '2026-04-06', amount: 5000, payee: 'Grocer', categoryId: 'food' }), // refund
      txn({ date: '2026-04-07', amount: -100, payee: 'Grocer', categoryId: 'fun' }),
      txn({ date: '2026-01-01', amount: -150000, payee: 'Landlord', categoryId: 'rent' }),
      txn({ date: '2026-02-01', amount: -150000, payee: 'Landlord', categoryId: 'rent' }),
      txn({ date: '2026-03-01', amount: -150000, payee: 'Landlord', categoryId: 'rent' }),
      txn({ date: '2026-04-01', amount: -150000, payee: 'Landlord', categoryId: 'rent' }),
      txn({ date: '2026-04-01', amount: -2000, payee: 'Cafe' }), // uncategorized counts
      txn({ date: '2026-04-01', amount: -99999, payee: 'Broker', categoryId: 'food', accountId: 'ira' }), // off budget
      txn({ date: '2026-04-01', amount: -99999, payee: 'Visa', categoryId: 'pay', accountId: 'visa' }), // payment category
      txn({ date: '2026-04-01', amount: 300000, payee: 'Acme', categoryId: INCOME_CATEGORY_ID }), // income
      txn({ date: '2026-04-01', amount: 4000, payee: 'Refunder', categoryId: 'fun' }), // net money in: left out
    )
    const rows = topPayees(f, months)
    expect(rows.map((r) => [r.payee, r.total, r.count, r.categoryId, r.shift])).toEqual([
      ['Landlord', 600000, 4, 'rent', 0],
      ['Grocer', 55100, 6, 'food', 17550 - 10000],
      ['Cafe', 2000, 1, null, 1000],
    ])
    expect(rows[1].byMonth).toEqual([10000, 10000, 20000, 15100])
    expect(topPayees(f, months, 1).map((r) => r.payee)).toEqual(['Landlord'])
  })
})

describe('reserveHealth', () => {
  it('reports balance, fill rate, draw rate and runway for each reserve', () => {
    const f = fixture()
    f.categories.push({ id: 'buffer', groupId: 'g1', name: 'Buffer', hidden: false, reserve: true })
    f.transactions.push(
      txn({ date: '2026-01-01', amount: 500000, categoryId: INCOME_CATEGORY_ID, payee: 'Acme' }),
      txn({ date: '2026-02-10', amount: -30000, categoryId: 'vacation', payee: 'Airline' }),
      txn({ date: '2026-04-10', amount: -10000, categoryId: 'vacation', payee: 'Hotel' }),
      txn({ date: '2026-03-01', amount: 4000, categoryId: 'vacation', payee: 'Venmo' }), // money landing in it
    )
    for (const m of months) f.assigned[m] = { vacation: 15000, buffer: 1000 }
    const [buffer, vacation] = reserveHealth(f, months, '2026-04-20').sort((a, b) => a.category.id.localeCompare(b.category.id))
    expect(vacation.category.id).toBe('vacation')
    expect(vacation.balance).toBe(4 * 15000 + 4000 - 40000)
    expect(vacation.avgAssigned).toBe(15000)
    expect(vacation.avgSetAside).toBe(16000)
    expect(vacation.avgDrawn).toBe(10000)
    expect(vacation.net).toBe(6000)
    expect(vacation.vsTarget).toBe(-5000)
    expect(vacation.runwayMonths).toBe(2.4)
    expect(buffer.balance).toBe(4000)
    expect(buffer.avgDrawn).toBe(0)
    expect(buffer.runwayMonths).toBeNull()
    expect(buffer.vsTarget).toBeNull()
  })

  it('is empty without reserves', () => {
    const f = fixture()
    f.categories.forEach((c) => delete c.reserve)
    expect(reserveHealth(f, months, '2026-04-20')).toEqual([])
  })
})
