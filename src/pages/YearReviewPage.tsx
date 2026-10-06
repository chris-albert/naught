import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CumulativeLine } from '../components/CumulativeLine'
import { MonthlyBars } from '../components/MonthlyBars'
import { ReportsNav } from '../components/ReportsNav'
import { currentDate, formatMonth } from '../model/dates'
import { formatCents } from '../model/money'
import { trendPath } from '../model/trend'
import type { Cents } from '../model/types'
import { buildYearReview, type CategoryChange, type MonthValue } from '../model/yearReview'
import { useBudget } from '../store/budgetStore'

/** One calendar year of the budget: totals, standout months, top categories and payees, and how it compares with the year before. */
export function YearReviewPage() {
  const file = useBudget((s) => s.file)!
  const params = useParams()
  const today = currentDate()
  const year = Number(params.year) || Number(today.slice(0, 4))
  const review = useMemo(() => buildYearReview(file, year, today), [file, year, today])
  const { totals, priorYear } = review
  const idx = review.years.indexOf(year)
  const prev = idx > 0 ? review.years[idx - 1] : idx === -1 ? review.years.filter((y) => y < year).at(-1) : undefined
  const next = idx >= 0 && idx < review.years.length - 1 ? review.years[idx + 1] : idx === -1 ? review.years.find((y) => y > year) : undefined
  const lastMonth = review.months[review.months.length - 1]
  const anyReserve = totals.setAside !== 0 || totals.drawn !== 0 || (priorYear?.setAside ?? 0) !== 0

  return (
    <>
      <header className="page-header">
        <h2>Reports</h2>
        <ReportsNav />
        <div className="month-nav">
          {prev !== undefined ? <Link to={`/app/reports/year/${prev}`}>‹</Link> : <span className="year-nav-off">‹</span>}
          <h2>{year}</h2>
          {next !== undefined ? <Link to={`/app/reports/year/${next}`}>›</Link> : <span className="year-nav-off">›</span>}
        </div>
        {review.partial && lastMonth && <span className="muted">Through {formatMonth(lastMonth).split(' ')[0]}</span>}
      </header>
      <div className="page-body">
        <div className="stat-row">
          <Stat label="Income" value={totals.income} prior={priorYear?.income} upIsGood priorYear={year - 1} />
          <Stat label="Living spending" value={totals.living} prior={priorYear?.living} priorYear={year - 1} />
          {anyReserve && <Stat label="Set aside" value={totals.setAside} prior={priorYear?.setAside} upIsGood priorYear={year - 1} />}
          <Stat label="Net" value={totals.net} prior={priorYear?.net} upIsGood signed priorYear={year - 1} />
          <div className="stat">
            <span className="muted">Savings rate</span>
            <strong className={totals.savingsRate !== null && totals.savingsRate < 0 ? 'neg' : ''}>{rate(totals.savingsRate)}</strong>
            {priorYear && totals.savingsRate !== null && priorYear.savingsRate !== null && (
              <Delta diff={Math.round((totals.savingsRate - priorYear.savingsRate) * 100)} upIsGood priorYear={year - 1} format={(d) => `${d} pts`} />
            )}
          </div>
        </div>

        {totals.monthsCounted === 0 ? (
          <p className="muted">Nothing counted in {year}.</p>
        ) : (
          <>
            <section className="card">
              <h3>Month by month</h3>
              <MonthlyBars summaries={review.summaries} />
              <CumulativeLine summaries={review.summaries} />
            </section>

            <section className="card">
              <h3>Highlights</h3>
              <ul className="year-highlights">
                <Highlight label="Best month" item={review.bestMonth} signed />
                <Highlight label="Worst month" item={review.worstMonth} signed />
                <Highlight label="Biggest spending month" item={review.biggestSpend} />
                <li>
                  <span className="muted">Months counted</span>
                  <strong>{totals.monthsCounted}</strong>
                </li>
              </ul>
            </section>

            {review.topCategories.length > 0 && (
              <section className="card">
                <h3>Top categories</h3>
                <table className="grid">
                  <thead>
                    <tr>
                      <th>Category</th>
                      <th className="num">Total</th>
                      <th className="num">Per month</th>
                      <th className="year-share">Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {review.topCategories.map((c) => (
                      <tr key={c.category.id}>
                        <td>
                          <Link to={trendPath({ kind: 'category', id: c.category.id })}>{c.category.name}</Link>
                        </td>
                        <td className="num">{formatCents(c.total)}</td>
                        <td className="num">{formatCents(c.average)}</td>
                        <td className="year-share">
                          <div className="share-bar" style={{ width: `${Math.round(c.share * 100)}%` }} />
                          <span className="muted">{Math.round(c.share * 100)}%</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            {review.topPayees.length > 0 && (
              <section className="card">
                <h3>Top payees</h3>
                <table className="grid">
                  <thead>
                    <tr>
                      <th>Payee</th>
                      <th className="num">Transactions</th>
                      <th className="num">Total</th>
                      <th className="num">Per month</th>
                    </tr>
                  </thead>
                  <tbody>
                    {review.topPayees.map((p) => (
                      <tr key={p.payee}>
                        <td>
                          <Link to={trendPath({ kind: 'payee', name: p.payee })}>{p.payee}</Link>
                        </td>
                        <td className="num">{p.count}</td>
                        <td className="num">{formatCents(p.total)}</td>
                        <td className="num">{formatCents(p.average)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            {priorYear && (review.categoryChanges.up.length > 0 || review.categoryChanges.down.length > 0) && (
              <section className="card">
                <h3>Biggest changes vs {year - 1}</h3>
                {review.partial && lastMonth && <p className="muted">Both years counted through {formatMonth(lastMonth).split(' ')[0]}.</p>}
                <div className="year-changes">
                  <Changes title="Up" items={review.categoryChanges.up} />
                  <Changes title="Down" items={review.categoryChanges.down} />
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </>
  )
}

function Stat({
  label,
  value,
  prior,
  priorYear,
  upIsGood = false,
  signed = false,
}: {
  label: string
  value: Cents
  prior?: Cents
  priorYear: number
  upIsGood?: boolean
  signed?: boolean
}) {
  return (
    <div className="stat">
      <span className="muted">{label}</span>
      <strong className={signed ? (value < 0 ? 'neg' : 'pos') : ''}>{formatCents(value)}</strong>
      {prior !== undefined && <Delta diff={value - prior} upIsGood={upIsGood} priorYear={priorYear} format={formatCents} />}
    </div>
  )
}

/** "▲ $1,234 vs 2025" line under a stat; green when the move is in the good direction. */
function Delta({ diff, upIsGood, priorYear, format }: { diff: number; upIsGood: boolean; priorYear: number; format: (n: number) => string }) {
  if (diff === 0) return <span className="muted">same as {priorYear}</span>
  const good = diff > 0 === upIsGood
  return (
    <span className={`year-delta ${good ? 'soft-pos' : 'soft-neg'}`}>
      {diff > 0 ? '▲' : '▼'} {format(Math.abs(diff))} <span className="muted">vs {priorYear}</span>
    </span>
  )
}

function Highlight({ label, item, signed = false }: { label: string; item: MonthValue | null; signed?: boolean }) {
  if (!item) return null
  return (
    <li>
      <span className="muted">{label}</span>
      <strong>{formatMonth(item.month)}</strong>
      <span className={signed ? (item.value < 0 ? 'neg' : 'pos') : ''}>{formatCents(item.value)}</span>
    </li>
  )
}

function Changes({ title, items }: { title: string; items: CategoryChange[] }) {
  if (items.length === 0) return null
  return (
    <div>
      <h4>{title}</h4>
      <ul className="movers">
        {items.map((c) => (
          <li key={c.category.id}>
            <Link className="mover-name" to={trendPath({ kind: 'category', id: c.category.id })} title="Spending over time">
              {c.category.name}
            </Link>
            <span className={`mover-delta ${c.change > 0 ? 'soft-neg' : 'soft-pos'}`}>
              {c.change > 0 ? '▲' : '▼'} {formatCents(Math.abs(c.change))}
            </span>
            <span className="muted">
              {formatCents(c.thisYear)} vs {formatCents(c.priorYear)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function rate(r: number | null): string {
  return r === null ? '—' : `${Math.round(r * 100)}%`
}

