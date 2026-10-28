import { create } from 'zustand'
import { getApiKey } from '../ai/apiKey'
import { suggestCategories, type CategorySuggestion } from '../ai/categorize'
import { needsCategory } from '../model/payeeRules'
import type { BudgetFile, SyncRun, Transaction } from '../model/types'
import { useBudget } from './budgetStore'

/**
 * Claude's category suggestions, by transaction id. They live in memory only:
 * the budget file changes when a suggestion is accepted (see
 * budgetStore.acceptSuggestions), never before. Reloading the page drops them.
 */

interface SuggestionState {
  suggestions: Map<string, CategorySuggestion>
  busy: boolean
  error: string | null
  /** Ask Claude about the uncategorized rows among `transactions`; needs a key under Settings → AI. */
  suggest: (file: BudgetFile, transactions: Transaction[]) => Promise<void>
  dismiss: (transactionIds: string[]) => void
  clear: () => void
}

export const useSuggestions = create<SuggestionState>((set, get) => ({
  suggestions: new Map(),
  busy: false,
  error: null,

  suggest: async (file, transactions) => {
    if (get().busy) return
    const apiKey = await getApiKey()
    if (!apiKey) {
      set({ error: 'Add an Anthropic API key under Settings → AI first.' })
      return
    }
    set({ busy: true, error: null })
    try {
      const found = await suggestCategories({ apiKey, file, transactions })
      set((s) => {
        const suggestions = new Map(s.suggestions)
        for (const f of found) suggestions.set(f.transactionId, f)
        return { suggestions, busy: false }
      })
    } catch (e) {
      set({ busy: false, error: (e as Error).message })
    }
  },

  dismiss: (transactionIds) =>
    set((s) => {
      const suggestions = new Map(s.suggestions)
      for (const id of transactionIds) suggestions.delete(id)
      return { suggestions }
    }),

  clear: () => set({ suggestions: new Map(), error: null }),
}))

/** After a bank sync: ask about the rows it added that still need a category, when a key is saved. Quiet otherwise. */
export async function suggestForRun(run: SyncRun): Promise<void> {
  const file = useBudget.getState().file
  if (!file) return
  const added = new Set(run.added)
  const rows = file.transactions.filter((t) => added.has(t.id) && needsCategory(t))
  if (rows.length === 0 || !(await getApiKey())) return
  await useSuggestions.getState().suggest(file, rows)
}

// Suggestions are about one budget; closing it or opening another drops them.
useBudget.subscribe((state, previous) => {
  if (state.file === null || state.storage !== previous.storage) useSuggestions.getState().clear()
})
