import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatCents } from '../model/money'
import type { AccountType, SyncRun } from '../model/types'
import {
  BRIDGE_URL,
  claimSetupToken,
  clearAccessUrl,
  fetchAccounts,
  getAccessUrl,
  parseSetupInput,
  type SimplefinAccount,
} from '../simplefin/client'
import { createLinkedAccount, mergeSimplefin, parseDecimal, type SyncStats } from '../simplefin/sync'
import { useBudget } from '../store/budgetStore'
import { suggestForRun } from '../store/suggestionStore'
import { useSync } from '../store/syncStore'
import { Picker } from './Picker'

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

/** Settings → Accounts: the SimpleFIN connection and which bank account feeds which budget account. */
export function SimplefinSettings() {
  const file = useBudget((s) => s.file)!
  const update = useBudget((s) => s.update)
  const setLastRun = useSync((s) => s.setLastRun)
  const [accessUrl, setAccessUrl] = useState<string | null>(null)
  const [token, setToken] = useState('')
  const [days, setDays] = useState(90)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fetched, setFetched] = useState<SimplefinAccount[] | null>(null)
  const [since, setSince] = useState<string>('')
  const [choices, setChoices] = useState<Record<string, LinkChoice>>({})
  const [stats, setStats] = useState<SyncStats | null>(null)
  const parsed = parseSetupInput(token)

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
    let imported: SyncRun | undefined
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
      imported = merged.run
      return merged.file
    }, 'bank import')
    if (imported) {
      setLastRun(imported.id)
      void suggestForRun(imported)
    }
  }

  const unlinkedAccounts = (sfinId: string) =>
    file.accounts.filter((a) => !a.closed && (!a.simplefinId || a.simplefinId === sfinId))

  return (
    <>
      <section className="card">
        <h3>Bank connection</h3>
        {accessUrl ? (
          <p>
            Connected to SimpleFIN at <code>{new URL(accessUrl).host}</code>.{' '}
            <button className="secondary" onClick={disconnect} disabled={busy}>
              Disconnect
            </button>
          </p>
        ) : (
          <>
            <p className="muted">
              Naught pulls transactions through{' '}
              <a href={BRIDGE_URL} target="_blank" rel="noreferrer">
                SimpleFIN Bridge
              </a>
              , a service you set up with your banks ($1.50 a month, or $15 a year). The credentials stay in this
              browser, not in your budget file; for a budget in Google Drive they are also kept in a hidden folder there,
              so your other devices connect by themselves.
            </p>
            <ol className="setup-steps">
              <li>
                <a href={`${BRIDGE_URL}/auth/login`} target="_blank" rel="noreferrer">
                  Sign in or create an account
                </a>{' '}
                with your email. The sign-in link arrives by email.
              </li>
              <li>
                On <a href={`${BRIDGE_URL}/my-account`} target="_blank" rel="noreferrer">My Account</a>, subscribe, then
                add each bank under <b>Financial Institutions → New Connection</b>.
              </li>
              <li>
                Still on My Account, under <b>Apps</b>, click <b>New Connection</b>, name it “Naught”, and click{' '}
                <b>Create Setup Token</b>.
              </li>
              <li>Copy the token and paste it below. It can only be claimed once.</li>
            </ol>
            <input
              style={{ width: '100%' }}
              placeholder="Paste the setup token here"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && parsed) connect()
              }}
            />
            <p className="muted small">
              {!token.trim()
                ? ' '
                : !parsed
                  ? 'That does not look like a setup token. It is a long block of letters and numbers from SimpleFIN Bridge.'
                  : parsed.kind === 'claim'
                    ? 'Setup token recognized.'
                    : 'Access URL recognized. It will be used as-is.'}
            </p>
            <p>
              <button onClick={connect} disabled={busy || !parsed}>
                {busy ? 'Connecting…' : 'Connect'}
              </button>
            </p>
          </>
        )}
      </section>

      {accessUrl && (
        <section className="card">
          <h3>Link bank accounts</h3>
          <p className="muted">
            To link a new bank account, or change which budget account one feeds, fetch the list of accounts, choose the
            links, then import. SimpleFIN allows roughly 24 requests a day, and each fetch or sync is one. Pending
            transactions are imported as uncleared so you can categorize them early; they clear when they post.
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
          <h3>Bank accounts</h3>
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
              already present{stats.removed > 0 ? `, ${stats.removed} stale pending removed` : ''}. The transactions are listed on the{' '}
              <Link to="/app/sync">Sync page</Link>.
            </p>
          )}
        </section>
      )}

      {error && <p className="neg">{error}</p>}
    </>
  )
}
