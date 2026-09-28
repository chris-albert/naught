import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { TrendBars } from '../components/TrendBars'
import { currentMonth } from '../model/dates'
import { formatCents } from '../model/money'
import { monthRange } from '../model/reports'
import { buildTrend, scopeFromParams, trendPath, type TrendRow } from '../model/trend'
import { INCOME_CATEGORY_ID, type Cents } from '../model/types'
import { useBudget } from '../store/budgetStore'

const RANGES = [6, 12, 24, 36]
const ROW_LIMIT = 200

/**
 * Drill-down for one category group, category or payee: how its spending moves month to month,
 * what makes it up, and the transactions behind it. Reached from the Reports rows and the category panel.
 */
export function TrendPage() {
  const file = useBudget((s) => s.file)!
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const scope = scopeFromParams(params)
  const [count, setCount] = useState(12)
  const [showAllFor, setShowAllFor] = useState<string | null>(null)
  const months = useMemo(() => monthRange(currentMonth(), count), [count])
  const trend = useMemo(() => {
    const s = scopeFromParams(params)
    return s ? buildTrend(file, months, s) : null
  }, [file, months, params])

  if (!scope || !trend) return <Missing />
  if (trend.name === null) return <Missing what={scope.kind} />

  const kindLabel = scope.kind === 'group' ? 'Category group' : scope.kind === 'category' ? 'Category' : 'Payee'
  const category = scope.kind === 'category' ? file.categories.find((c) => c.id === scope.id) : undefined
  const group = category ? file.categoryGroups.find((g) => g.id === category.groupId) : undefined
  const childLabel = scope.kind === 'category' ? 'Payee' : 'Category'
  const accountName = new Map(file.accounts.map((a) => [a.id, a.name]))
  const categoryName = (id: string | null) => (id === null ? 'Uncategorized' : id === INCOME_CATEGORY_ID ? 'Income' : file.categories.find((c) => c.id === id)?.name ?? '?')
  const max = Math.max(1, ...trend.rows.flatMap((r) => r.byMonth))
  const showAll = showAllFor === params.toString()
  const shown = showAll ? trend.transactions : trend.transactions.slice(0, ROW_LIMIT)
  const earlier = months.length - Math.floor(months.length / 2)

  return (
    <>
      <header className="page-header">
        <div>
          <div className="breadcrumb muted">
            <Link to="/app/reports">Reports</Link> ›{' '}
            {group ? (
              <>
                <Link to={trendPath({ kind: 'group', id: group.id })}>{group.name}</Link> ›{' '}
              </>
            ) : (
              kindLabel
            )}
          </div>
          <h2>
            {trend.name}
            {category?.reserve && <span className="tag">reserve</span>}
          </h2>
        </div>
        <div className="segmented">
          {RANGES.map((n) => (
            <button key={n} className={count === n ? 'on' : ''} onClick={() => setCount(n)}>
              {n} months
            </button>
          ))}
        </div>
      </header>
      <div className="page-body">
        <div className="stat-row">
          <Stat label="Avg per month" value={trend.average} />
          <Stat label={`Total · ${count} months`} value={trend.total} />
          <div className="stat" title={`Average of the last ${months.length - earlier} months against the ${earlier} before them`}>
            <span className="muted">Recent vs earlier</span>
            <strong className={trend.shift > 0 ? 'neg' : trend.shift < 0 ? 'pos' : ''}>
              {trend.shift === 0 ? '—' : `${trend.shift > 0 ? '▲' : '▼'} ${formatCents(Math.abs(trend.shift))}`}
            </strong>
            <span className="muted">per month</span>
          </div>
          {category?.target !== undefined && <Stat label="Monthly target" value={category.target} />}
          <div className="stat">
            <span className="muted">Transactions</span>
            <strong>{trend.transactions.length}</strong>
          </div>
        </div>

        <section className="card">
          <h3>Spending by month</h3>
          <TrendBars months={months} values={trend.byMonth} average={trend.average} target={category?.target} />
        </section>

        {trend.rows.length > 0 && (
          <table className="grid report">
            <thead>
              <tr>
                <th>{childLabel}</th>
                {months.map((m) => (
                  <th key={m} className="num">
                    {shortMonth(m)}
                  </th>
                ))}
                <th className="num">Average</th>
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {trend.rows.map((r) => (
                <BreakdownRow key={r.key} row={r} months={months} max={max} onOpen={r.scope ? () => navigate(trendPath(r.scope!)) : undefined} />
              ))}
            </tbody>
          </table>
        )}

        <section className="card">
          <h3>Transactions {trend.transactions.length > 0 && <span className="muted">· {trend.transactions.length}</span>}</h3>
          {trend.transactions.length === 0 ? (
            <p className="muted">Nothing in this range.</p>
          ) : (
            <>
              <table className="grid trend-transactions">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Account</th>
                    {scope.kind !== 'payee' && <th>Payee</th>}
                    {scope.kind !== 'category' && <th>Category</th>}
                    <th>Memo</th>
                    <th className="num">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((t) => (
                    <tr key={t.id}>
                      <td className="muted">{t.date}</td>
                      <td>
                        <Link to={`/app/accounts/${t.accountId}`}>{accountName.get(t.accountId)}</Link>
                      </td>
                      {scope.kind !== 'payee' && <td>{t.payee ? <Link to={trendPath({ kind: 'payee', name: t.payee })}>{t.payee}</Link> : <span className="muted">No payee</span>}</td>}
                      {scope.kind !== 'category' && (
                        <td>
                          {t.categoryId && t.categoryId !== INCOME_CATEGORY_ID ? (
                            <Link to={trendPath({ kind: 'category', id: t.categoryId })}>{categoryName(t.categoryId)}</Link>
                          ) : (
                            <span className="muted">{categoryName(t.categoryId)}</span>
                          )}
                        </td>
                      )}
                      <td className="muted memo">{t.memo}</td>
                      <td className={`num ${t.amount > 0 ? 'pos' : ''}`}>{formatCents(t.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {shown.length < trend.transactions.length && (
                <p className="muted">
                  Showing the latest {shown.length}.{' '}
                  <button className="link" onClick={() => setShowAllFor(params.toString())}>
                    Show all {trend.transactions.length}
                  </button>
                </p>
              )}
            </>
          )}
        </section>
      </div>
    </>
  )
}

function BreakdownRow({ row, months, max, onOpen }: { row: TrendRow; months: string[]; max: number; onOpen?: () => void }) {
  return (
    <tr className={onOpen ? 'category-row' : ''} onClick={onOpen}>
      <td>
        {row.label}
        <span className="muted count"> · {row.count}</span>
      </td>
      {row.byMonth.map((v, i) => (
        <td key={months[i]} className="num heat" style={{ '--heat': v > 0 ? Math.min(1, v / max) : 0 } as React.CSSProperties}>
          {cell(v)}
        </td>
      ))}
      <td className="num">{formatCents(row.average)}</td>
      <td className="num">{formatCents(row.total)}</td>
    </tr>
  )
}

function Missing({ what }: { what?: string }) {
  return (
    <>
      <header className="page-header">
        <h2>Nothing to show</h2>
      </header>
      <div className="page-body">
        <p className="muted">
          {what ? `That ${what} is not in this budget.` : 'Pick a category, group or payee from the Reports page.'}{' '}
          <Link to="/app/reports">Back to Reports</Link>
        </p>
      </div>
    </>
  )
}

function Stat({ label, value }: { label: string; value: Cents }) {
  return (
    <div className="stat">
      <span className="muted">{label}</span>
      <strong>{value < 0 ? <span className="pos">+{formatCents(-value)}</span> : formatCents(value)}</strong>
    </div>
  )
}

/** Cells: money out as a plain number, net money in as a green "+" figure. */
const cell = (v: Cents) =>
  v === 0 ? <span className="muted">–</span> : v < 0 ? <span className="soft-pos">+{formatCents(-v)}</span> : formatCents(v)

function shortMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' })
}
