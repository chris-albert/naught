import { useState } from 'react'
import { confirm } from '../components/ConfirmDialog'
import { Picker } from '../components/Picker'
import { formatCents } from '../model/money'
import type { Account, AccountType } from '../model/types'
import { useBudget } from '../store/budgetStore'

const accountTypes: { key: AccountType; label: string }[] = [
  { key: 'checking', label: 'Checking' },
  { key: 'savings', label: 'Savings' },
  { key: 'credit', label: 'Credit card' },
  { key: 'cash', label: 'Cash' },
  { key: 'investment', label: 'Investment' },
  { key: 'other', label: 'Other' },
]

export function AccountsPage() {
  return (
    <>
      <header className="page-header">
        <h2>Manage accounts</h2>
        <span className="muted">The order here is the order in the sidebar.</span>
      </header>
      <div className="page-body">
      <AccountList />
      <section className="card">
        <h3>Add an account</h3>
        <AddAccount />
      </section>
      </div>
    </>
  )
}

function AccountList() {
  const file = useBudget((s) => s.file)!
  const updateAccount = useBudget((s) => s.updateAccount)
  const deleteAccount = useBudget((s) => s.deleteAccount)
  const moveAccount = useBudget((s) => s.moveAccount)
  const count = (id: string) => file.transactions.filter((t) => t.accountId === id).length
  const balance = (id: string) => file.transactions.filter((t) => t.accountId === id).reduce((s, t) => s + t.amount, 0)

  const confirmDelete = async (a: Account) => {
    const n = count(a.id)
    const ok = await confirm({
      title: `Delete “${a.name}”?`,
      message: n ? `Its ${n} transactions will be deleted too. This cannot be undone.` : 'This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
    })
    if (ok) deleteAccount(a.id)
  }

  // File order is the display order everywhere (sidebar included).
  const open = file.accounts.filter((a) => !a.closed)
  const closed = file.accounts.filter((a) => a.closed)

  const renderRow = (a: Account) => (
    <tr key={a.id} className={a.closed ? 'muted' : ''}>
      <td>
        <input
          className="inline"
          defaultValue={a.name}
          onBlur={(e) => {
            const name = e.target.value.trim()
            if (name && name !== a.name) updateAccount(a.id, { name })
            else e.target.value = a.name
          }}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
        {a.closed && <span className="muted"> (closed)</span>}
        {!a.onBudget && <span className="muted"> · off budget</span>}
      </td>
      <td>
        <Picker options={accountTypes} value={a.type} onChange={(type) => updateAccount(a.id, { type: type as AccountType })} />
      </td>
      <td>
        <input
          className="inline"
          placeholder="https://…"
          defaultValue={a.bankUrl ?? ''}
          onBlur={(e) => {
            const bankUrl = e.target.value.trim()
            if (bankUrl !== (a.bankUrl ?? '')) updateAccount(a.id, { bankUrl: bankUrl || undefined })
            else e.target.value = a.bankUrl ?? ''
          }}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
      </td>
      <td>
        {a.type === 'credit' && (
          <input
            className="inline day"
            type="number"
            min={1}
            max={31}
            placeholder="day"
            defaultValue={a.statementDay ?? ''}
            onBlur={(e) => {
              const n = Math.round(Number(e.target.value))
              const statementDay = n >= 1 && n <= 31 ? n : undefined
              if (statementDay !== a.statementDay) updateAccount(a.id, { statementDay })
              else e.target.value = a.statementDay?.toString() ?? ''
            }}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
        )}
      </td>
      <td className="num">{formatCents(balance(a.id))}</td>
      <td className="actions">
        <button className="link" title="Move up" onClick={() => moveAccount(a.id, -1)}>
          ▲
        </button>
        <button className="link" title="Move down" onClick={() => moveAccount(a.id, 1)}>
          ▼
        </button>
        <button className="link" onClick={() => updateAccount(a.id, { closed: !a.closed })}>
          {a.closed ? 'Reopen' : 'Close'}
        </button>
        <button className="link danger" onClick={() => confirmDelete(a)}>
          Delete
        </button>
      </td>
    </tr>
  )

  return (
    <table className="grid">
      <thead>
        <tr>
          <th>Name</th>
          <th>Type</th>
          <th>Bank link</th>
          <th title="Day of the month the card's statement closes; the balance that day is what gets reported to the credit bureaus.">Statement closes</th>
          <th className="num">Balance</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr className="section-row">
          <th colSpan={6}>Open · {open.length}</th>
        </tr>
        {open.map(renderRow)}
      </tbody>
      {closed.length > 0 && (
        <tbody>
          <tr className="section-row">
            <th colSpan={6}>Closed · {closed.length}</th>
          </tr>
          {closed.map(renderRow)}
        </tbody>
      )}
    </table>
  )
}

function AddAccount() {
  const addAccount = useBudget((s) => s.addAccount)
  const [name, setName] = useState('')
  const [type, setType] = useState<AccountType>('checking')
  const [onBudget, setOnBudget] = useState(true)

  const submit = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    addAccount({ name: trimmed, type, onBudget, closed: false })
    setName('')
  }

  return (
    <div className="add-account">
      <input placeholder="New account name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
      <Picker options={accountTypes} value={type} onChange={(t) => setType(t as AccountType)} />
      <label>
        <input type="checkbox" checked={onBudget} onChange={(e) => setOnBudget(e.target.checked)} /> on budget
      </label>
      <button onClick={submit} disabled={!name.trim()}>
        Add account
      </button>
    </div>
  )
}
