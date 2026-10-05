import { isSplit } from './splits'
import type { Account, BudgetFile, Transaction } from './types'

/**
 * Transfers between two of your accounts, chosen through the payee like in
 * YNAB ("Transfer: Checking"). A transfer has no category; its two sides point
 * at each other through `transferAccountId`, and the budget math takes care of
 * the rest (a card's side draws from its payment category). Nothing links the
 * two rows by id: the other side is the row on the other account that points
 * back with the opposite amount, nearest in date.
 */

/** The other side may already have been imported from the bank up to this many days away. */
const MATCH_WINDOW_DAYS = 10

export const transferPayee = (account: Account) => `Transfer: ${account.name}`

/** Make `transactionId` a transfer to `accountId`, or a plain transaction again when it is null. */
export function setTransfer(file: BudgetFile, transactionId: string, accountId: string | null): BudgetFile {
  const t = file.transactions.find((x) => x.id === transactionId)
  if (!t || accountId === t.accountId || accountId === t.transferAccountId) return file
  const target = file.accounts.find((a) => a.id === accountId)
  const source = file.accounts.find((a) => a.id === t.accountId)
  if (!source || (accountId && !target)) return file

  let transactions = file.transactions
  if (t.transferAccountId) {
    // Leaving a transfer: the other side stays behind, uncategorized.
    const other = mirrorOf(file, t)
    if (other) transactions = transactions.map((x) => (x.id === other.id ? { ...x, transferAccountId: null } : x))
  }
  if (!target) return { ...file, transactions: transactions.map((x) => (x.id === t.id ? { ...x, transferAccountId: null } : x)) }

  // The other side: an unexplained row on the target for the opposite amount, else a new one.
  const other = closest(
    transactions.filter((x) => x.accountId === target.id && x.amount === -t.amount && !x.categoryId && !x.transferAccountId && !isSplit(x)),
    t.date,
    MATCH_WINDOW_DAYS,
  )
  const otherSide: Transaction = other
    ? { ...other, payee: transferPayee(source), categoryId: null, transferAccountId: source.id }
    : {
        id: crypto.randomUUID(),
        accountId: target.id,
        date: t.date,
        payee: transferPayee(source),
        categoryId: null,
        memo: '',
        amount: -t.amount,
        cleared: 'uncleared',
        transferAccountId: source.id,
      }
  transactions = transactions.map((x) =>
    x.id === t.id ? { ...x, payee: transferPayee(target), categoryId: null, splits: undefined, transferAccountId: target.id } : x.id === otherSide.id ? otherSide : x,
  )
  if (!other) transactions = [otherSide, ...transactions]
  return { ...file, transactions }
}

function mirrorOf(file: BudgetFile, t: Transaction): Transaction | undefined {
  return closest(
    file.transactions.filter((x) => x.id !== t.id && x.accountId === t.transferAccountId && x.transferAccountId === t.accountId && x.amount === -t.amount),
    t.date,
    Infinity,
  )
}

function closest(candidates: Transaction[], date: string, withinDays: number): Transaction | undefined {
  let best: Transaction | undefined
  let bestGap = withinDays
  for (const c of candidates) {
    const gap = Math.abs(Date.parse(c.date) - Date.parse(date)) / 86_400_000
    if (gap <= bestGap && (!best || gap < bestGap)) {
      best = c
      bestGap = gap
    }
  }
  return best
}
