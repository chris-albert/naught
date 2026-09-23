import { useMemo, useState } from 'react'
import { formatCents } from '../model/money'
import { categoryForPayee, uncategorizedFrom } from '../model/payeeRules'
import { INCOME_CATEGORY_ID, type BudgetFile, type Transaction } from '../model/types'
import { useBudget } from '../store/budgetStore'
import { CategoryPicker } from './CategoryPicker'
import { confirm } from './ConfirmDialog'
import { PayeePicker } from './PayeePicker'

const LIMIT = 500

export function TransactionTable({
  file,
  transactions,
  showAccount,
  recentlyCategorized,
  onCategorized,
}: {
  file: BudgetFile
  transactions: Transaction[]
  showAccount: boolean
  /** Rows to show in their own "Recently categorized" section instead of by cleared state. */
  recentlyCategorized?: Set<string>
  /** Called after a category is picked by hand, so the page can keep the row visible under a filter. */
  onCategorized?: (transactionId: string) => void
}) {
  const updateTransaction = useBudget((s) => s.updateTransaction)
  const deleteTransaction = useBudget((s) => s.deleteTransaction)
  const setPayeeRule = useBudget((s) => s.setPayeeRule)
  const accountName = new Map(file.accounts.map((a) => [a.id, a.name]))
  const categoryName = (id: string) => (id === INCOME_CATEGORY_ID ? 'Income' : file.categories.find((c) => c.id === id)?.name ?? '?')
  // After a category is picked by hand, offer to make it a rule for that payee.
  // One offer per row; each stays until answered.
  const [suggestions, setSuggestions] = useState<Map<string, { payee: string; categoryId: string }>>(new Map())
  const categorize = (t: Transaction, categoryId: string | null) => {
    updateTransaction(t.id, { categoryId })
    onCategorized?.(t.id)
    const offer = categoryId && t.payee && categoryForPayee(file, t.payee) !== categoryId
    setSuggestions((m) => {
      const next = new Map(m)
      if (offer) next.set(t.id, { payee: t.payee, categoryId })
      else next.delete(t.id)
      return next
    })
  }
  const dismiss = (transactionId: string) =>
    setSuggestions((m) => {
      const next = new Map(m)
      next.delete(transactionId)
      return next
    })
  const acceptRule = (transactionId: string, payee: string, categoryId: string) => {
    setPayeeRule(payee, categoryId)
    // The rule answers every pending offer for this payee.
    setSuggestions((m) => new Map([...m].filter(([id, s]) => id !== transactionId && s.payee !== payee)))
  }
  const payees = useMemo(() => {
    const names = new Set<string>()
    for (const t of file.transactions) if (t.payee) names.add(t.payee)
    return [...names].sort((a, b) => a.localeCompare(b)).map((name) => ({ key: name, label: name }))
  }, [file.transactions])

  const recent = transactions.filter((t) => recentlyCategorized?.has(t.id))
  const uncleared = transactions.filter((t) => !recentlyCategorized?.has(t.id) && t.cleared === 'uncleared')
  const rest = transactions.filter((t) => !recentlyCategorized?.has(t.id) && t.cleared !== 'uncleared')
  const shown = rest.slice(0, LIMIT)
  const columns = showAccount ? 7 : 6
  const sections = [
    { title: 'Recently categorized', rows: recent, count: true },
    { title: 'Uncleared', rows: uncleared, count: true },
    { title: 'Cleared', rows: shown, count: false },
  ].filter((s) => s.rows.length > 0)
  // A list that is only cleared rows needs no heading.
  const headings = sections.length > 1 || sections[0]?.title !== 'Cleared'

  const renderSuggestion = (t: Transaction) => {
    const s = suggestions.get(t.id)
    if (!s) return null
    const others = uncategorizedFrom(file, s.payee).filter((o) => o.id !== t.id).length
    return (
      <tr key={`${t.id}-rule`} className="rule-suggestion">
        <td colSpan={columns}>
          <span>
            Always use <strong>{categoryName(s.categoryId)}</strong> for <strong>{s.payee}</strong>?
          </span>
          <button onClick={() => acceptRule(t.id, s.payee, s.categoryId)}>{others > 0 ? `Yes, and categorize ${others} more` : 'Yes'}</button>
          <button className="link" onClick={() => dismiss(t.id)}>
            No
          </button>
        </td>
      </tr>
    )
  }

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
    renderSuggestion(t),
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
        {sections.map((s) => (
          <tbody key={s.title}>
            {headings && (
              <tr className="section-row">
                <th colSpan={columns}>
                  {s.title}
                  {s.count ? ` · ${s.rows.length}` : ''}
                </th>
              </tr>
            )}
            {s.rows.map(renderRow)}
          </tbody>
        ))}
      </table>
      {rest.length > LIMIT && (
        <p className="muted">
          Showing {LIMIT} of {rest.length} cleared transactions.
        </p>
      )}
    </>
  )
}
