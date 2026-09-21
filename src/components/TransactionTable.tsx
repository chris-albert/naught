import { useMemo } from 'react'
import { formatCents } from '../model/money'
import type { BudgetFile, Transaction } from '../model/types'
import { useBudget } from '../store/budgetStore'
import { CategoryPicker } from './CategoryPicker'
import { confirm } from './ConfirmDialog'
import { PayeePicker } from './PayeePicker'

const LIMIT = 500

export function TransactionTable({ file, transactions, showAccount }: { file: BudgetFile; transactions: Transaction[]; showAccount: boolean }) {
  const updateTransaction = useBudget((s) => s.updateTransaction)
  const deleteTransaction = useBudget((s) => s.deleteTransaction)
  const accountName = new Map(file.accounts.map((a) => [a.id, a.name]))
  const payees = useMemo(() => {
    const names = new Set<string>()
    for (const t of file.transactions) if (t.payee) names.add(t.payee)
    return [...names].sort((a, b) => a.localeCompare(b)).map((name) => ({ key: name, label: name }))
  }, [file.transactions])

  const uncleared = transactions.filter((t) => t.cleared === 'uncleared')
  const rest = transactions.filter((t) => t.cleared !== 'uncleared')
  const shown = rest.slice(0, LIMIT)
  const columns = showAccount ? 7 : 6

  const renderRow = (t: Transaction) => (
    <tr key={t.id} className={!t.categoryId && !t.transferAccountId ? 'uncategorized' : ''}>
      {showAccount && <td>{accountName.get(t.accountId)}</td>}
      <td>{t.date}</td>
      <td>
        <PayeePicker payees={payees} value={t.payee} onChange={(payee) => updateTransaction(t.id, { payee })} />
      </td>
      <td>
        {t.transferAccountId ? (
          <span className="muted">Transfer: {accountName.get(t.transferAccountId) ?? '?'}</span>
        ) : (
          <CategoryPicker file={file} value={t.categoryId} onChange={(categoryId) => updateTransaction(t.id, { categoryId })} />
        )}
      </td>
      <td className={`num ${t.amount < 0 ? 'neg' : 'pos'}`}>{formatCents(t.amount)}</td>
      <td className="muted">{t.cleared === 'reconciled' ? '🔒' : t.cleared === 'cleared' ? '✓' : ''}</td>
      <td className="row-actions">
        <button
          className="link danger"
          title="Delete transaction"
          onClick={async () => {
            const ok = await confirm({
              title: 'Delete this transaction?',
              message: `${t.date} · ${t.payee || 'No payee'} · ${formatCents(t.amount)}`,
              confirmLabel: 'Delete',
              danger: true,
            })
            if (ok) deleteTransaction(t.id)
          }}
        >
          ✕
        </button>
      </td>
    </tr>
  )

  return (
    <>
      <table className="grid">
        <thead>
          <tr>
            {showAccount && <th>Account</th>}
            <th>Date</th>
            <th>Payee</th>
            <th>Category</th>
            <th className="num">Amount</th>
            <th></th>
            <th></th>
          </tr>
        </thead>
        {uncleared.length > 0 && (
          <tbody>
            <tr className="section-row">
              <th colSpan={columns}>Uncleared · {uncleared.length}</th>
            </tr>
            {uncleared.map(renderRow)}
          </tbody>
        )}
        <tbody>
          {uncleared.length > 0 && rest.length > 0 && (
            <tr className="section-row">
              <th colSpan={columns}>Cleared</th>
            </tr>
          )}
          {shown.map(renderRow)}
        </tbody>
      </table>
      {rest.length > LIMIT && (
        <p className="muted">
          Showing {LIMIT} of {rest.length} cleared transactions.
        </p>
      )}
    </>
  )
}
