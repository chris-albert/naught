import { useMemo, useState } from 'react'
import { formatCents } from '../model/money'
import { categoryForPayee, uncategorizedFrom } from '../model/payeeRules'
import { INCOME_CATEGORY_ID, type BudgetFile, type Transaction } from '../model/types'
import { useBudget } from '../store/budgetStore'
import { CategoryPicker } from './CategoryPicker'
import { confirm } from './ConfirmDialog'
import { PayeePicker } from './PayeePicker'

const LIMIT = 500

export function TransactionTable({ file, transactions, showAccount }: { file: BudgetFile; transactions: Transaction[]; showAccount: boolean }) {
  const updateTransaction = useBudget((s) => s.updateTransaction)
  const deleteTransaction = useBudget((s) => s.deleteTransaction)
  const setPayeeRule = useBudget((s) => s.setPayeeRule)
  const accountName = new Map(file.accounts.map((a) => [a.id, a.name]))
  const categoryName = (id: string) => (id === INCOME_CATEGORY_ID ? 'Income' : file.categories.find((c) => c.id === id)?.name ?? '?')
  // After a category is picked by hand, offer to make it a rule for that payee.
  const [suggestion, setSuggestion] = useState<{ transactionId: string; payee: string; categoryId: string } | null>(null)
  const categorize = (t: Transaction, categoryId: string | null) => {
    updateTransaction(t.id, { categoryId })
    const offer = categoryId && t.payee && categoryForPayee(file, t.payee) !== categoryId
    setSuggestion(offer ? { transactionId: t.id, payee: t.payee, categoryId } : null)
  }
  const payees = useMemo(() => {
    const names = new Set<string>()
    for (const t of file.transactions) if (t.payee) names.add(t.payee)
    return [...names].sort((a, b) => a.localeCompare(b)).map((name) => ({ key: name, label: name }))
  }, [file.transactions])

  const uncleared = transactions.filter((t) => t.cleared === 'uncleared')
  const rest = transactions.filter((t) => t.cleared !== 'uncleared')
  const shown = rest.slice(0, LIMIT)
  const columns = showAccount ? 7 : 6

  // The prompt sits under its row, or at the top when the row has left the list (uncategorized filter).
  const suggestionInList = suggestion !== null && transactions.some((t) => t.id === suggestion.transactionId)
  const others = suggestion ? uncategorizedFrom(file, suggestion.payee).filter((o) => o.id !== suggestion.transactionId).length : 0
  const suggestionRow = suggestion && (
    <tr key="rule-suggestion" className="rule-suggestion">
      <td colSpan={columns}>
        <span>
          Always use <strong>{categoryName(suggestion.categoryId)}</strong> for <strong>{suggestion.payee}</strong>?
        </span>
        <button
          onClick={() => {
            setPayeeRule(suggestion.payee, suggestion.categoryId)
            setSuggestion(null)
          }}
        >
          {others > 0 ? `Yes, and categorize ${others} more` : 'Yes'}
        </button>
        <button className="link" onClick={() => setSuggestion(null)}>
          No
        </button>
      </td>
    </tr>
  )

  const renderRow = (t: Transaction) => [
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
          <CategoryPicker file={file} value={t.categoryId} onChange={(categoryId) => categorize(t, categoryId)} />
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
    </tr>,
    suggestion?.transactionId === t.id ? suggestionRow : null,
  ]

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
        {suggestionRow && !suggestionInList && <tbody>{suggestionRow}</tbody>}
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
