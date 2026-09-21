import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { accountBalance } from '../model/budgetMath'
import { reconcile } from '../model/reconcile'
import { formatCents } from '../model/money'
import { saveNow, useBudget, type SaveState } from '../store/budgetStore'
import { getAccessUrl } from '../simplefin/client'
import { quickSync } from '../simplefin/quickSync'
import { downloadBackup } from '../storage/fileStore'
import { getTheme, nextTheme, setTheme } from '../theme'

const saveLabels: Record<SaveState, string> = {
  clean: 'Saved',
  dirty: 'Unsaved changes',
  saving: 'Saving…',
  error: 'Save failed',
  'no-file': 'Not linked to a file',
}

export function Sidebar() {
  const file = useBudget((s) => s.file)!
  const saveState = useBudget((s) => s.saveState)
  const close = useBudget((s) => s.close)
  const [theme, setThemeState] = useState(getTheme)
  const [connected, setConnected] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState<{ text: string; error: boolean } | null>(null)

  // Re-check after navigating, e.g. back from the sync page after connecting.
  const location = useLocation()
  useEffect(() => {
    getAccessUrl().then((u) => setConnected(!!u))
  }, [location.pathname])

  const runSync = async () => {
    setSyncing(true)
    setSyncMessage(null)
    try {
      const s = await quickSync()
      const parts = [s.added && `${s.added} added`, s.matched && `${s.matched} matched`, s.updated && `${s.updated} updated`, s.removed && `${s.removed} removed`].filter(Boolean)
      setSyncMessage({ text: parts.length ? parts.join(', ') : 'Up to date', error: false })
    } catch (e) {
      setSyncMessage({ text: (e as Error).message, error: true })
    } finally {
      setSyncing(false)
      setTimeout(() => setSyncMessage(null), 8000)
    }
  }
  const open = file.accounts.filter((a) => !a.closed)
  const onBudget = open.filter((a) => a.onBudget)
  const offBudget = open.filter((a) => !a.onBudget)
  const uncategorized = file.transactions.filter((t) => !t.categoryId && !t.transferAccountId).length
  const status = (id: string): 'ok' | 'off' | null => {
    const r = reconcile(file, id)
    return r ? (r.difference === 0 ? 'ok' : 'off') : null
  }

  return (
    <nav className="sidebar">
      <div className="brand-row">
        <img src="/icon.svg" alt="" className="brand-icon" />
        <h1 className="brand">{file.name || 'Naught'}</h1>
      </div>

      <NavLink to="/budget">Budget</NavLink>
      <NavLink to="/reports">Reports</NavLink>
      <NavLink to="/accounts" end>
        All accounts
      </NavLink>
      {uncategorized > 0 && (
        <NavLink to="/accounts?filter=uncategorized" className="account-link">
          <span>Needs a category</span>
          <span className="badge">{uncategorized}</span>
        </NavLink>
      )}

      <h2>Budget accounts</h2>
      {onBudget.map((a) => (
        <AccountLink key={a.id} id={a.id} name={a.name} balance={accountBalance(file, a.id)} status={status(a.id)} />
      ))}
      {offBudget.length > 0 && <h2>Off budget</h2>}
      {offBudget.map((a) => (
        <AccountLink key={a.id} id={a.id} name={a.name} balance={accountBalance(file, a.id)} status={status(a.id)} />
      ))}

      <h2>Settings</h2>
      <NavLink to="/settings/accounts">Manage accounts</NavLink>
      <div className="nav-with-action">
        <NavLink to="/sync">Bank sync</NavLink>
        <button
          className={`icon-button ${syncing ? 'spinning' : ''}`}
          title={connected ? 'Sync linked accounts now' : 'Connect SimpleFIN first'}
          disabled={!connected || syncing}
          onClick={runSync}
        >
          ↻
        </button>
      </div>
      {syncMessage && <div className={`sync-message ${syncMessage.error ? 'neg' : ''}`}>{syncMessage.text}</div>}
      <NavLink to="/import">Import</NavLink>
      <button className="link" onClick={() => downloadBackup(file)}>
        Download backup
      </button>
      <button
        className="link"
        onClick={() => {
          const t = nextTheme(theme)
          setTheme(t)
          setThemeState(t)
        }}
      >
        Theme: {theme}
      </button>
      <button className="link" onClick={close}>
        Close file
      </button>

      <div className={`save-state save-${saveState}`} onClick={saveState === 'error' ? saveNow : undefined}>
        {saveLabels[saveState]}
      </div>
    </nav>
  )
}

function AccountLink({ id, name, balance, status }: { id: string; name: string; balance: number; status: 'ok' | 'off' | null }) {
  return (
    <NavLink to={`/accounts/${id}`} className="account-link">
      <span>
        {status && <i className={`recon-dot ${status}`} title={status === 'ok' ? 'Matches the bank' : 'Does not match the bank'} />}
        {name}
      </span>
      <span className="num">{formatCents(balance)}</span>
    </NavLink>
  )
}
