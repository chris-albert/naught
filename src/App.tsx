import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { ConfirmDialog } from './components/ConfirmDialog'
import { Sidebar } from './components/Sidebar'
import { sampleBudget } from './demo/sampleBudget'
import { AccountPage } from './pages/AccountPage'
import { AccountsPage } from './pages/AccountsPage'
import { BudgetPage } from './pages/BudgetPage'
import { ImportPage } from './pages/ImportPage'
import { LandingPage } from './pages/LandingPage'
import { PayeeRulesPage } from './pages/PayeeRulesPage'
import { ReportsPage } from './pages/ReportsPage'
import { SyncPage } from './pages/SyncPage'
import { TrendPage } from './pages/TrendPage'
import { WelcomePage, type PendingBudget } from './pages/WelcomePage'
import { fileStorage, forgetHandle, hasPermission, readHandle, rememberedHandle, requestPermission } from './storage/fileStore'
import { forgetDriveFile, hasDriveAccess, openDriveBudget, rememberedDriveFile, supportsGoogleDrive } from './storage/googleDrive'
import { reloadIfChanged, useBudget } from './store/budgetStore'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/demo" element={<DemoPage />} />
      <Route path="/app/*" element={<BudgetApp />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

/** Opens the sample budget in memory and jumps into the app. */
function DemoPage() {
  const load = useBudget((s) => s.load)
  const navigate = useNavigate()
  useEffect(() => {
    load(sampleBudget(), null, true)
    navigate('/app/budget', { replace: true })
  }, [load, navigate])
  return null
}

function BudgetApp() {
  const file = useBudget((s) => s.file)
  const load = useBudget((s) => s.load)
  const [pending, setPending] = useState<PendingBudget | null>(null)
  const [restoring, setRestoring] = useState(true)
  const [navOpen, setNavOpen] = useState(false)

  // On narrow screens the sidebar is a drawer; close it after navigating.
  const location = useLocation()
  useEffect(() => setNavOpen(false), [location])

  // On startup, reopen the last file if the browser still lets us.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        if (useBudget.getState().file) return // the demo, or a file opened before navigating here
        const driveFile = supportsGoogleDrive ? await rememberedDriveFile() : undefined
        if (driveFile) {
          // Without a valid sign-in, reopening needs a click so the browser allows Google's popup.
          const opened = (await hasDriveAccess()) ? await openDriveBudget(driveFile).catch(() => null) : null
          if (cancelled) return
          if (opened) load(opened.data, opened.storage)
          else setPending({ name: `${driveFile.name} from Google Drive`, reopen: () => openDriveBudget(driveFile), forget: forgetDriveFile })
          return
        }
        const handle = await rememberedHandle()
        if (!handle || cancelled) return
        if (await hasPermission(handle)) {
          load(await readHandle(handle), fileStorage(handle))
        } else {
          setPending({
            name: handle.name,
            reopen: async () => ((await requestPermission(handle)) ? { data: await readHandle(handle), storage: fileStorage(handle) } : null),
            forget: forgetHandle,
          })
        }
      } catch (e) {
        console.warn('could not restore last file', e)
      } finally {
        if (!cancelled) setRestoring(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [load])

  // Coming back to the tab: pick up anything saved from another device meanwhile.
  useEffect(() => {
    const check = () => {
      if (document.visibilityState === 'visible') void reloadIfChanged()
    }
    document.addEventListener('visibilitychange', check)
    return () => document.removeEventListener('visibilitychange', check)
  }, [])

  if (restoring) return null
  if (!file) return <WelcomePage pending={pending} onPendingDone={() => setPending(null)} />

  return (
    <div className="layout">
      <ConfirmDialog />
      <Sidebar isOpen={navOpen} />
      {navOpen && <div className="nav-backdrop" onClick={() => setNavOpen(false)} />}
      <main className="content">
        <div className="topbar">
          <button className="icon-button menu" aria-label="Open menu" onClick={() => setNavOpen(true)}>
            ☰
          </button>
          <img src="/icon.svg" alt="" className="brand-icon" />
          <span className="brand">{file.name || 'Naught'}</span>
        </div>
        <Routes>
          <Route path="/" element={<Navigate to="/app/budget" replace />} />
          <Route path="budget" element={<BudgetPage />} />
          <Route path="budget/:month" element={<BudgetPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="reports/trend" element={<TrendPage />} />
          <Route path="accounts" element={<AccountPage />} />
          <Route path="accounts/:id" element={<AccountPage />} />
          <Route path="import" element={<ImportPage />} />
          <Route path="sync" element={<SyncPage />} />
          <Route path="settings/accounts" element={<AccountsPage />} />
          <Route path="settings/rules" element={<PayeeRulesPage />} />
          <Route path="*" element={<Navigate to="/app/budget" replace />} />
        </Routes>
      </main>
    </div>
  )
}
