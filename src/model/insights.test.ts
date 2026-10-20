import { describe, expect, it } from 'vitest'
import { looksRaw, normalizePayee, recurringPayees, reserveHealth, setNotRecurring, targetAdherence, topPayees } from './insights'
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
    expect(s.totals).toEqual({ target: 230000, actual: 222500, actualByMonth: [222500, 222500, 222500, 222500] })
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
      txn({ date: '2024-03-10', amount: -13900, payee: 'Amazon Prime', categoryId: 'fun' }), // before the two-year window
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

  it('sees a yearly payee whose charges straddle the monthly window and says when the next is due', () => {
    const f = fixture()
    f.transactions.push(
      txn({ date: '2025-04-27', amount: -7999, payee: 'Strava', categoryId: 'fun' }),
      txn({ date: '2026-04-27', amount: -7999, payee: 'Strava', categoryId: 'fun' }),
      // renewed once, then the next renewal never came: stopped
      txn({ date: '2024-09-10', amount: -9900, payee: 'Shapes', categoryId: 'fun' }),
      txn({ date: '2025-09-10', amount: -9900, payee: 'Shapes', categoryId: 'fun' }),
      // a monthly series that ended more than 13 months ago is not worth listing
      ...['2024-10', '2024-11', '2024-12', '2025-01', '2025-02'].map((m) => txn({ date: `${m}-05`, amount: -1200, payee: 'Old Gym', categoryId: 'fun' })),
    )
    const s = recurringPayees(f, '2026-10-19')
    const by = Object.fromEntries(s.payees.map((p) => [p.payee, p]))
    expect(Object.keys(by).sort()).toEqual(['Shapes', 'Strava'])
    expect(by.Strava).toMatchObject({ cadence: 'yearly', status: 'active', count: 2, nextDate: '2027-04-27' })
    expect(by.Shapes).toMatchObject({ cadence: 'yearly', status: 'stopped', lastDate: '2025-09-10' })
    expect(by.Shapes.nextDate).toBeUndefined()
    expect(s.fixedMonthly).toBe(Math.round(7999 / 12))
  })

  it('counts raw bank spellings and renamed payees as one series', () => {
    const f = fixture()
    f.transactions.push(
      txn({ date: '2026-01-21', amount: -4999, payee: 'Peloton', categoryId: 'fun' }),
      txn({ date: '2026-02-21', amount: -4999, payee: 'Peloton', categoryId: 'fun' }),
      txn({ date: '2026-03-21', amount: -4999, payee: 'PELOTON* MEMBERSHIP NEW YORK NY null XXXXXXXXXXXX8464', categoryId: 'fun' }),
      txn({ date: '2026-04-21', amount: -4999, payee: 'Peloton', categoryId: 'fun' }),
      // two card numbers, no clean payee: still one series
      txn({ date: '2026-01-24', amount: -2699, payee: 'NETFLIX.COM LOS GATOS CA null XXXXXXXXXXXX1111', categoryId: 'fun' }),
      txn({ date: '2026-02-24', amount: -2699, payee: 'NETFLIX.COM LOS GATOS CA null XXXXXXXXXXXX1111', categoryId: 'fun' }),
      txn({ date: '2026-03-24', amount: -2699, payee: 'NETFLIX.COM LOS GATOS CA null XXXXXXXXXXXX9678', categoryId: 'fun' }),
      txn({ date: '2026-04-24', amount: -2699, payee: 'NETFLIX.COM LOS GATOS CA null XXXXXXXXXXXX9678', categoryId: 'fun' }),
      // two products charging a week apart stay two payees, even though one name starts with the other
      ...['2026-02-07', '2026-03-07', '2026-04-07'].map((date) => txn({ date, amount: -1628, payee: 'Amazon Prime', categoryId: 'fun' })),
      ...['2026-02-14', '2026-03-14', '2026-04-14'].map((date) => txn({ date, amount: -499, payee: 'Amazon', categoryId: 'fun' })),
      // a rename: the old and new spelling never charge in the same month
      ...['2026-01-28', '2026-02-28'].map((date) => txn({ date, amount: -1899, payee: 'Hulu', categoryId: 'fun' })),
      ...['2026-03-28', '2026-04-28'].map((date) => txn({ date, amount: -1899, payee: 'Hulu Plus', categoryId: 'fun' })),
    )
    const s = recurringPayees(f, '2026-04-30')
    const by = Object.fromEntries(s.payees.map((p) => [p.payee, p]))
    expect(Object.keys(by).sort()).toEqual(['Amazon', 'Amazon Prime', 'Hulu', 'NETFLIX.COM LOS GATOS CA null XXXXXXXXXXXX1111', 'Peloton'])
    expect(by.Peloton.count).toBe(4)
    expect(by['NETFLIX.COM LOS GATOS CA null XXXXXXXXXXXX1111'].count).toBe(4)
    expect(by.Amazon.count).toBe(3)
    expect(by.Hulu).toMatchObject({ count: 4, lastDate: '2026-04-28', status: 'active' })
  })

  it('tells a subscription or bill from a habit by billing day, exact amount and one charge a month', () => {
    const f = fixture()
    f.transactions.push(
      // a restaurant: about monthly on average, but scattered days, odd amounts, some months twice
      ...[
        ['2026-01-04', -6318],
        ['2026-02-11', -4420],
        ['2026-02-27', -9105],
        ['2026-03-19', -5260],
        ['2026-04-02', -7733],
        ['2026-04-25', -3891],
        ['2026-05-30', -6604],
        ['2026-06-14', -5120],
      ].map(([date, amount]) => txn({ date: date as string, amount: amount as number, payee: 'Taqueria', categoryId: 'food' })),
      // a utility: amount swings, but it lands on the 5th every month
      ...[-5000, -9000, -12000, -7000, -3000, -6000].map((amount, i) => txn({ date: `2026-0${i + 1}-05`, amount, payee: 'Power Co', categoryId: 'rent' })),
      // a class with a fixed fee paid whenever the person remembers: exact amount carries it
      ...['2026-01-03', '2026-02-19', '2026-03-10', '2026-04-27', '2026-05-15', '2026-06-08'].map((date) => txn({ date, amount: -12800, payee: 'Tutu School', categoryId: 'fun' })),
      // a farm box: exact amount, but twice most months
      ...['2026-01-03', '2026-01-17', '2026-02-07', '2026-02-21', '2026-03-07', '2026-03-21', '2026-04-04', '2026-04-18'].map((date) => txn({ date, amount: -1550, payee: 'Farm Box', categoryId: 'food' })),
    )
    const s = recurringPayees(f, '2026-06-20')
    expect(s.payees.map((p) => p.payee).sort()).toEqual(['Power Co', 'Tutu School'])
    expect(s.payees.find((p) => p.payee === 'Power Co')!.stable).toBe(false)
  })

  it('drops a yearly pair whose amounts disagree and payees marked not recurring', () => {
    let f = fixture()
    f.transactions.push(
      txn({ date: '2025-10-03', amount: -6980, payee: 'Taproom', categoryId: 'food' }),
      txn({ date: '2026-10-03', amount: -10342, payee: 'Taproom', categoryId: 'food' }),
      txn({ date: '2025-04-27', amount: -7999, payee: 'Strava', categoryId: 'fun' }),
      txn({ date: '2026-04-27', amount: -7999, payee: 'Strava', categoryId: 'fun' }),
      ...['2026-07-21', '2026-08-21', '2026-09-21'].map((date) => txn({ date, amount: -4999, payee: 'Therapist', categoryId: 'fun' })),
    )
    expect(recurringPayees(f, '2026-10-19').payees.map((p) => p.payee).sort()).toEqual(['Strava', 'Therapist'])
    f = setNotRecurring(f, 'Therapist', true)
    expect(f.notRecurring).toEqual(['Therapist'])
    expect(recurringPayees(f, '2026-10-19').payees.map((p) => p.payee)).toEqual(['Strava'])
    f = setNotRecurring(f, 'Therapist', false)
    expect(f.notRecurring).toEqual([])
    expect(recurringPayees(f, '2026-10-19').payees).toHaveLength(2)
  })
})

describe('payee normalization', () => {
  it('tells raw bank strings from renamed payees', () => {
    expect(looksRaw('PELOTON* MEMBERSHIP NEW YORK NY null XXXXXXXXXXXX8464')).toBe(true)
    expect(looksRaw('SQ *ZEITGEIST San Francisco CA')).toBe(true)
    expect(looksRaw('CITIBAN0000282')).toBe(true)
    expect(looksRaw('WHOLEFDS STO#10717 SAN FRANCISCO CA')).toBe(true)
    expect(looksRaw('Peloton')).toBe(false)
    expect(looksRaw('Disney+')).toBe(false)
    expect(looksRaw('AAA')).toBe(false)
    expect(looksRaw('Citi 2732')).toBe(true)
  })

  it('drops processor prefixes, card masks and digits', () => {
    expect(normalizePayee('PELOTON* MEMBERSHIP NEW YORK NY null XXXXXXXXXXXX8464')).toBe('peloton membership new york ny')
    expect(normalizePayee('TST*FLOUR & WATER PAST San Francisco CA')).toBe('flour & water past san francisco ca')
    expect(normalizePayee('SQ *ZEITGEIST San Francisco CA')).toBe('zeitgeist san francisco ca')
    expect(normalizePayee('AMAZON MKTPL*5O13F8Z11 SEATTLE WA null XXXXXXXXXXXX2920')).toBe('amazon mktpl seattle wa')
    expect(normalizePayee("Trader Joe's")).toBe("trader joe's")
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
