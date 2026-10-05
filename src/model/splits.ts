import type { Cents, Transaction } from './types'

/**
 * Split transactions: one bank row divided across several categories (a Venmo
 * payout that is part reimbursement, part vacation money). The lines live on
 * the transaction; they do not have to add up to its amount, and whatever they
 * leave over counts as uncategorized, so a half-finished split or a bank
 * changing the amount never loses money.
 */

export const isSplit = (t: Transaction) => !!t.splits?.length

/** The part of a split transaction its lines do not cover. Zero for an unsplit one. */
export function unassigned(t: Transaction): Cents {
  if (!isSplit(t)) return 0
  let rest = t.amount
  for (const s of t.splits!) rest -= s.amount
  return rest
}

/**
 * The transaction as the pieces the budget counts: itself when unsplit,
 * otherwise one copy per line carrying that line's category and amount, plus an
 * uncategorized one for any leftover. The amounts always add up to the transaction's.
 */
export function linesOf(t: Transaction): Transaction[] {
  if (!isSplit(t)) return [t]
  const lines = t.splits!.map((s, i) => ({ ...t, id: `${t.id}:${i}`, categoryId: s.categoryId, amount: s.amount, splits: undefined }))
  const rest = unassigned(t)
  if (rest !== 0) lines.push({ ...t, id: `${t.id}:rest`, categoryId: null, amount: rest, splits: undefined })
  return lines
}

/** Still needs a category, for the whole amount or part of a split. Transfers never do. */
export const isUncategorized = (t: Transaction) => !t.transferAccountId && linesOf(t).some((l) => !l.categoryId)
