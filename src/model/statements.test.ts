import { describe, expect, it } from 'vitest'
import { nextClosing, upcomingClosings } from './statements'
import { emptyBudget, type Account } from './types'

describe('nextClosing', () => {
  it('uses this month when the day is still ahead, including today', () => {
    expect(nextClosing(20, '2026-10-05')).toBe('2026-10-20')
    expect(nextClosing(5, '2026-10-05')).toBe('2026-10-05')
  })

  it('rolls to next month once the day has passed', () => {
    expect(nextClosing(3, '2026-10-05')).toBe('2026-11-03')
    expect(nextClosing(3, '2026-12-05')).toBe('2027-01-03')
  })

  it('clamps to the last day of short months', () => {
    expect(nextClosing(31, '2026-11-02')).toBe('2026-11-30')
    expect(nextClosing(30, '2026-02-01')).toBe('2026-02-28')
  })
})

describe('upcomingClosings', () => {
  const card = (over: Partial<Account>): Account => ({ id: 'c', name: 'Visa', type: 'credit', onBudget: true, closed: false, statementDay: 8, ...over })

  it('lists cards closing within the window that owe something, soonest first', () => {
    const file = emptyBudget('t')
    file.accounts.push(
      card({ id: 'later', statementDay: 9, bankBalance: -50_00 }),
      card({ id: 'soon', statementDay: 7, bankBalance: -412_00 }),
      card({ id: 'far', statementDay: 20, bankBalance: -10_00 }),
      card({ id: 'paid', bankBalance: 0 }),
      card({ id: 'closed', closed: true, bankBalance: -10_00 }),
      card({ id: 'unset', statementDay: undefined, bankBalance: -10_00 }),
      { id: 'chk', name: 'Checking', type: 'checking', onBudget: true, closed: false, statementDay: 6, bankBalance: 100_00 },
    )
    const out = upcomingClosings(file, '2026-10-05')
    expect(out.map((c) => [c.account.id, c.closesOn, c.daysLeft, c.owed])).toEqual([
      ['soon', '2026-10-07', 2, 412_00],
      ['later', '2026-10-09', 4, 50_00],
    ])
  })

  it('falls back to the book balance when the card has never synced', () => {
    const file = emptyBudget('t')
    file.accounts.push(card({}))
    file.transactions.push(
      { id: 't1', accountId: 'c', date: '2026-10-01', payee: 'Shop', categoryId: null, memo: '', amount: -30_00, transferAccountId: null, cleared: 'cleared' },
      { id: 't2', accountId: 'c', date: '2026-10-02', payee: 'Shop', categoryId: null, memo: '', amount: -5_00, transferAccountId: null, cleared: 'uncleared' },
    )
    expect(upcomingClosings(file, '2026-10-08')).toMatchObject([{ daysLeft: 0, owed: 35_00 }])
  })
})
