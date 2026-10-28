import { create } from 'zustand'
import { quickSync } from '../simplefin/quickSync'
import { suggestForRun } from './suggestionStore'
import { useBudget } from './budgetStore'

/**
 * The bank sync in flight, shared by ↻ in the sidebar and the Sync page so
 * either can start one and the page shows how it went.
 */
interface SyncState {
  busy: boolean
  error: string | null
  /** The run the last sync or import recorded; the Sync page opens it. */
  lastRunId: string | null
  sync: (days?: number) => Promise<void>
  /** Point the Sync page at a run made elsewhere, e.g. an import from Settings → Accounts. */
  setLastRun: (id: string) => void
}

export const useSync = create<SyncState>((set, get) => ({
  busy: false,
  error: null,
  lastRunId: null,

  sync: async (days) => {
    if (get().busy) return
    set({ busy: true, error: null })
    try {
      const run = await quickSync(days)
      set({ busy: false, lastRunId: run.id })
      void suggestForRun(run)
    } catch (e) {
      set({ busy: false, error: (e as Error).message })
    }
  },

  setLastRun: (id) => set({ lastRunId: id, error: null }),
}))

// A run belongs to one budget; closing it or opening another forgets it.
useBudget.subscribe((state, previous) => {
  if (state.file === null || state.storage !== previous.storage) useSync.setState({ lastRunId: null, error: null })
})
