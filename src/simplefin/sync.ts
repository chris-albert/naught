import type { Account, AccountType, BudgetFile, Cents, Transaction } from '../model/types'
import { INCOME_CATEGORY_ID } from '../model/types'
import type { SimplefinAccount, SimplefinTransaction } from './client'

/** Bank transaction ids are only unique within an account, so the key includes both. */
export const importIdFor = (accountId: string, transactionId: string) => `sfin:${accountId}:${transactionId}`
/**
 * An existing transaction within this many days of a bank transaction with the
 * same amount is treated as the same one. Card payments and transfers can take
 * a week or more to post, so the window is generous; the closest date wins.
 */
const MATCH_WINDOW_DAYS = 10

export interface SyncStats {
  added: number
  matched: number
  updated: number
  unchanged: number
  /** Stale pending rows from earlier imports that were dropped. */
  removed: number
}

export interface MergeOptions {
  /** Accounts created during this sync; they get a starting balance. */
  newAccountIds?: Set<string>
  /** Start of the fetch window (ISO date). Imported pending rows on or after it that the bank no longer sends are removed. */
  since?: string
  now?: Date
}

/** Parse a decimal string like "-12.34" into cents without float drift. */
export function parseDecimal(s: string): Cents {
  const m = /^(-?)(\d*)(?:\.(\d{0,2}))?\d*$/.exec(s.trim())
  if (!m) throw new Error(`Bad amount: ${s}`)
  const [, sign, whole, frac = ''] = m
  const cents = Number(whole || '0') * 100 + Number(frac.padEnd(2, '0'))
  return sign ? -cents : cents
}

export function epochToIsoDate(seconds: number): string {
  return new Date(seconds * 1000).toISOString().slice(0, 10)
}

function daysBetween(a: string, b: string): number {
  return Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000
}

/** Create a Naught account for a SimpleFIN account. */
export function createLinkedAccount(sfin: SimplefinAccount, type: AccountType, onBudget: boolean): Account {
  return { id: crypto.randomUUID(), name: sfin.name, type, onBudget, closed: false, simplefinId: sfin.id }
}

/**
 * Merge bank transactions into the file. Pure: returns a new file plus counts.
 *
 * Pending transactions are ignored: banks often change their id and amount when
 * they post, which produced duplicates. Only posted transactions are imported.
 *
 * For each bank transaction, in order:
 * 1. Same importId already present -> update date/amount/cleared if the bank changed them (pending -> posted).
 * 2. Otherwise the existing transaction in the same account with the same amount, no importId,
 *    and the closest date within MATCH_WINDOW_DAYS -> adopt it (set importId, mark cleared).
 * 3. Otherwise insert it as a new uncategorized transaction.
 *
 * Accounts listed in `newAccountIds` get a "Starting Balance" transaction so their
 * balance equals the bank's, since the bank only sends a window of history.
 */
export function mergeSimplefin(
  file: BudgetFile,
  accounts: SimplefinAccount[],
  { newAccountIds = new Set(), since, now = new Date() }: MergeOptions = {},
): { file: BudgetFile; stats: SyncStats } {
  const stats: SyncStats = { added: 0, matched: 0, updated: 0, unchanged: 0, removed: 0 }
  let transactions = file.transactions.map((t) => ({ ...t }))
  const byImportId = new Map<string, Transaction>()
  for (const t of transactions) if (t.importId) byImportId.set(t.importId, t)
  const seen = new Set<string>()
  const syncedAccountIds = new Set<string>()

  for (const sfin of accounts) {
    const account = file.accounts.find((a) => a.simplefinId === sfin.id)
    if (!account) continue
    syncedAccountIds.add(account.id)

    for (const bt of sfin.transactions) {
      if (bt.pending) continue
      const importId = importIdFor(sfin.id, bt.id)
      seen.add(importId)
      const date = epochToIsoDate(bt.posted || bt.transacted_at || 0)
      const amount = parseDecimal(bt.amount)
      const cleared = 'cleared'

      const existing = byImportId.get(importId)
      if (existing) {
        const changed = existing.date !== date || existing.amount !== amount || (existing.cleared === 'uncleared' && cleared === 'cleared')
        if (changed) {
          existing.date = date
          existing.amount = amount
          if (existing.cleared === 'uncleared') existing.cleared = cleared
          stats.updated++
        } else stats.unchanged++
        continue
      }

      let candidate: Transaction | undefined
      let best = MATCH_WINDOW_DAYS + 1
      for (const t of transactions) {
        if (t.accountId !== account.id || t.importId || t.amount !== amount) continue
        const gap = daysBetween(t.date, date)
        if (gap <= MATCH_WINDOW_DAYS && gap < best) {
          best = gap
          candidate = t
        }
      }
      if (candidate) {
        candidate.importId = importId
        if (candidate.cleared === 'uncleared') candidate.cleared = cleared
        byImportId.set(importId, candidate)
        stats.matched++
        continue
      }

      const added: Transaction = {
        id: crypto.randomUUID(),
        accountId: account.id,
        date,
        payee: (bt.payee ?? bt.description ?? '').trim(),
        categoryId: null,
        memo: bt.memo ?? '',
        amount,
        cleared,
        transferAccountId: null,
        importId,
      }
      transactions.push(added)
      byImportId.set(importId, added)
      stats.added++
    }

    if (newAccountIds.has(account.id)) {
      const mine = transactions.filter((t) => t.accountId === account.id)
      const bankBalance = parseDecimal(sfin.balance)
      const diff = bankBalance - mine.reduce((s, t) => s + t.amount, 0)
      if (diff !== 0) {
        const earliest = mine.reduce((d, t) => (t.date < d ? t.date : d), epochToIsoDate(sfin['balance-date'] || now.getTime() / 1000))
        transactions.push({
          id: crypto.randomUUID(),
          accountId: account.id,
          date: new Date(Date.parse(earliest) - 86_400_000).toISOString().slice(0, 10),
          payee: 'Starting Balance',
          categoryId: diff > 0 ? INCOME_CATEGORY_ID : null,
          memo: '',
          amount: diff,
          cleared: 'reconciled',
          transferAccountId: null,
        })
        stats.added++
      }
    }
  }

  // Pending rows imported by earlier versions: if the bank no longer sends them
  // (within the window we asked for) they either posted under a new id, which
  // has now been imported separately, or were dropped. Either way, remove them.
  if (since) {
    const before = transactions.length
    transactions = transactions.filter(
      (t) => !(t.cleared === 'uncleared' && t.importId && syncedAccountIds.has(t.accountId) && t.date >= since && !seen.has(t.importId)),
    )
    stats.removed = before - transactions.length
  }

  // Remember what the bank says each linked account holds, for reconciliation.
  const bySfin = new Map(accounts.map((a) => [a.id, a]))
  const updatedAccounts = file.accounts.map((a) => {
    const sfin = a.simplefinId ? bySfin.get(a.simplefinId) : undefined
    if (!sfin) return a
    return {
      ...a,
      bankBalance: parseDecimal(sfin.balance),
      bankAvailable: sfin['available-balance'] !== undefined ? parseDecimal(sfin['available-balance']) : undefined,
      bankBalanceDate: new Date((sfin['balance-date'] || now.getTime() / 1000) * 1000).toISOString(),
      bankPending: sfin.transactions.filter((t) => t.pending).reduce((sum, t) => sum + parseDecimal(t.amount), 0),
    }
  })

  transactions.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  return { file: { ...file, accounts: updatedAccounts, transactions, simplefinLastSync: now.toISOString() }, stats }
}

export type { SimplefinTransaction }
