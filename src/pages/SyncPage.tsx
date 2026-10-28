import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { SuggestCategories } from '../components/SuggestCategories'
import { TransactionTable } from '../components/TransactionTable'
import { formatCents } from '../model/money'
import type { BudgetFile, SyncChange, SyncRun, Transaction } from '../model/types'
import { getAccessUrl } from '../simplefin/client'
import { useBudget } from '../store/budgetStore'
import { useSuggestions } from '../store/suggestionStore'
import { useSync } from '../store/syncStore'

/** Sync: pull from the bank, then see and categorize what each run brought in. */
export function SyncPage() {
  const file = useBudget((s) => s.file)!
  const busy = useSync((s) => s.busy)
  const error = useSync((s) => s.error)
  const lastRunId = useSync((s) => s.lastRunId)
  const sync = useSync((s) => s.sync)
  const suggesting = useSuggestions((s) => s.busy)
  const [connected, setConnected] = useState<boolean | null>(null)
  const [days, setDays] = useState(30)
  /** The run shown open: the one just made, else the latest; `null` once closed by hand. */
  const [openRun, setOpenRun] = useState<string | null | undefined>(undefined)
  const linked = file.accounts.filter((a) => a.simplefinId && !a.closed)
  const runs = [...(file.syncRuns ?? [])].reverse()
  const open = openRun === undefined ? runs[0]?.id : openRun

  useEffect(() => {
    getAccessUrl().then((u) => setConnected(!!u))
  }, [])
  useEffect(() => {
    if (lastRunId) setOpenRun(lastRunId)
  }, [lastRunId])

  const ready = connected && linked.length > 0

  return (
    <>
      <header className="page-header">
        <h2>Sync</h2>
        {file.simplefinLastSync && <span className="muted">Last sync {new Date(file.simplefinLastSync).toLocaleString()}</span>}
        <label className="muted">
          Last{' '}
          <input type="number" min={1} max={365} value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ width: 70 }} />{' '}
          days
        </label>
        <button onClick={() => sync(days)} disabled={!ready || busy}>
          {busy ? 'Syncing…' : 'Sync now'}
        </button>
      </header>
      <div className="page-body">
        {connected === false && (
          <section className="card">
            <p className="muted">
              Bank sync is not set up yet. Connect SimpleFIN under <Link to="/app/settings/accounts">Settings → Accounts</Link>.
            </p>
          </section>
        )}
        {connected && linked.length === 0 && (
          <section className="card">
            <p className="muted">
              No accounts are linked yet. Link bank accounts to budget accounts under{' '}
              <Link to="/app/settings/accounts">Settings → Accounts</Link>.
            </p>
          </section>
        )}
        {ready && (
          <p className="muted">
            Sync pulls recent transactions for {linked.length === 1 ? 'the linked account' : `the ${linked.length} linked accounts`} and
            imports what is new. Each run below lists what it added, matched and updated; payee and category are editable
            right here.
          </p>
        )}
        {busy && <p className="muted">Pulling transactions from the bank…</p>}
        {!busy && suggesting && <p className="muted">Asking Claude for categories…</p>}
        {error && <p className="neg">{error}</p>}

        {runs.length > 0 && (
          <section className="card">
            <h3>Syncs</h3>
            <ul className="sync-runs">
              {runs.map((r) => (
                <li key={r.id} className={open === r.id ? 'open' : ''}>
                  <button className="link sync-run-head" onClick={() => setOpenRun(open === r.id ? null : r.id)}>
                    <span className="chevron">▾</span>
                    <span>{new Date(r.at).toLocaleString()}</span>
                    <span className="muted">{describeRun(r)}</span>
                  </button>
                  {open === r.id && <RunTransactions file={file} run={r} />}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  )
}

/** "3 added · 1 auto-categorized · 2 matched · 40 unchanged", leaving out what did not happen. */
function describeRun(r: SyncRun): string {
  return [
    `${r.added.length} added`,
    r.categorized.length > 0 && `${r.categorized.length} auto-categorized`,
    r.aiCategorized?.length && `${r.aiCategorized.length} by Claude`,
    r.matched.length > 0 && `${r.matched.length} matched`,
    r.updated.length > 0 && `${r.updated.length} updated`,
    `${r.unchanged} unchanged`,
    r.removed > 0 && `${r.removed} removed`,
  ]
    .filter(Boolean)
    .join(' · ')
}

/** "Cleared · amount was −$12.00 · date was 2026-09-10": what the bank changed on an updated row. */
function describeChange(c: SyncChange): string {
  return [c.cleared && 'Cleared', c.amount !== undefined && `amount was ${formatCents(c.amount)}`, c.date && `date was ${c.date}`]
    .filter(Boolean)
    .join(' · ')
}

/** The transactions a sync added, matched or updated, as they are now, in the editable table. */
function RunTransactions({ file, run }: { file: BudgetFile; run: SyncRun }) {
  const byId = new Map(file.transactions.map((t) => [t.id, t]))
  const byDate = (a: Transaction, b: Transaction) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)
  const rows = (ids: string[]) => ids.map((id) => byId.get(id)).filter((t): t is Transaction => !!t).sort(byDate)
  const sections = [
    { title: 'Added', rows: rows(run.added) },
    { title: 'Matched', rows: rows(run.matched) },
    { title: 'Updated', rows: rows(run.updated) },
  ]
  const all = sections.flatMap((s) => s.rows)
  const missing = run.added.length + run.matched.length + run.updated.length - all.length
  const notes = new Map(Object.entries(run.changes ?? {}).map(([id, change]) => [id, describeChange(change)]))

  return (
    <>
      {all.length === 0 ? (
        <p className="muted">Nothing changed.</p>
      ) : (
        <>
          <SuggestCategories file={file} transactions={sections[0].rows} />
          <TransactionTable file={file} transactions={all} showAccount sections={sections} notes={notes} />
        </>
      )}
      {missing > 0 && (
        <p className="muted small">
          {missing} of these {missing === 1 ? 'has' : 'have'} since been deleted.
        </p>
      )}
    </>
  )
}
