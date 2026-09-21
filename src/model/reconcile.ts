import type { Account, BudgetFile, Cents, Transaction } from './types'

/** Manual entries older than this many days that the bank never matched are suspect. */
const UNCONFIRMED_AFTER_DAYS = 10
/** ...but only within the window a sync would have covered. */
const UNCONFIRMED_WITHIN_DAYS = 90

export interface Reconciliation {
  account: Account
  bankBalance: Cents
  bankBalanceDate: string
  /** Sum of cleared and reconciled transactions: what the bank should be showing. */
  clearedBalance: Cents
  /** Transactions the bank listed as pending, not yet imported. */
  pending: Cents
  /** Which bank figure tied out: the reported balance, that balance less listed pending, or the bank's available balance. Null when nothing ties. */
  matchedBy: 'balance' | 'balance-less-pending' | 'available' | 'available-less-pending' | null
  /** Bank figure minus clearedBalance. Zero means the account reconciles. */
  difference: Cents
  uncleared: Transaction[]
  /** Manual transactions the bank never confirmed. */
  unconfirmed: Transaction[]
  /** Cleared transactions that would be locked by reconciling. */
  toLock: number
}

export function reconcile(file: BudgetFile, accountId: string, now: Date = new Date()): Reconciliation | null {
  const account = file.accounts.find((a) => a.id === accountId)
  if (!account || account.bankBalance === undefined || !account.bankBalanceDate) return null

  const mine = file.transactions.filter((t) => t.accountId === accountId)
  let clearedBalance = 0
  let toLock = 0
  const uncleared: Transaction[] = []
  for (const t of mine) {
    if (t.cleared === 'uncleared') uncleared.push(t)
    else {
      clearedBalance += t.amount
      if (t.cleared === 'cleared') toLock++
    }
  }

  const today = now.getTime()
  const day = 86_400_000
  const unconfirmed = mine.filter((t) => {
    if (t.importId || t.cleared === 'reconciled') return false
    const age = (today - Date.parse(t.date)) / day
    return age > UNCONFIRMED_AFTER_DAYS && age <= UNCONFIRMED_WITHIN_DAYS
  })

  const pending = account.bankPending ?? 0
  // Banks disagree on whether "balance" includes pending activity, and some
  // include it without listing the pending transactions. Try each figure the
  // bank gave us and accept whichever ties out to the cent.
  const candidates: [Reconciliation['matchedBy'], Cents | undefined][] = [
    ['balance', account.bankBalance],
    ['balance-less-pending', account.bankBalance - pending],
    ['available', account.bankAvailable],
    ['available-less-pending', account.bankAvailable === undefined ? undefined : account.bankAvailable - pending],
  ]
  const hit = candidates.find(([, v]) => v !== undefined && v - clearedBalance === 0)
  return {
    account,
    bankBalance: account.bankBalance,
    bankBalanceDate: account.bankBalanceDate,
    clearedBalance,
    pending,
    matchedBy: hit ? hit[0] : null,
    difference: hit ? 0 : account.bankBalance - clearedBalance,
    uncleared,
    unconfirmed,
    toLock,
  }
}
