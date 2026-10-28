import { useEffect, useState } from 'react'
import { getApiKey } from '../ai/apiKey'
import { MAX_ROWS } from '../ai/categorize'
import { needsCategory } from '../model/payeeRules'
import type { BudgetFile, Transaction } from '../model/types'
import { useSuggestions } from '../store/suggestionStore'
import { CLAUDE_MARK } from './ClaudeMark'

/**
 * The "Suggest categories" button above an account's transactions. Shown only
 * with an Anthropic key saved and rows that need a category; the suggestions
 * themselves appear on the rows (see TransactionTable).
 */
export function SuggestCategories({ file, transactions }: { file: BudgetFile; transactions: Transaction[] }) {
  const [hasKey, setHasKey] = useState(false)
  const busy = useSuggestions((s) => s.busy)
  const error = useSuggestions((s) => s.error)
  const suggest = useSuggestions((s) => s.suggest)
  useEffect(() => {
    getApiKey().then((key) => setHasKey(!!key))
  }, [])
  const pending = transactions.filter(needsCategory)
  if (!hasKey || pending.length === 0) return null
  const count = Math.min(pending.length, MAX_ROWS)
  return (
    <div className="analyze-row">
      <span className="muted">
        Sent to Anthropic: the payee, memo, amount and account type of {count === 1 ? 'the uncategorized transaction' : `the ${count} uncategorized transactions`}
        {pending.length > MAX_ROWS ? ` (the first ${MAX_ROWS})` : ''}, your category names, and about 40 of your past categorized
        transactions as examples. Nothing else, and nothing changes until you accept a suggestion. About a cent per transaction.
      </span>
      <button className="secondary" onClick={() => suggest(file, pending)} disabled={busy}>
        {CLAUDE_MARK} {busy ? 'Asking Claude…' : 'Suggest categories'}
      </button>
      {error && <span className="neg">{error}</span>}
    </div>
  )
}
