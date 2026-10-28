import { useEffect, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { accountBalance } from '../model/budgetMath'
import { reconcile } from '../model/reconcile'
import { formatCents } from '../model/money'
import { saveNow, useBudget, type SaveState } from '../store/budgetStore'
import { useSync } from '../store/syncStore'
import { getAccessUrl } from '../simplefin/client'
import { getTheme, nextTheme, setTheme } from '../theme'

const shortcut = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+'

const saveLabels: Record<SaveState, string> = {
  clean: 'Saved',
  dirty: 'Unsaved changes',
  saving: 'Saving…',
  error: 'Save failed',
  'no-file': 'Not linked to a file',
}

export function Sidebar({ isOpen }: { isOpen: boolean }) {
  const file = useBudget((s) => s.file)!
  const saveState = useBudget((s) => s.saveState)
  const demo = useBudget((s) => s.demo)
  const close = useBudget((s) => s.close)
  const past = useBudget((s) => s.past)
  const future = useBudget((s) => s.future)
  const undo = useBudget((s) => s.undo)
  const redo = useBudget((s) => s.redo)
  const [theme, setThemeState] = useState(getTheme)
  const [connected, setConnected] = useState(false)
  const syncing = useSync((s) => s.busy)
  const sync = useSync((s) => s.sync)
  const navigate = useNavigate()

  // Re-check after navigating, e.g. back from settings after connecting.
  const location = useLocation()
  useEffect(() => {
    getAccessUrl().then((u) => setConnected(!!u))
  }, [location.pathname])

  /** ↻: start the sync and go watch it on the Sync page. */
  const runSync = () => {
    void sync()
    navigate('/app/sync')
  }
  const open = file.accounts.filter((a) => !a.closed)
  const onBudget = open.filter((a) => a.onBudget)
  const offBudget = open.filter((a) => !a.onBudget)
  const status = (id: string): 'ok' | 'off' | null => {
    const r = reconcile(file, id)
    return r ? (r.difference === 0 ? 'ok' : 'off') : null
  }

  return (
    <nav className={`sidebar ${isOpen ? 'open' : ''}`}>
      <div className="brand-row">
        <img src="/icon.svg" alt="" className="brand-icon" />
        <h1 className="brand">{file.name || 'Naught'}</h1>
      </div>

      <NavLink to="/app/budget">Budget</NavLink>
      <div className="nav-with-action">
        <NavLink to="/app/sync">Sync</NavLink>
        <button
          className={`icon-button ${syncing ? 'spinning' : ''}`}
          title={connected ? 'Sync linked accounts now' : 'Connect SimpleFIN under Settings → Accounts first'}
          disabled={!connected || syncing}
          onClick={runSync}
        >
          ↻
        </button>
      </div>
      <NavLink to="/app/reports">Reports</NavLink>
      <NavLink to="/app/ask">Ask</NavLink>
      <NavLink to="/app/accounts" end>
        All accounts
      </NavLink>

      <h2>Budget accounts</h2>
      {onBudget.map((a) => (
        <AccountLink key={a.id} id={a.id} name={a.name} balance={accountBalance(file, a.id)} status={status(a.id)} />
      ))}
      {offBudget.length > 0 && <h2>Off budget</h2>}
      {offBudget.map((a) => (
        <AccountLink key={a.id} id={a.id} name={a.name} balance={accountBalance(file, a.id)} status={status(a.id)} />
      ))}

      <NavLink to="/app/settings" className="settings-link">
        Settings
      </NavLink>

      <div className="sidebar-footer">
        <div className="tool-row">
          <button className="link" disabled={past.length === 0} onClick={undo} title={`Undo (${shortcut}Z)`}>
            ↶ Undo{past.length > 0 && ` ${past[past.length - 1].label}`}
          </button>
          <button className="link" disabled={future.length === 0} onClick={redo} title={`Redo (${shortcut}⇧Z)`}>
            ↷ Redo
          </button>
        </div>
        <div className="tool-row">
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
            {demo ? 'Leave demo' : 'Close file'}
          </button>
        </div>
      </div>

      {demo ? (
        <div className="demo-note">
          <strong>Demo data.</strong> Change anything you like; nothing is saved.
        </div>
      ) : (
        <div className={`save-state save-${saveState}`} onClick={saveState === 'error' ? saveNow : undefined}>
          {saveLabels[saveState]}
        </div>
      )}
    </nav>
  )
}

function AccountLink({ id, name, balance, status }: { id: string; name: string; balance: number; status: 'ok' | 'off' | null }) {
  return (
    <NavLink to={`/app/accounts/${id}`} className="account-link">
      <span>
        {status && <i className={`recon-dot ${status}`} title={status === 'ok' ? 'Matches the bank' : 'Does not match the bank'} />}
        {name}
      </span>
      <span className="num">{formatCents(balance)}</span>
    </NavLink>
  )
}
