import { useEffect, useRef } from 'react'
import { create } from 'zustand'

interface ConfirmOptions {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

interface ConfirmState {
  pending: (ConfirmOptions & { resolve: (ok: boolean) => void }) | null
}

const useConfirm = create<ConfirmState>(() => ({ pending: null }))

/** Ask the user to confirm. Resolves true on confirm, false on cancel or Escape. */
export function confirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    useConfirm.setState({ pending: { ...options, resolve } })
  })
}

/** Mount once near the root. */
export function ConfirmDialog() {
  const pending = useConfirm((s) => s.pending)
  const ref = useRef<HTMLDialogElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (pending && !d.open) {
      d.showModal()
      confirmRef.current?.focus()
    }
    if (!pending && d.open) d.close()
  }, [pending])

  const finish = (ok: boolean) => {
    pending?.resolve(ok)
    useConfirm.setState({ pending: null })
  }

  return (
    <dialog
      ref={ref}
      className="confirm"
      onCancel={(e) => {
        e.preventDefault()
        finish(false)
      }}
      onClick={(e) => e.target === ref.current && finish(false)}
    >
      {pending && (
        <div className="confirm-body">
          <h3>{pending.title}</h3>
          {pending.message && <p className="muted">{pending.message}</p>}
          <div className="confirm-actions">
            <button className="secondary" onClick={() => finish(false)}>
              {pending.cancelLabel ?? 'Cancel'}
            </button>
            <button ref={confirmRef} className={pending.danger ? 'danger' : ''} onClick={() => finish(true)}>
              {pending.confirmLabel ?? 'OK'}
            </button>
          </div>
        </div>
      )}
    </dialog>
  )
}
