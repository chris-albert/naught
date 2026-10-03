import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatCents } from '../model/money'
import type { BudgetFile, Transaction } from '../model/types'

/**
 * The month's transactions inside a detail panel, sortable by date, payee or amount. With
 * `showCategory` each row also names its category, for panels that span several.
 */
export function PanelTransactions({
  file,
  transactions,
  showCategory = false,
}: {
  file: BudgetFile
  transactions: Transaction[]
  showCategory?: boolean
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'date', dir: -1 })
  const sorted = useMemo(
    () => [...transactions].sort((a, b) => sort.dir * compare(a, b, sort.key) || compare(b, a, 'date')),
    [transactions, sort],
  )
  const accountName = new Map(file.accounts.map((a) => [a.id, a.name]))
  const categoryName = new Map(file.categories.map((c) => [c.id, c.name]))

  return (
    <section>
      <h4>Transactions this month{transactions.length > 0 && ` · ${transactions.length}`}</h4>
      {transactions.length === 0 ? (
        <p className="muted">Nothing yet.</p>
      ) : (
        <ul className="panel-transactions">
          <li className="head">
            {SORT_COLUMNS.map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`link ${key === 'amount' ? 'num' : ''} ${sort.key === key ? 'active' : ''}`}
                onClick={() => setSort(sort.key === key ? { key, dir: sort.dir === 1 ? -1 : 1 } : { key, dir: DEFAULT_DIR[key] })}
              >
                {label}
                {sort.key === key && <span className="sort-arrow">{sort.dir === 1 ? '▲' : '▼'}</span>}
              </button>
            ))}
          </li>
          {sorted.map((t) => (
            <li key={t.id}>
              <span className="muted">{shortDate(t.date)}</span>
              <span className="payee">
                <Link to={`/app/accounts/${t.accountId}`} title={accountName.get(t.accountId)}>
                  {t.payee || 'No payee'}
                </Link>
                {showCategory && t.categoryId && <small className="muted"> · {categoryName.get(t.categoryId)}</small>}
              </span>
              <span className={`num ${t.amount < 0 ? '' : 'pos'}`}>{formatCents(t.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

type SortKey = 'date' | 'payee' | 'amount'

const SORT_COLUMNS: [SortKey, string][] = [
  ['date', 'Date'],
  ['payee', 'Payee'],
  ['amount', 'Amount'],
]

/** First click on a column: newest first, A to Z, or biggest spend first. */
const DEFAULT_DIR: Record<SortKey, 1 | -1> = { date: -1, payee: 1, amount: 1 }

function compare(a: Transaction, b: Transaction, key: SortKey): number {
  if (key === 'amount') return a.amount - b.amount
  if (key === 'payee') return a.payee.localeCompare(b.payee, undefined, { sensitivity: 'base' })
  return a.date < b.date ? -1 : a.date > b.date ? 1 : 0
}

/** "Sep 14" from an ISO date, without timezone drift. */
function shortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}
