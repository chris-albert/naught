import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { emptyBudget, type BudgetFile } from '../model/types'
import {
  createNewFile,
  forgetHandle,
  openExistingFile,
  supportsFileSystemAccess,
} from '../storage/fileStore'
import {
  createDriveBudget,
  forgetDriveFile,
  listDriveBudgets,
  loadGoogleSignIn,
  openDriveBudget,
  signOutOfDrive,
  supportsGoogleDrive,
  type DriveFile,
} from '../storage/googleDrive'
import { parseBudgetFile, type OpenedBudget } from '../storage/storage'
import { useBudget } from '../store/budgetStore'

/** The budget that was open last time, which needs a click before the browser lets us back in. */
export interface PendingBudget {
  name: string
  /** Null when the user declines. */
  reopen: () => Promise<OpenedBudget | null>
  forget: () => Promise<void>
}

export function WelcomePage({ pending, onPendingDone }: { pending: PendingBudget | null; onPendingDone: () => void }) {
  const load = useBudget((s) => s.load)
  const [name, setName] = useState('My budget')
  const [error, setError] = useState<string | null>(null)
  /** Budgets in the user's Drive; null until they connect. */
  const [driveFiles, setDriveFiles] = useState<DriveFile[] | null>(null)

  useEffect(() => {
    if (supportsGoogleDrive) loadGoogleSignIn().catch(() => {})
  }, [])

  const createInDrive = async (data: BudgetFile) => {
    const storage = await createDriveBudget(data)
    await forgetHandle()
    load(data, storage)
  }

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

      {pending && (
        <section className="card">
          <p>
            Reopen <strong>{pending.name}</strong>?
          </p>
          <button
            onClick={() =>
              run(async () => {
                const opened = await pending.reopen()
                if (opened) {
                  load(opened.data, opened.storage)
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
                await pending.forget()
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
                  if (!opened) return
                  await forgetDriveFile()
                  load(opened.data, opened.storage)
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
                  const storage = await createNewFile(data)
                  if (!storage) return
                  await forgetDriveFile()
                  load(data, storage)
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

      {supportsGoogleDrive && (
        <section className="card">
          <h3>Google Drive</h3>
          <p className="muted">
            Keep the budget in your own Google Drive and open it from any browser, phones included. Naught can only see
            the files it puts there.
          </p>
          {!driveFiles ? (
            <button onClick={() => run(async () => setDriveFiles(await listDriveBudgets()))}>Connect Google Drive</button>
          ) : (
            <>
              {driveFiles.map((f) => (
                <p key={f.id}>
                  <button
                    onClick={() =>
                      run(async () => {
                        const opened = await openDriveBudget(f)
                        await forgetHandle()
                        load(opened.data, opened.storage)
                      })
                    }
                  >
                    Open {f.name}
                  </button>
                </p>
              ))}
              <p>
                <input value={name} onChange={(e) => setName(e.target.value)} />{' '}
                <button className="secondary" onClick={() => run(() => createInDrive(emptyBudget(name.trim() || 'My budget')))}>
                  Create new budget in Drive
                </button>
              </p>
              <label className="muted">
                Or copy an existing budget file to Drive:{' '}
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={(e) => {
                    const picked = e.target.files?.[0]
                    if (picked) run(async () => createInDrive(parseBudgetFile(await picked.text())))
                  }}
                />
              </label>
              <p className="muted small">
                This browser stays signed in until you{' '}
                <button
                  className="link"
                  onClick={() =>
                    run(async () => {
                      await signOutOfDrive()
                      setDriveFiles(null)
                    })
                  }
                >
                  sign out of Google
                </button>
                .
              </p>
            </>
          )}
        </section>
      )}

      {error && <p className="neg">{error}</p>}
      <p className="muted small">
        <Link to="/">About Naught</Link> · <Link to="/demo">Try the demo</Link>
      </p>
    </div>
  )
}
