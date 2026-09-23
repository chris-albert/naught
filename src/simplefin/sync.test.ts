import { describe, expect, it } from 'vitest'
import { emptyBudget, INCOME_CATEGORY_ID, type BudgetFile, type Transaction } from '../model/types'
import type { SimplefinAccount } from './client'
import { createLinkedAccount, epochToIsoDate, mergeSimplefin, parseDecimal } from './sync'

const day = (iso: string) => Math.floor(Date.parse(iso) / 1000)

function bank(overrides: Partial<SimplefinAccount> = {}): SimplefinAccount {
  return {
    id: 'sf-1',
    name: 'Checking',
    org: 'Bank',
    currency: 'USD',
    balance: '100.00',
    'balance-date': day('2026-09-15'),
    transactions: [],
    ...overrides,
  }
}

function fileWith(transactions: Transaction[] = []): BudgetFile {
  const f = emptyBudget('t')
  f.accounts.push({ id: 'chk', name: 'Checking', type: 'checking', onBudget: true, closed: false, simplefinId: 'sf-1' })
  f.transactions.push(...transactions)
  return f
}

const txn = (p: Partial<Transaction> & Pick<Transaction, 'date' | 'amount'>): Transaction => ({
  id: p.id ?? Math.random().toString(36).slice(2),
  accountId: 'chk',
  payee: 'Old',
  categoryId: null,
  memo: '',
  cleared: 'cleared',
  transferAccountId: null,
  ...p,
})

describe('parseDecimal', () => {
  it('parses decimal strings exactly', () => {
    expect(parseDecimal('12.34')).toBe(1234)
    expect(parseDecimal('-0.10')).toBe(-10)
    expect(parseDecimal('5')).toBe(500)
    expect(parseDecimal('1.005')).toBe(100)
    expect(() => parseDecimal('abc')).toThrow()
  })
  it('converts epoch seconds to ISO dates', () => {
    expect(epochToIsoDate(day('2026-09-15'))).toBe('2026-09-15')
  })
})

describe('mergeSimplefin', () => {
  const now = new Date('2026-09-16T00:00:00Z')

  it('inserts new transactions as uncategorized with the bank id', () => {
    const { file, stats } = mergeSimplefin(
      fileWith(),
      [bank({ transactions: [{ id: 'a', posted: day('2026-09-10'), amount: '-12.34', description: 'COFFEE SHOP', payee: 'Coffee' }] })],
      { now },
    )
    expect(stats).toEqual({ added: 1, matched: 0, updated: 0, unchanged: 0, removed: 0, categorized: 0 })
    expect(file.transactions[0]).toMatchObject({
      accountId: 'chk',
      date: '2026-09-10',
      amount: -1234,
      payee: 'Coffee',
      categoryId: null,
      cleared: 'cleared',
      importId: 'sfin:sf-1:a',
    })
    expect(file.simplefinLastSync).toBe(now.toISOString())
  })

  it('skips transactions already imported and updates pending ones that posted', () => {
    const existing = fileWith([
      txn({ id: 'x', date: '2026-09-10', amount: -1234, importId: 'sfin:sf-1:a', cleared: 'uncleared' }),
      txn({ id: 'y', date: '2026-09-11', amount: -500, importId: 'sfin:sf-1:b' }),
    ])
    const { file, stats } = mergeSimplefin(
      existing,
      [
        bank({
          transactions: [
            { id: 'a', posted: day('2026-09-12'), amount: '-12.34', description: 'x' },
            { id: 'b', posted: day('2026-09-11'), amount: '-5.00', description: 'y' },
          ],
        }),
      ],
      { now },
    )
    expect(stats).toEqual({ added: 0, matched: 0, updated: 1, unchanged: 1, removed: 0, categorized: 0 })
    expect(file.transactions.find((t) => t.id === 'x')).toMatchObject({ date: '2026-09-12', cleared: 'cleared' })
    expect(file.transactions).toHaveLength(2)
  })

  it('matches an existing manual transaction by amount within a few days instead of duplicating', () => {
    const existing = fileWith([
      txn({ id: 'm', date: '2026-09-08', amount: -4200, payee: 'Grocer', categoryId: 'food', cleared: 'uncleared' }),
      txn({ id: 'far', date: '2026-08-01', amount: -4200 }),
    ])
    const { file, stats } = mergeSimplefin(
      existing,
      [bank({ transactions: [{ id: 'g', posted: day('2026-09-10'), amount: '-42.00', description: 'GROCER 123' }] })],
      { now },
    )
    expect(stats).toEqual({ added: 0, matched: 1, updated: 0, unchanged: 0, removed: 0, categorized: 0 })
    const m = file.transactions.find((t) => t.id === 'm')!
    expect(m).toMatchObject({ importId: 'sfin:sf-1:g', categoryId: 'food', payee: 'Grocer', cleared: 'cleared' })
    expect(file.transactions.find((t) => t.id === 'far')!.importId).toBeUndefined()
    expect(file.transactions).toHaveLength(2)
  })

  it('matches a transfer that posted several days later, choosing the closest date', () => {
    const existing = fileWith([
      txn({ id: 'early', date: '2026-08-28', amount: -8490 }),
      txn({ id: 'transfer', date: '2026-09-04', amount: -8490, transferAccountId: 'amz', cleared: 'reconciled' }),
    ])
    const { file, stats } = mergeSimplefin(
      existing,
      [bank({ transactions: [{ id: 'pay', posted: day('2026-09-08'), amount: '-84.90', description: 'Chase Credit Card' }] })],
      { now },
    )
    expect(stats).toEqual({ added: 0, matched: 1, updated: 0, unchanged: 0, removed: 0, categorized: 0 })
    expect(file.transactions.find((t) => t.id === 'transfer')!.importId).toBe('sfin:sf-1:pay')
    expect(file.transactions.find((t) => t.id === 'early')!.importId).toBeUndefined()
    expect(file.transactions).toHaveLength(2)
  })

  it('never downgrades a reconciled transaction and does not match twice', () => {
    const existing = fileWith([txn({ id: 'r', date: '2026-09-10', amount: -100, cleared: 'reconciled' })])
    const { file, stats } = mergeSimplefin(
      existing,
      [
        bank({
          transactions: [
            { id: 'p1', posted: day('2026-09-10'), amount: '-1.00', description: 'a' },
            { id: 'p2', posted: day('2026-09-10'), amount: '-1.00', description: 'b' },
          ],
        }),
      ],
      { now },
    )
    expect(stats).toEqual({ added: 1, matched: 1, updated: 0, unchanged: 0, removed: 0, categorized: 0 })
    expect(file.transactions.find((t) => t.id === 'r')).toMatchObject({ cleared: 'reconciled', importId: 'sfin:sf-1:p1' })
    expect(file.transactions.find((t) => t.importId === 'sfin:sf-1:p2')).toMatchObject({ cleared: 'cleared' })
  })

  it('ignores pending transactions entirely', () => {
    const { file, stats } = mergeSimplefin(
      fileWith(),
      [bank({ transactions: [{ id: 'p', posted: day('2026-09-10'), amount: '-9.00', description: 'hold', pending: true }] })],
      { now },
    )
    expect(stats.added).toBe(0)
    expect(file.transactions).toHaveLength(0)
  })

  it('removes previously imported pending rows the bank no longer sends within the window', () => {
    const existing = fileWith([
      txn({ id: 'stale', date: '2026-09-06', amount: -2500, importId: 'sfin:sf-1:old', cleared: 'uncleared' }),
      txn({ id: 'tooOld', date: '2026-08-01', amount: -300, importId: 'sfin:sf-1:ancient', cleared: 'uncleared' }),
      txn({ id: 'manual', date: '2026-09-06', amount: -700, cleared: 'uncleared' }),
    ])
    const { file, stats } = mergeSimplefin(
      existing,
      [bank({ transactions: [{ id: 'new', posted: day('2026-09-08'), amount: '-27.50', description: 'posted with tip' }] })],
      { since: '2026-08-20', now },
    )
    expect(stats).toMatchObject({ added: 1, removed: 1, categorized: 0 })
    expect(file.transactions.map((t) => t.id).sort()).toEqual(expect.arrayContaining(['manual', 'tooOld']))
    expect(file.transactions.find((t) => t.id === 'stale')).toBeUndefined()
    expect(file.transactions).toHaveLength(3)
  })

  it('adds a starting balance for newly created accounts so the balance matches the bank', () => {
    const f = emptyBudget('t')
    const sfin = bank({
      balance: '250.00',
      transactions: [
        { id: '1', posted: day('2026-09-05'), amount: '-20.00', description: 'a' },
        { id: '2', posted: day('2026-09-09'), amount: '70.00', description: 'b' },
      ],
    })
    const account = createLinkedAccount(sfin, 'checking', true)
    f.accounts.push(account)
    const { file } = mergeSimplefin(f, [sfin], { newAccountIds: new Set([account.id]), now })
    const total = file.transactions.reduce((s, t) => s + t.amount, 0)
    expect(total).toBe(25000)
    const start = file.transactions.find((t) => t.payee === 'Starting Balance')!
    expect(start).toMatchObject({ amount: 20000, date: '2026-09-04', categoryId: INCOME_CATEGORY_ID, cleared: 'reconciled' })
  })

  it('ignores bank accounts that are not linked', () => {
    const { file, stats } = mergeSimplefin(
      fileWith(),
      [bank({ id: 'unlinked', transactions: [{ id: 'z', posted: day('2026-09-10'), amount: '-1.00', description: 'z' }] })],
      { now },
    )
    expect(stats.added).toBe(0)
    expect(file.transactions).toHaveLength(0)
  })

  it('records the bank balance, date, and pending total on linked accounts', () => {
    const { file } = mergeSimplefin(
      fileWith(),
      [bank({ balance: '1234.56', transactions: [{ id: 'p', posted: day('2026-09-14'), amount: '-20.00', description: 'hold', pending: true }] })],
      { now },
    )
    expect(file.accounts[0]).toMatchObject({ bankBalance: 123456, bankBalanceDate: '2026-09-15T00:00:00.000Z', bankPending: -2000 })
    expect(file.transactions).toHaveLength(0)
  })
})

describe('mergeSimplefin with payee rules', () => {
  it('categorizes inserted transactions whose payee has a rule', () => {
    const f = fileWith()
    f.payeeRules = { Coffee: 'dining' }
    const { file, stats } = mergeSimplefin(
      f,
      [
        bank({
          transactions: [
            { id: 'a', posted: day('2026-09-10'), amount: '-12.34', description: 'COFFEE', payee: 'Coffee' },
            { id: 'b', posted: day('2026-09-11'), amount: '-5.00', description: 'UNKNOWN', payee: 'Unknown' },
          ],
        }),
      ],
      { now: new Date('2026-09-16T00:00:00Z') },
    )
    expect(stats).toMatchObject({ added: 2, categorized: 1 })
    expect(file.transactions.find((t) => t.payee === 'Coffee')?.categoryId).toBe('dining')
    expect(file.transactions.find((t) => t.payee === 'Unknown')?.categoryId).toBeNull()
  })
})
