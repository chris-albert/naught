import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
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
import { WelcomePage } from './pages/WelcomePage'
import { hasPermission, readHandle, rememberedHandle } from './storage/fileStore'
import { useBudget } from './store/budgetStore'

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
  const [pendingHandle, setPendingHandle] = useState<FileSystemFileHandle | null>(null)
  const [restoring, setRestoring] = useState(true)

  // On startup, reopen the last file if the browser still lets us.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        if (useBudget.getState().file) return // the demo, or a file opened before navigating here
        const handle = await rememberedHandle()
        if (!handle || cancelled) return
        if (await hasPermission(handle)) {
          load(await readHandle(handle), handle)
        } else {
          setPendingHandle(handle)
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

  if (restoring) return null
  if (!file) return <WelcomePage pendingHandle={pendingHandle} onPendingDone={() => setPendingHandle(null)} />

  return (
    <div className="layout">
      <ConfirmDialog />
      <Sidebar />
      <main className="content">
        <Routes>
          <Route path="/" element={<Navigate to="/app/budget" replace />} />
          <Route path="budget" element={<BudgetPage />} />
          <Route path="budget/:month" element={<BudgetPage />} />
          <Route path="reports" element={<ReportsPage />} />
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
