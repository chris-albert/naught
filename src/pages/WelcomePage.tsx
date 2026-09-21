import { useState } from 'react'
import { emptyBudget } from '../model/types'
import {
  createNewFile,
  forgetHandle,
  openExistingFile,
  readHandle,
  requestPermission,
  supportsFileSystemAccess,
} from '../storage/fileStore'
import { useBudget } from '../store/budgetStore'

export function WelcomePage({
  pendingHandle,
  onPendingDone,
}: {
  pendingHandle: FileSystemFileHandle | null
  onPendingDone: () => void
}) {
  const load = useBudget((s) => s.load)
  const [name, setName] = useState('My budget')
  const [error, setError] = useState<string | null>(null)

  const run = async (fn: () => Promise<void>) => {
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="welcome">
      <div className="brand-row">
        <img src="/icon.svg" alt="" className="brand-icon large" />
        <h1 className="brand">Naught</h1>
      </div>
      <p className="muted">A zero-based budget that lives in a file you own.</p>

      {pendingHandle && (
        <section className="card">
          <p>
            Reopen <strong>{pendingHandle.name}</strong>?
          </p>
          <button
            onClick={() =>
              run(async () => {
                if (await requestPermission(pendingHandle)) {
                  load(await readHandle(pendingHandle), pendingHandle)
                  onPendingDone()
                }
              })
            }
          >
            Reopen
          </button>{' '}
          <button
            className="secondary"
            onClick={() =>
              run(async () => {
                await forgetHandle()
                onPendingDone()
              })
            }
          >
            Forget it
          </button>
        </section>
      )}

      {supportsFileSystemAccess ? (
        <>
          <section className="card">
            <h3>Open an existing budget file</h3>
            <button
              onClick={() =>
                run(async () => {
                  const opened = await openExistingFile()
                  if (opened) load(opened.data, opened.handle)
                })
              }
            >
              Open file…
            </button>
          </section>
          <section className="card">
            <h3>Create a new budget</h3>
            <p className="muted">Save it inside a synced folder (Google Drive, iCloud, Dropbox) to back it up.</p>
            <input value={name} onChange={(e) => setName(e.target.value)} />{' '}
            <button
              onClick={() =>
                run(async () => {
                  const data = emptyBudget(name.trim() || 'My budget')
                  const handle = await createNewFile(data)
                  if (handle) load(data, handle)
                })
              }
            >
              Create file…
            </button>
          </section>
        </>
      ) : (
        <section className="card">
          <h3>This browser can't save to files</h3>
          <p className="muted">
            Naught writes your budget straight to a file on disk, which needs Chrome, Edge, or another Chromium-based
            browser. You can still try it in memory and use "Download backup" to keep your data.
          </p>
          <button onClick={() => load(emptyBudget(name.trim() || 'My budget'), null)}>Start without a file</button>
        </section>
      )}

      {error && <p className="neg">{error}</p>}
    </div>
  )
}
