import { useEffect, useState } from 'react'
import { Picker } from '../components/Picker'
import { formatCents } from '../model/money'
import type { AccountType } from '../model/types'
import { claimSetupToken, clearAccessUrl, fetchAccounts, getAccessUrl, type SimplefinAccount } from '../simplefin/client'
import { createLinkedAccount, mergeSimplefin, parseDecimal, type SyncStats } from '../simplefin/sync'
import { useBudget } from '../store/budgetStore'

const CREATE = 'create'
const SKIP = 'skip'

const accountTypes: { key: AccountType; label: string }[] = [
  { key: 'checking', label: 'Checking' },
  { key: 'savings', label: 'Savings' },
  { key: 'credit', label: 'Credit card' },
  { key: 'cash', label: 'Cash' },
  { key: 'investment', label: 'Investment' },
  { key: 'other', label: 'Other' },
]

interface LinkChoice {
  target: string // existing account id, CREATE, or SKIP
  type: AccountType
}

export function SyncPage() {
  const file = useBudget((s) => s.file)!
  const update = useBudget((s) => s.update)
  const [accessUrl, setAccessUrl] = useState<string | null>(null)
  const [token, setToken] = useState('')
  const [days, setDays] = useState(90)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fetched, setFetched] = useState<SimplefinAccount[] | null>(null)
  const [since, setSince] = useState<string>('')
  const [choices, setChoices] = useState<Record<string, LinkChoice>>({})
  const [stats, setStats] = useState<SyncStats | null>(null)

  useEffect(() => {
    getAccessUrl().then((u) => setAccessUrl(u ?? null))
  }, [])

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const connect = () =>
    run(async () => {
      setAccessUrl(await claimSetupToken(token))
      setToken('')
    })

  const disconnect = () =>
    run(async () => {
      await clearAccessUrl()
      setAccessUrl(null)
      setFetched(null)
    })

  const fetchNow = () =>
    run(async () => {
      const startDate = new Date(Date.now() - days * 86_400_000)
      setSince(startDate.toISOString().slice(0, 10))
      const result = await fetchAccounts(accessUrl!, { startDate, pending: true })
      if (result.errors.length) setError(result.errors.join('; '))
      setFetched(result.accounts)
      setStats(null)
      const next: Record<string, LinkChoice> = {}
      for (const a of result.accounts) {
        const linked = file.accounts.find((x) => x.simplefinId === a.id)
        next[a.id] = {
          target: linked ? linked.id : SKIP,
          type: parseDecimal(a.balance) < 0 ? 'credit' : 'checking',
        }
      }
      setChoices(next)
    })

  const importNow = () => {
    if (!fetched) return
    update((current) => {
      let accounts = current.accounts.map((a) => ({ ...a }))
      const newIds = new Set<string>()
      for (const sfin of fetched) {
        const choice = choices[sfin.id]
        if (!choice || choice.target === SKIP) continue
        if (choice.target === CREATE) {
          const created = createLinkedAccount(sfin, choice.type, true)
          accounts.push(created)
          newIds.add(created.id)
        } else {
          accounts = accounts.map((a) =>
            a.id === choice.target ? { ...a, simplefinId: sfin.id } : a.simplefinId === sfin.id ? { ...a, simplefinId: undefined } : a,
          )
        }
      }
      const linkedIds = new Set(fetched.filter((s) => choices[s.id]?.target !== SKIP).map((s) => s.id))
      const merged = mergeSimplefin({ ...current, accounts }, fetched.filter((s) => linkedIds.has(s.id)), { newAccountIds: newIds, since })
      setStats(merged.stats)
      return merged.file
    })
  }

  const unlinkedAccounts = (sfinId: string) =>
    file.accounts.filter((a) => !a.closed && (!a.simplefinId || a.simplefinId === sfinId))

  return (
    <>
      <header className="page-header">
        <h2>Bank sync</h2>
        {file.simplefinLastSync && <span className="muted">Last import {new Date(file.simplefinLastSync).toLocaleString()}</span>}
      </header>
      <div className="page-body">

      <section className="card">
        <h3>SimpleFIN connection</h3>
        {accessUrl ? (
          <p>
            Connected to <code>{new URL(accessUrl).host}</code>.{' '}
            <button className="secondary" onClick={disconnect} disabled={busy}>
              Disconnect
            </button>
          </p>
        ) : (
          <>
            <p className="muted">
              Create a connection at SimpleFIN Bridge, copy the setup token, and paste it here. The token can only be
              claimed once, and the resulting credentials stay in this browser, not in your budget file.
            </p>
            <input
              style={{ width: '100%' }}
              placeholder="Setup token (or an access URL)"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
            <p>
              <button onClick={connect} disabled={busy || !token.trim()}>
                Connect
              </button>
            </p>
          </>
        )}
      </section>

      {accessUrl && (
        <section className="card">
          <h3>Fetch transactions</h3>
          <p className="muted">
            SimpleFIN allows roughly 24 requests a day, so fetch once, review the links below, then import. Pending
            transactions are not imported until they post, but they are used to explain the bank balance when reconciling.
          </p>
          <label>
            Last{' '}
            <input type="number" min={1} max={365} value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ width: 70 }} />{' '}
            days
          </label>{' '}
          <button onClick={fetchNow} disabled={busy}>
            {busy ? 'Working…' : 'Fetch from SimpleFIN'}
          </button>
        </section>
      )}

      {fetched && (
        <section className="card">
          <h3>Accounts</h3>
          <table className="grid">
            <thead>
              <tr>
                <th>Bank account</th>
                <th className="num">Bank balance</th>
                <th className="num">Transactions</th>
                <th>Link to</th>
              </tr>
            </thead>
            <tbody>
              {fetched.map((a) => {
                const choice = choices[a.id]
                return (
                  <tr key={a.id}>
                    <td>
                      {a.name}
                      {a.org && <span className="muted"> · {a.org}</span>}
                    </td>
                    <td className="num">{formatCents(parseDecimal(a.balance))}</td>
                    <td className="num">{a.transactions.length}</td>
                    <td>
                      <Picker
                        options={[
                          { key: SKIP, label: 'Skip' },
                          { key: CREATE, label: 'Create new account' },
                          ...unlinkedAccounts(a.id).map((x) => ({
                            key: x.id,
                            label: x.simplefinId === a.id ? `${x.name} (linked)` : x.name,
                            group: 'Existing accounts',
                          })),
                        ]}
                        value={choice.target}
                        onChange={(target) => setChoices({ ...choices, [a.id]: { ...choice, target } })}
                      />
                      {choice.target === CREATE && (
                        <Picker
                          options={accountTypes}
                          value={choice.type}
                          onChange={(type) => setChoices({ ...choices, [a.id]: { ...choice, type: type as AccountType } })}
                        />
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p>
            <button onClick={importNow} disabled={busy || fetched.every((a) => choices[a.id]?.target === SKIP)}>
              Import into budget
            </button>
          </p>
          {stats && (
            <p className="pos">
              Imported: {stats.added} added{stats.categorized > 0 ? ` (${stats.categorized} categorized by payee rules)` : ''}, {stats.matched} matched to existing, {stats.updated} updated, {stats.unchanged}{' '}
              already present{stats.removed > 0 ? `, ${stats.removed} stale pending removed` : ''}.
            </p>
          )}
        </section>
      )}

      {error && <p className="neg">{error}</p>}
      </div>
    </>
  )
}
