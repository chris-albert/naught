import type { Account, AccountType, BudgetFile, Cents, Transaction } from '../model/types'
import { INCOME_CATEGORY_ID } from '../model/types'
import { categoryForPayee } from '../model/payeeRules'
import { isSplit } from '../model/splits'
import type { SimplefinAccount, SimplefinTransaction } from './client'

/** Bank transaction ids are only unique within an account, so the key includes both. */
export const importIdFor = (accountId: string, transactionId: string) => `sfin:${accountId}:${transactionId}`
/**
 * An existing transaction within this many days of a bank transaction with the
 * same amount is treated as the same one. Card payments and transfers can take
 * a week or more to post, so the window is generous; the closest date wins.
 */
const MATCH_WINDOW_DAYS = 10
/**
 * A pending charge may post for a different amount (a tip added, a hold
 * settled). Within this fraction of the pending amount it can still be the same
 * charge.
 */
const REPOST_TOLERANCE = 0.3

export interface SyncStats {
  added: number
  matched: number
  updated: number
  unchanged: number
  /** Stale pending rows from earlier imports that were dropped. */
  removed: number
  /** Of `added`, how many a payee rule categorized. */
  categorized: number
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

/** Banks reformat descriptions between pending and posted; compare letters only, and accept one being a prefix of the other. */
function samePayee(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false
  const norm = (s: string) => s.toUpperCase().replace(/[^A-Z]/g, '')
  const x = norm(a)
  const y = norm(b)
  if (x.length < 4 || y.length < 4) return false
  return x.startsWith(y) || y.startsWith(x)
}

/** Create a Naught account for a SimpleFIN account. */
export function createLinkedAccount(sfin: SimplefinAccount, type: AccountType, onBudget: boolean): Account {
  return { id: crypto.randomUUID(), name: sfin.name, type, onBudget, closed: false, simplefinId: sfin.id }
}

/**
 * Merge bank transactions into the file. Pure: returns a new file plus counts.
 *
 * Pending transactions are imported as uncleared so they can be categorized
 * early. Banks often change their id (and sometimes the amount) when they post,
 * so posted transactions are handled first and may adopt a pending row the bank
 * no longer sends. A pending row that is still unexplained afterwards is paired
 * with an uncategorized posted row of about the same amount (see `since`), so
 * the category survives a tip or a settled hold; if nothing pairs, it is removed.
 *
 * For each bank transaction, posted before pending:
 * 1. Same importId already present -> update date/amount/cleared if the bank changed them (pending -> posted).
 * 2. Otherwise the existing transaction in the same account with the same amount and the closest date
 *    within MATCH_WINDOW_DAYS, either entered by hand (no importId) or an imported pending row the bank
 *    stopped sending -> adopt it (set importId, mark cleared if posted).
 * 3. Otherwise insert it as a new transaction, categorized by payee rule if one matches.
 *
 * Accounts listed in `newAccountIds` get a "Starting Balance" transaction so their
 * balance equals the bank's, since the bank only sends a window of history.
 */
export function mergeSimplefin(
  file: BudgetFile,
  accounts: SimplefinAccount[],
  { newAccountIds = new Set(), since, now = new Date() }: MergeOptions = {},
): { file: BudgetFile; stats: SyncStats } {
  const stats: SyncStats = { added: 0, matched: 0, updated: 0, unchanged: 0, removed: 0, categorized: 0 }
  let transactions = file.transactions.map((t) => ({ ...t }))
  const byImportId = new Map<string, Transaction>()
  for (const t of transactions) if (t.importId) byImportId.set(t.importId, t)
  const seen = new Set<string>()
  const addedIds = new Set<string>()
  const syncedAccountIds = new Set<string>()

  for (const sfin of accounts) {
    const account = file.accounts.find((a) => a.simplefinId === sfin.id)
    if (!account) continue
    syncedAccountIds.add(account.id)

    const ordered = [...sfin.transactions].sort((a, b) => Number(!!a.pending) - Number(!!b.pending))
    for (const bt of ordered) {
      const importId = importIdFor(sfin.id, bt.id)
      seen.add(importId)
      const date = epochToIsoDate(bt.posted || bt.transacted_at || 0)
      const amount = parseDecimal(bt.amount)
      const cleared = bt.pending ? 'uncleared' : 'cleared'

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
        if (t.accountId !== account.id || t.amount !== amount) continue
        if (t.importId && !(t.cleared === 'uncleared' && !seen.has(t.importId))) continue
        const gap = daysBetween(t.date, date)
        if (gap <= MATCH_WINDOW_DAYS && gap < best) {
          best = gap
          candidate = t
        }
      }
      const payee = (bt.payee ?? bt.description ?? '').trim()
      if (candidate) {
        if (candidate.importId) {
          // A pending row re-sent under a new id: take the bank's date, as step 1 would.
          byImportId.delete(candidate.importId)
          candidate.date = date
        }
        candidate.importId = importId
        candidate.importPayee = payee
        if (candidate.cleared === 'uncleared') candidate.cleared = cleared
        byImportId.set(importId, candidate)
        stats.matched++
        continue
      }

      const categoryId = categoryForPayee(file, payee)
      const added: Transaction = {
        id: crypto.randomUUID(),
        accountId: account.id,
        date,
        payee,
        categoryId,
        memo: bt.memo ?? '',
        amount,
        cleared,
        transferAccountId: null,
        importId,
        importPayee: payee,
      }
      transactions.push(added)
      byImportId.set(importId, added)
      addedIds.add(added.id)
      stats.added++
      if (categoryId) stats.categorized++
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

  // Imported pending rows the bank no longer sends (within the window we asked
  // for) either posted under a new id or were dropped by the bank. A posted
  // version with the same amount was adopted above; one with a changed amount
  // is a fresh, uncategorized row, so pair each vanished pending row with the
  // best such row and let it carry the category over. Whatever is left is removed.
  if (since) {
    const inWindow = (t: Transaction) => !!t.importId && syncedAccountIds.has(t.accountId) && t.date >= since
    const vanished = transactions.filter((t) => t.cleared === 'uncleared' && inWindow(t) && !seen.has(t.importId!))
    const posted = transactions.filter((t) => t.cleared === 'cleared' && inWindow(t) && seen.has(t.importId!) && !t.categoryId && !t.transferAccountId && !isSplit(t))
    const pairs: { pending: Transaction; posted: Transaction; payee: boolean; drift: number; gap: number }[] = []
    for (const pending of vanished) {
      for (const p of posted) {
        if (p.accountId !== pending.accountId || Math.sign(p.amount) !== Math.sign(pending.amount)) continue
        const drift = Math.abs(p.amount - pending.amount) / Math.abs(pending.amount)
        const gap = daysBetween(p.date, pending.date)
        if (drift > REPOST_TOLERANCE || gap > MATCH_WINDOW_DAYS) continue
        pairs.push({ pending, posted: p, payee: samePayee(pending.importPayee, p.importPayee), drift, gap })
      }
    }
    pairs.sort((a, b) => Number(b.payee) - Number(a.payee) || a.drift - b.drift || a.gap - b.gap)
    const taken = new Set<string>()
    const dropped = new Set<string>()
    for (const { pending, posted: p } of pairs) {
      if (taken.has(pending.id) || taken.has(p.id)) continue
      taken.add(pending.id)
      taken.add(p.id)
      pending.importId = p.importId
      pending.importPayee = p.importPayee
      pending.amount = p.amount
      pending.date = p.date
      pending.cleared = p.cleared
      dropped.add(p.id)
      stats.matched++
      if (addedIds.has(p.id)) stats.added--
    }
    for (const t of vanished) if (!taken.has(t.id)) dropped.add(t.id)
    transactions = transactions.filter((t) => !dropped.has(t.id))
    stats.removed = vanished.filter((t) => !taken.has(t.id)).length
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
