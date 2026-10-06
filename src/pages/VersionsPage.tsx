import { useEffect, useState } from 'react'
import { confirm } from '../components/ConfirmDialog'
import type { BudgetFile } from '../model/types'
import type { BudgetVersion } from '../storage/storage'
import { useBudget } from '../store/budgetStore'

/** Earlier saved copies of the budget (Google Drive revisions), with a restore button. */
export function VersionsPage() {
  const file = useBudget((s) => s.file)!
  const storage = useBudget((s) => s.storage)
  const update = useBudget((s) => s.update)
  const versions = storage?.versions
  const [list, setList] = useState<BudgetVersion[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<{ version: BudgetVersion; data: BudgetFile } | null>(null)
  const [loading, setLoading] = useState<string | null>(null)

  useEffect(() => {
    if (!versions) return
    let cancelled = false
    versions
      .list()
      .then((v) => !cancelled && setList(v))
      .catch((e: Error) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
    }
  }, [versions])

  if (!versions) {
    return (
      <>
        <header className="page-header">
          <h2>Version history</h2>
        </header>
        <div className="page-body">
          <p className="muted">Only budgets kept in Google Drive have a version history here. For a file in a synced folder, use your sync provider’s own version history.</p>
        </div>
      </>
    )
  }

  const show = async (version: BudgetVersion) => {
    setLoading(version.id)
    setError(null)
    try {
      setSelected({ version, data: await versions.read(version.id) })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(null)
    }
  }

  const restore = async () => {
    if (!selected) return
    const ok = await confirm({
      title: `Restore the version from ${when(selected.version.savedAt)}?`,
      message: 'The budget goes back to how it was then. Anything done since is undone, but you can undo the restore itself if you change your mind.',
      confirmLabel: 'Restore',
      danger: true,
    })
    if (!ok) return
    const data = selected.data
    update(() => data, 'restore version')
    setSelected(null)
  }

  return (
    <>
      <header className="page-header">
        <h2>Version history</h2>
        <span className="muted">Every save in Google Drive for the last 30 days, plus the first save of each day for the last two months.</span>
      </header>
      <div className="page-body">
        {error && <p className="neg">{error}</p>}
        {selected && (
          <section className="card">
            <h3>
              {when(selected.version.savedAt)}
              <button className="link" onClick={() => setSelected(null)}>
                close
              </button>
            </h3>
            <Summary then={selected.data} now={file} />
            <button onClick={restore}>Restore this version</button>
          </section>
        )}
        {list === null ? (
          <p className="muted">Loading…</p>
        ) : list.length === 0 ? (
          <p className="muted">No earlier versions yet.</p>
        ) : (
          <table className="grid">
            <thead>
              <tr>
                <th>Saved</th>
                <th className="num">Size</th>
                <th></th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.map((v, i) => (
                <tr key={v.id} className={selected?.version.id === v.id ? 'selected' : undefined}>
                  <td>
                    {when(v.savedAt)}
                    {i === 0 && <span className="muted"> (current)</span>}
                  </td>
                  <td className="num">{formatSize(v.size)}</td>
                  <td className="muted">{v.kept && 'kept'}</td>
                  <td className="actions">
                    {i > 0 && (
                      <button className="link" disabled={loading === v.id} onClick={() => show(v)}>
                        {loading === v.id ? 'Loading…' : 'Show'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}

/** What the version holds, and how the current budget differs in size. */
function Summary({ then, now }: { then: BudgetFile; now: BudgetFile }) {
  const rows: [string, number, number][] = [
    ['Accounts', then.accounts.length, now.accounts.length],
    ['Categories', then.categories.length, now.categories.length],
    ['Transactions', then.transactions.length, now.transactions.length],
    ['Months with assignments', Object.keys(then.assigned).length, Object.keys(now.assigned).length],
  ]
  const latest = then.transactions.map((t) => t.date).sort().pop()
  return (
    <table className="grid">
      <tbody>
        {rows.map(([label, a, b]) => (
          <tr key={label}>
            <td>{label}</td>
            <td className="num">{a}</td>
            <td className="muted">{a === b ? 'same as now' : `now ${b}`}</td>
          </tr>
        ))}
        <tr>
          <td>Latest transaction</td>
          <td className="num">{latest ?? '—'}</td>
          <td></td>
        </tr>
      </tbody>
    </table>
  )
}

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

function formatSize(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`
  if (bytes >= 1000) return `${Math.round(bytes / 1000)} KB`
  return `${bytes} B`
}
