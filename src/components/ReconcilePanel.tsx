import { useState } from 'react'
import { formatCents } from '../model/money'
import { reconcile } from '../model/reconcile'
import type { BudgetFile, Transaction } from '../model/types'
import { useBudget } from '../store/budgetStore'
import { confirm } from './ConfirmDialog'

export function ReconcilePanel({ file, accountId }: { file: BudgetFile; accountId: string }) {
  const reconcileAccount = useBudget((s) => s.reconcileAccount)
  const [open, setOpen] = useState(false)
  const r = reconcile(file, accountId)
  if (!r) return null

  const matches = r.difference === 0
  const when = new Date(r.bankBalanceDate).toLocaleDateString()

  const doReconcile = async () => {
    const ok = await confirm({
      title: matches ? `Lock ${r.toLock} cleared transactions?` : `Reconcile with a ${formatCents(r.difference)} adjustment?`,
      message: matches
        ? 'Reconciled transactions are protected from future edits and matching.'
        : `An adjustment of ${formatCents(r.difference)} will be booked as income so the account matches the bank, and ${r.toLock} cleared transactions will be locked. Only do this if you cannot find the missing transaction.`,
      confirmLabel: matches ? 'Lock' : 'Adjust and lock',
      danger: !matches,
    })
    if (ok) reconcileAccount(accountId, r.difference, new Date().toISOString().slice(0, 10))
  }

  return (
    <section className={`card reconcile ${matches ? 'ok' : 'off'}`}>
      <div className="reconcile-row">
        <div className="stat">
          <span className="muted">Bank balance · {when}</span>
          <strong>{formatCents(r.bankBalance)}</strong>
        </div>
        {r.pending !== 0 && (
          <div className="stat">
            <span className="muted">{r.matchedBy === 'balance-less-pending' || r.matchedBy === 'available-less-pending' ? 'Pending, included above' : 'Pending, not included'}</span>
            <strong className="muted">{formatCents(r.pending)}</strong>
          </div>
        )}
        <div className="stat">
          <span className="muted">Cleared in Naught</span>
          <strong>{formatCents(r.clearedBalance)}</strong>
        </div>
        <div className={`stat ${matches ? 'to-budget' : 'to-budget over'}`}>
          <span className="muted">Difference</span>
          <strong>{matches ? 'Reconciled ✓' : formatCents(r.difference)}</strong>
        </div>
        <div className="reconcile-actions">
          {(r.uncleared.length > 0 || r.unconfirmed.length > 0) && (
            <button className="secondary" onClick={() => setOpen(!open)}>
              {open ? 'Hide details' : `${r.uncleared.length} uncleared · ${r.unconfirmed.length} unconfirmed`}
            </button>
          )}
          <button onClick={doReconcile} disabled={matches && r.toLock === 0}>
            {matches ? 'Lock cleared' : 'Reconcile…'}
          </button>
        </div>
      </div>

      {!matches && Math.abs(r.difference) < 50000 && r.uncleared.length === 0 && r.unconfirmed.length === 0 && (
        <p className="muted reconcile-note">
          Nothing in Naught explains this. Some banks fold pending charges into their balance without listing them; if the
          gap disappears within a few days, that is what it was.
        </p>
      )}

      {open && (
        <div className="reconcile-details">
          <Explain
            title="Uncleared"
            hint="Entered here but not posted at the bank yet. Expected to clear soon; not counted in the cleared balance."
            items={r.uncleared}
            file={file}
          />
          <Explain
            title="Unconfirmed"
            hint="Entered by hand and never matched to a bank transaction, though old enough that it should have been. If the bank never saw it, delete it."
            items={r.unconfirmed}
            file={file}
          />
        </div>
      )}
    </section>
  )
}

function Explain({ title, hint, items, file }: { title: string; hint: string; items: Transaction[]; file: BudgetFile }) {
  if (items.length === 0) return null
  const total = items.reduce((s, t) => s + t.amount, 0)
  const name = new Map(file.accounts.map((a) => [a.id, a.name]))
  return (
    <div>
      <h4>
        {title} · {items.length} · {formatCents(total)}
      </h4>
      <p className="muted">{hint}</p>
      <ul className="explain-list">
        {items.map((t) => (
          <li key={t.id}>
            <span className="muted">{t.date}</span>
            <span>{t.transferAccountId ? `Transfer: ${name.get(t.transferAccountId)}` : t.payee || 'No payee'}</span>
            <span className={`num ${t.amount < 0 ? 'neg' : 'pos'}`}>{formatCents(t.amount)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
