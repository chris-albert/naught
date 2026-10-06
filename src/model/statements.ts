import { currentDate } from './dates'
import type { Account, BudgetFile, Cents } from './types'

export interface Closing {
  account: Account
  /** ISO date of the next statement close. */
  closesOn: string
  /** 0 means it closes today. */
  daysLeft: number
  /** What the card owes right now: the bank's balance when synced, otherwise the book balance. */
  owed: Cents
}

/** Next date on or after `today` that falls on `day` of the month, clamped to the month's length. */
export function nextClosing(day: number, today: string): string {
  const [y, m] = today.split('-').map(Number)
  for (let offset = 0; ; offset++) {
    const last = new Date(Date.UTC(y, m + offset, 0)).getUTCDate()
    const d = new Date(Date.UTC(y, m - 1 + offset, Math.min(day, last))).toISOString().slice(0, 10)
    if (d >= today) return d
  }
}

/**
 * Open cards with a statement day that closes within `withinDays` and still carry a balance.
 * The balance on the closing day is what the issuer reports to the credit bureaus, so this is
 * the window to pay in. Soonest first.
 */
export function upcomingClosings(file: BudgetFile, today = currentDate(), withinDays = 4): Closing[] {
  return file.accounts
    .filter((a) => a.type === 'credit' && !a.closed && a.statementDay)
    .map((a) => {
      const closesOn = nextClosing(a.statementDay!, today)
      const daysLeft = Math.round((Date.parse(closesOn) - Date.parse(today)) / 86_400_000)
      const balance = a.bankBalance ?? file.transactions.filter((t) => t.accountId === a.id).reduce((s, t) => s + t.amount, 0)
      return { account: a, closesOn, daysLeft, owed: -balance }
    })
    .filter((c) => c.daysLeft <= withinDays && c.owed > 0)
    .sort((x, y) => x.daysLeft - y.daysLeft)
}
