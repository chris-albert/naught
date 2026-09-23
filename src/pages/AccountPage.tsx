import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { AddTransactionForm } from '../components/AddTransactionForm'
import { ReconcilePanel } from '../components/ReconcilePanel'
import { TransactionTable } from '../components/TransactionTable'
import { accountBalance } from '../model/budgetMath'
import { formatCents } from '../model/money'
import { useBudget } from '../store/budgetStore'

export function AccountPage() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const onlyUncategorized = params.get('filter') === 'uncategorized'
  const file = useBudget((s) => s.file)!
  const [adding, setAdding] = useState(false)
  const account = id ? file.accounts.find((a) => a.id === id) : undefined
  const inScope = account ? file.transactions.filter((t) => t.accountId === account.id) : file.transactions
  const uncategorized = inScope.filter((t) => !t.categoryId && !t.transferAccountId)
  // Rows categorized while the filter is on stay visible until the filter is
  // left, so you can see what you just did and the rule prompt has a row to sit under.
  const filterKey = `${account?.id ?? 'all'}:${onlyUncategorized}`
  const [kept, setKept] = useState({ key: filterKey, ids: new Set<string>() })
  if (kept.key !== filterKey) setKept({ key: filterKey, ids: new Set() })
  const transactions = onlyUncategorized ? inScope.filter((t) => (!t.categoryId && !t.transferAccountId) || kept.ids.has(t.id)) : inScope
  const base = account ? `/app/accounts/${account.id}` : '/app/accounts'
  const balance = account
    ? accountBalance(file, account.id)
    : file.accounts.filter((a) => !a.closed).reduce((sum, a) => sum + accountBalance(file, a.id), 0)

  return (
    <>
      <header className="page-header">
        <h2>{account ? account.name : 'All accounts'}</h2>
        <div className="stat">
          <span className="muted">Balance</span>
          <strong className={balance < 0 ? 'neg' : ''}>{formatCents(balance)}</strong>
        </div>
        {uncategorized.length > 0 && (
          <Link to={onlyUncategorized ? base : `${base}?filter=uncategorized`} className={`filter-chip ${onlyUncategorized ? 'on' : ''}`}>
            {uncategorized.length} uncategorized {onlyUncategorized ? '· show all' : ''}
          </Link>
        )}
        {account && (
          <button className="secondary" onClick={() => setAdding(!adding)}>
            {adding ? 'Done adding' : 'Add transaction'}
          </button>
        )}
      </header>
      <div className="page-body">
      {account && <ReconcilePanel file={file} accountId={account.id} />}
      {account && adding && <AddTransactionForm file={file} accountId={account.id} />}
      <TransactionTable
        file={file}
        transactions={transactions}
        showAccount={!account}
        recentlyCategorized={onlyUncategorized ? kept.ids : undefined}
        onCategorized={(id) => setKept((k) => ({ ...k, ids: new Set(k.ids).add(id) }))}
      />
      </div>
    </>
  )
}
