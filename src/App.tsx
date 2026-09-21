import { useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { ConfirmDialog } from './components/ConfirmDialog'
import { Sidebar } from './components/Sidebar'
import { AccountPage } from './pages/AccountPage'
import { AccountsPage } from './pages/AccountsPage'
import { BudgetPage } from './pages/BudgetPage'
import { ImportPage } from './pages/ImportPage'
import { ReportsPage } from './pages/ReportsPage'
import { SyncPage } from './pages/SyncPage'
import { WelcomePage } from './pages/WelcomePage'
import { hasPermission, readHandle, rememberedHandle } from './storage/fileStore'
import { useBudget } from './store/budgetStore'

export default function App() {
  const file = useBudget((s) => s.file)
  const load = useBudget((s) => s.load)
  const [pendingHandle, setPendingHandle] = useState<FileSystemFileHandle | null>(null)
  const [restoring, setRestoring] = useState(true)

  // On startup, reopen the last file if the browser still lets us.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
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
          <Route path="/" element={<Navigate to="/budget" replace />} />
          <Route path="/budget" element={<BudgetPage />} />
          <Route path="/budget/:month" element={<BudgetPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/accounts" element={<AccountPage />} />
          <Route path="/accounts/:id" element={<AccountPage />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="/sync" element={<SyncPage />} />
          <Route path="/settings/accounts" element={<AccountsPage />} />
          <Route path="*" element={<Navigate to="/budget" replace />} />
        </Routes>
      </main>
    </div>
  )
}
