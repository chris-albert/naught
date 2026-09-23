import { create } from 'zustand'
import { ensurePaymentCategories } from '../model/creditCards'
import { INCOME_CATEGORY_ID, type Account, type BudgetFile, type Category, type Cents, type MonthKey, type Transaction } from '../model/types'
import { writeHandle } from '../storage/fileStore'

export type SaveState = 'clean' | 'dirty' | 'saving' | 'error' | 'no-file'

interface BudgetState {
  file: BudgetFile | null
  handle: FileSystemFileHandle | null
  saveState: SaveState
  /** Sample data opened from the landing page; never saved anywhere. */
  demo: boolean
  load: (file: BudgetFile, handle: FileSystemFileHandle | null, demo?: boolean) => void
  close: () => void
  update: (fn: (file: BudgetFile) => BudgetFile) => void
  setAssigned: (month: MonthKey, categoryId: string, cents: Cents) => void
  /** Shift `cents` of assigned money from one category to another in `month`; null on either side means To budget. */
  moveAssigned: (month: MonthKey, fromId: string | null, toId: string | null, cents: Cents) => void
  updateTransaction: (transactionId: string, patch: Partial<Transaction>) => void
  deleteTransaction: (transactionId: string) => void
  updateCategory: (categoryId: string, patch: Partial<Category>) => void
  addAccount: (account: Omit<Account, 'id'>) => void
  updateAccount: (accountId: string, patch: Partial<Account>) => void
  /** Removes the account and every transaction in it. */
  deleteAccount: (accountId: string) => void
  /** Swap the account with its neighbour among accounts in the same open/closed state. */
  moveAccount: (accountId: string, direction: -1 | 1) => void
  /** Lock every cleared transaction in the account; book `adjustment` (if non-zero) so the account matches the bank. */
  reconcileAccount: (accountId: string, adjustment: Cents, date: string) => void
}

export const useBudget = create<BudgetState>((set, get) => ({
  file: null,
  handle: null,
  saveState: 'no-file',
  demo: false,

  load: (file, handle, demo = false) => {
    const ensured = ensurePaymentCategories(file)
    set({ file: ensured, handle, demo, saveState: handle ? (ensured === file ? 'clean' : 'dirty') : 'no-file' })
    if (ensured !== file) scheduleSave()
  },

  close: () => set({ file: null, handle: null, demo: false, saveState: 'no-file' }),

  update: (fn) => {
    const { file, handle } = get()
    if (!file) return
    set({ file: ensurePaymentCategories(fn(file)), saveState: handle ? 'dirty' : 'no-file' })
    scheduleSave()
  },

  setAssigned: (month, categoryId, cents) =>
    get().update((file) => ({
      ...file,
      assigned: { ...file.assigned, [month]: { ...(file.assigned[month] ?? {}), [categoryId]: cents } },
    })),

  moveAssigned: (month, fromId, toId, cents) =>
    get().update((file) => {
      const assigned = { ...(file.assigned[month] ?? {}) }
      if (fromId) assigned[fromId] = (assigned[fromId] ?? 0) - cents
      if (toId) assigned[toId] = (assigned[toId] ?? 0) + cents
      return { ...file, assigned: { ...file.assigned, [month]: assigned } }
    }),

  updateTransaction: (transactionId, patch) =>
    get().update((file) => ({
      ...file,
      transactions: file.transactions.map((t) => (t.id === transactionId ? { ...t, ...patch } : t)),
    })),

  deleteTransaction: (transactionId) =>
    get().update((file) => ({ ...file, transactions: file.transactions.filter((t) => t.id !== transactionId) })),

  updateCategory: (categoryId, patch) =>
    get().update((file) => ({
      ...file,
      categories: file.categories.map((c) => (c.id === categoryId ? { ...c, ...patch } : c)),
    })),

  addAccount: (account) =>
    get().update((file) => ({ ...file, accounts: [...file.accounts, { ...account, id: crypto.randomUUID() }] })),

  updateAccount: (accountId, patch) =>
    get().update((file) => ({
      ...file,
      accounts: file.accounts.map((a) => (a.id === accountId ? { ...a, ...patch } : a)),
    })),

  moveAccount: (accountId, direction) =>
    get().update((file) => {
      const accounts = [...file.accounts]
      const i = accounts.findIndex((a) => a.id === accountId)
      if (i < 0) return file
      // find the nearest neighbour in the same section (open vs closed)
      let j = i + direction
      while (j >= 0 && j < accounts.length && accounts[j].closed !== accounts[i].closed) j += direction
      if (j < 0 || j >= accounts.length) return file
      ;[accounts[i], accounts[j]] = [accounts[j], accounts[i]]
      return { ...file, accounts }
    }),

  reconcileAccount: (accountId, adjustment, date) =>
    get().update((file) => {
      const transactions = file.transactions.map((t) =>
        t.accountId === accountId && t.cleared === 'cleared' ? { ...t, cleared: 'reconciled' as const } : t,
      )
      if (adjustment !== 0) {
        transactions.unshift({
          id: crypto.randomUUID(),
          accountId,
          date,
          payee: 'Reconciliation Balance Adjustment',
          categoryId: INCOME_CATEGORY_ID,
          memo: 'Entered to match the bank balance',
          amount: adjustment,
          cleared: 'reconciled',
          transferAccountId: null,
        })
      }
      return { ...file, transactions }
    }),

  deleteAccount: (accountId) =>
    get().update((file) => ({
      ...file,
      accounts: file.accounts.filter((a) => a.id !== accountId),
      transactions: file.transactions
        .filter((t) => t.accountId !== accountId)
        .map((t) => (t.transferAccountId === accountId ? { ...t, transferAccountId: null } : t)),
    })),
}))

let saveTimer: ReturnType<typeof setTimeout> | undefined

function scheduleSave() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(saveNow, 800)
}

export async function saveNow(): Promise<void> {
  const { file, handle } = useBudget.getState()
  if (!file || !handle) return
  useBudget.setState({ saveState: 'saving' })
  try {
    await writeHandle(handle, file)
    // Only mark clean if nothing changed while we were writing.
    if (useBudget.getState().file === file) useBudget.setState({ saveState: 'clean' })
  } catch (e) {
    console.error('save failed', e)
    useBudget.setState({ saveState: 'error' })
  }
}
