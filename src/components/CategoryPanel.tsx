import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { CategoryRow } from '../model/budgetMath'
import { monthOf } from '../model/dates'
import { formatCents, parseCents } from '../model/money'
import type { BudgetFile, Cents, MonthKey, Transaction } from '../model/types'
import { useBudget } from '../store/budgetStore'

/** Shortfall against the category's monthly target, if it has one. */
export function targetShortfall(row: CategoryRow): Cents {
  const { target } = row.category
  return target === undefined ? 0 : Math.max(0, target - row.assigned)
}

/**
 * Detail panel for one budget category, opened by clicking its name. Shows
 * the month's numbers, holds the monthly target, and assigns To budget money
 * toward it.
 */
export function CategoryPanel({
  file,
  month,
  row,
  toBudget,
  onClose,
}: {
  file: BudgetFile
  month: MonthKey
  row: CategoryRow
  toBudget: Cents
  onClose: () => void
}) {
  const updateCategory = useBudget((s) => s.updateCategory)
  const moveAssigned = useBudget((s) => s.moveAssigned)
  const [targetText, setTargetText] = useState<string | null>(null)
  const [showOptions, setShowOptions] = useState(false)
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'date', dir: -1 })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const { category } = row
  const group = file.categoryGroups.find((g) => g.id === category.groupId)
  // Same transactions the Activity column counts: this month, on-budget accounts.
  const transactions = useMemo(() => {
    const onBudget = new Set(file.accounts.filter((a) => a.onBudget).map((a) => a.id))
    return file.transactions
      .filter((t) => t.categoryId === category.id && onBudget.has(t.accountId) && monthOf(t.date) === month)
      .sort((a, b) => sort.dir * compare(a, b, sort.key) || compare(b, a, 'date'))
  }, [file.transactions, file.accounts, category.id, month, sort])
  const accountName = new Map(file.accounts.map((a) => [a.id, a.name]))
  const target = category.target
  const toGo = targetShortfall(row)
  const over = target === undefined ? 0 : Math.max(0, row.assigned - target)
  const progress = target ? Math.min(100, Math.round((100 * row.assigned) / target)) : 0

  const commitTarget = () => {
    if (targetText !== null) {
      const cents = parseCents(targetText)
      if (cents !== null && cents !== (target ?? 0)) updateCategory(category.id, { target: cents > 0 ? cents : undefined })
    }
    setTargetText(null)
  }

  return (
    <aside className="slideover">
      <div className="slideover-head">
        <div>
          <h3>{category.name}</h3>
          <span className="muted">{group?.name}</span>
        </div>
        <button type="button" className="link close" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>

      <section className="slideover-stats">
        <div>
          <span className="muted">Assigned</span>
          <strong>{formatCents(row.assigned)}</strong>
        </div>
        <div>
          <span className="muted">Activity</span>
          <strong>{formatCents(row.activity)}</strong>
        </div>
        <div>
          <span className="muted">Available</span>
          <strong className={row.available < 0 ? 'neg' : row.available > 0 ? 'pos' : ''}>{formatCents(row.available)}</strong>
        </div>
      </section>

      <section>
        <h4>Monthly target</h4>
        <div className="target-row">
          <input
            className="target-amount"
            value={targetText ?? (target ? formatCents(target) : '')}
            placeholder="No target"
            onFocus={(e) => e.target.select()}
            onChange={(e) => setTargetText(e.target.value)}
            onBlur={commitTarget}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
              if (e.key === 'Escape') {
                e.stopPropagation()
                setTargetText(null)
                e.currentTarget.blur()
              }
            }}
          />
          {target !== undefined && (
            <button type="button" className="link" onClick={() => updateCategory(category.id, { target: undefined })}>
              Remove
            </button>
          )}
        </div>
        {target === undefined ? (
          <p className="muted">Set how much this category needs each month, then assign toward it from here.</p>
        ) : (
          <>
            <div className={`target-bar ${toGo > 0 ? 'under' : ''}`}>
              <span style={{ width: `${progress}%` }} />
            </div>
            <p className={toGo > 0 ? 'warn-text' : 'muted'}>
              {toGo > 0
                ? `${formatCents(toGo)} to go this month.`
                : over > 0
                  ? `Funded, ${formatCents(over)} over the target.`
                  : 'Funded for this month.'}
            </p>
            {toGo > 0 && (
              <div className="target-actions">
                <button type="button" onClick={() => moveAssigned(month, null, category.id, toGo)}>
                  Assign {formatCents(toGo)}
                </button>
                {toBudget < toGo && (
                  <span className="muted">
                    {toBudget > 0 ? `Only ${formatCents(toBudget)} to budget.` : 'Nothing left to budget.'}
                  </span>
                )}
              </div>
            )}
          </>
        )}
      </section>

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
            {transactions.map((t) => (
              <li key={t.id}>
                <span className="muted">{shortDate(t.date)}</span>
                <Link to={`/app/accounts/${t.accountId}`} title={accountName.get(t.accountId)}>
                  {t.payee || 'No payee'}
                </Link>
                <span className={`num ${t.amount < 0 ? '' : 'pos'}`}>{formatCents(t.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h4>
          <button type="button" className={`link toggle ${showOptions ? 'open' : ''}`} onClick={() => setShowOptions(!showOptions)}>
            <span className="chevron" /> Options
          </button>
        </h4>
        {showOptions && (
          <>
            <label className="option">
              <input type="checkbox" checked={!!category.reserve} onChange={(e) => updateCategory(category.id, { reserve: e.target.checked })} />
              <span>
                Reserve
                <small className="muted">Savings-style: money here is set aside, and spending from it is a draw, not a living expense.</small>
              </span>
            </label>
            <label className="option">
              <input type="checkbox" checked={category.hidden} onChange={(e) => updateCategory(category.id, { hidden: e.target.checked })} />
              <span>
                Hidden
                <small className="muted">Kept out of the budget table unless "show hidden" is on.</small>
              </span>
            </label>
          </>
        )}
      </section>
    </aside>
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
