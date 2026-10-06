import { create } from 'zustand'
import { ensurePaymentCategories } from '../model/creditCards'
import { deletePayeeRule, setPayeeRule } from '../model/payeeRules'
import { setTransfer } from '../model/transfers'
import { INCOME_CATEGORY_ID, type Account, type BudgetFile, type Category, type CategoryGroup, type Cents, type MonthKey, type Transaction } from '../model/types'
import { confirm } from '../components/ConfirmDialog'
import { ConflictError, type BudgetStorage } from '../storage/storage'

export type SaveState = 'clean' | 'dirty' | 'saving' | 'error' | 'no-file'

interface BudgetState {
  file: BudgetFile | null
  storage: BudgetStorage | null
  saveState: SaveState
  /** Sample data opened from the landing page; never saved anywhere. */
  demo: boolean
  load: (file: BudgetFile, storage: BudgetStorage | null, demo?: boolean) => void
  close: () => void
  update: (fn: (file: BudgetFile) => BudgetFile) => void
  setAssigned: (month: MonthKey, categoryId: string, cents: Cents) => void
  /** Shift `cents` of assigned money from one category to another in `month`; null on either side means To budget. */
  moveAssigned: (month: MonthKey, fromId: string | null, toId: string | null, cents: Cents) => void
  /** Returns the new transaction's id. */
  addTransaction: (transaction: Omit<Transaction, 'id'>) => string
  updateTransaction: (transactionId: string, patch: Partial<Transaction>) => void
  /** Make the transaction a transfer to `accountId` (linking or creating its other side), or a plain transaction again with null. */
  setTransfer: (transactionId: string, accountId: string | null) => void
  deleteTransaction: (transactionId: string) => void
  addCategoryGroup: (name: string) => void
  updateCategoryGroup: (groupId: string, patch: Partial<CategoryGroup>) => void
  /** New category at the end of `groupId`. */
  addCategory: (groupId: string, name: string) => void
  updateCategory: (categoryId: string, patch: Partial<Category>) => void
  /** Always give `payee` this category; also fills it in on existing uncategorized transactions. */
  setPayeeRule: (payee: string, categoryId: string) => void
  deletePayeeRule: (payee: string) => void
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
  storage: null,
  saveState: 'no-file',
  demo: false,

  load: (file, storage, demo = false) => {
    const ensured = ensurePaymentCategories(file)
    set({ file: ensured, storage, demo, saveState: storage ? (ensured === file ? 'clean' : 'dirty') : 'no-file' })
    if (ensured !== file) scheduleSave()
  },

  close: () => set({ file: null, storage: null, demo: false, saveState: 'no-file' }),

  update: (fn) => {
    const { file, storage } = get()
    if (!file) return
    set({ file: ensurePaymentCategories(fn(file)), saveState: storage ? 'dirty' : 'no-file' })
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

  addTransaction: (transaction) => {
    const id = crypto.randomUUID()
    get().update((file) => ({ ...file, transactions: [{ ...transaction, id }, ...file.transactions] }))
    return id
  },

  updateTransaction: (transactionId, patch) =>
    get().update((file) => ({
      ...file,
      transactions: file.transactions.map((t) => (t.id === transactionId ? { ...t, ...patch } : t)),
    })),

  setTransfer: (transactionId, accountId) => get().update((file) => setTransfer(file, transactionId, accountId)),

  deleteTransaction: (transactionId) =>
    get().update((file) => {
      const importId = file.transactions.find((t) => t.id === transactionId)?.importId
      return {
        ...file,
        transactions: file.transactions.filter((t) => t.id !== transactionId),
        ...(importId && !file.ignoredImportIds?.includes(importId)
          ? { ignoredImportIds: [...(file.ignoredImportIds ?? []), importId] }
          : {}),
      }
    }),

  addCategoryGroup: (name) =>
    get().update((file) => ({ ...file, categoryGroups: [...file.categoryGroups, { id: crypto.randomUUID(), name, hidden: false }] })),

  updateCategoryGroup: (groupId, patch) =>
    get().update((file) => ({
      ...file,
      categoryGroups: file.categoryGroups.map((g) => (g.id === groupId ? { ...g, ...patch } : g)),
    })),

  addCategory: (groupId, name) =>
    get().update((file) => ({ ...file, categories: [...file.categories, { id: crypto.randomUUID(), groupId, name, hidden: false }] })),

  updateCategory: (categoryId, patch) =>
    get().update((file) => ({
      ...file,
      categories: file.categories.map((c) => (c.id === categoryId ? { ...c, ...patch } : c)),
    })),

  setPayeeRule: (payee, categoryId) => get().update((file) => setPayeeRule(file, payee, categoryId)),

  deletePayeeRule: (payee) => get().update((file) => deletePayeeRule(file, payee)),

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

export const saveNow = () => save()

let writing = false
let resolving = false

async function save(overwrite = false): Promise<void> {
  const { file, storage } = useBudget.getState()
  if (!file || !storage || resolving) return
  // One write at a time, so a write never sees its predecessor as someone else's change.
  if (writing) return scheduleSave()
  writing = true
  useBudget.setState({ saveState: 'saving' })
  try {
    await storage.write(file, overwrite)
    // Only mark clean if nothing changed while we were writing.
    if (useBudget.getState().file === file) useBudget.setState({ saveState: 'clean' })
  } catch (e) {
    if (e instanceof ConflictError) {
      writing = false
      return resolveConflict(storage)
    }
    console.error('save failed', e)
    useBudget.setState({ saveState: 'error' })
  } finally {
    writing = false
  }
}

/** Unsaved changes here and a newer copy in storage: the user picks which one survives. */
async function resolveConflict(storage: BudgetStorage, theirs?: BudgetFile | null): Promise<void> {
  useBudget.setState({ saveState: 'error' })
  resolving = true
  const overwrite = await confirm({
    title: 'This budget was changed on another device',
    message: 'Your latest changes here are not saved yet. Load the other version and redo them, or overwrite it with the version on this device.',
    confirmLabel: 'Overwrite',
    cancelLabel: 'Load the other version',
    danger: true,
  })
  resolving = false
  if (useBudget.getState().storage !== storage) return
  if (overwrite) return save(true)
  try {
    theirs ??= await storage.readIfChanged?.()
    if (theirs) useBudget.getState().load(theirs, storage)
  } catch (e) {
    console.error('reload failed', e)
  }
}

/** Pick up changes saved from another device. Does nothing for storage that cannot tell. */
export async function reloadIfChanged(): Promise<void> {
  const { storage, saveState } = useBudget.getState()
  if (!storage?.readIfChanged || saveState !== 'clean') return
  try {
    const theirs = await storage.readIfChanged()
    const now = useBudget.getState()
    if (!theirs || now.storage !== storage) return
    if (now.saveState === 'clean') now.load(theirs, storage)
    else await resolveConflict(storage, theirs)
  } catch (e) {
    console.warn('could not check for changes', e)
  }
}
