import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ReportsNav } from '../components/ReportsNav'
import { currentDate, currentMonth, shortMonth } from '../model/dates'
import { sinceFirstActivity } from '../model/ledger'
import { recurringPayees, reserveHealth, targetAdherence, topPayees, type RecurringPayee, type TargetVerdict } from '../model/insights'
import { formatCents } from '../model/money'
import { buildReport, monthRange } from '../model/reports'
import { trendPath } from '../model/trend'
import { INCOME_CATEGORY_ID, type Cents } from '../model/types'
import { useBudget } from '../store/budgetStore'

const RANGES = [12, 24]

/**
 * What the numbers say across payees and targets: subscriptions and other fixed costs,
 * how targets compare with what actually happens, who gets the most money, and how the
 * reserves are holding up.
 */
export function InsightsPage() {
  const file = useBudget((s) => s.file)!
  const [count, setCount] = useState(12)
  const today = currentDate()
  const months = useMemo(() => sinceFirstActivity(file, monthRange(currentMonth(), count)), [file, count])
  const recurring = useMemo(() => recurringPayees(file, today), [file, today])
  const targets = useMemo(() => targetAdherence(file, months), [file, months])
  const payees = useMemo(() => topPayees(file, months), [file, months])
  const reserves = useMemo(() => reserveHealth(file, months, today), [file, months, today])
  const avgIncome = useMemo(() => buildReport(file, months).avgIncome, [file, months])
  const categoryName = (id: string | null) =>
    id === null ? 'Uncategorized' : id === INCOME_CATEGORY_ID ? 'Income' : file.categories.find((c) => c.id === id)?.name ?? '?'
  const categoryCell = (id: string | null) =>
    id && id !== INCOME_CATEGORY_ID ? <Link to={trendPath({ kind: 'category', id })}>{categoryName(id)}</Link> : <span className="muted">{categoryName(id)}</span>

  const priceChanges = recurring.payees.filter((p) => p.priceChange)
  const started = recurring.payees.filter((p) => p.status === 'new')
  const stopped = recurring.payees.filter((p) => p.status === 'stopped')

  return (
    <>
      <header className="page-header">
        <h2>Reports</h2>
        <ReportsNav />
        <div className="segmented">
          {RANGES.map((n) => (
            <button key={n} className={count === n ? 'on' : ''} onClick={() => setCount(n)}>
              {n} months
            </button>
          ))}
        </div>
      </header>
      <div className="page-body">
        <section className="card">
          <h3>Recurring payees and subscriptions</h3>
          <p className="muted">
            Payees that charge about once a month (three or more times) or once a year, found in the last 13 months. Fixed costs are the ones
            whose amount holds steady.
          </p>
          <div className="stat-row">
            <Stat label="Fixed costs per month" value={recurring.fixedMonthly} />
            <div className="stat">
              <span className="muted">Share of income</span>
              <strong>{avgIncome > 0 ? `${Math.round((100 * recurring.fixedMonthly) / avgIncome)}%` : '—'}</strong>
              <span className="muted">of {formatCents(avgIncome)} avg</span>
            </div>
            <div className="stat">
              <span className="muted">Recurring payees</span>
              <strong>{recurring.count}</strong>
            </div>
          </div>
          {(priceChanges.length > 0 || started.length > 0 || stopped.length > 0) && (
            <div className="insight-highlights">
              {priceChanges.length > 0 && (
                <div>
                  <h4>Price changes</h4>
                  <ul className="movers">
                    {priceChanges.map((p) => (
                      <li key={p.payee}>
                        <PayeeLink payee={p.payee} />
                        <span className={`mover-delta ${p.priceChange!.to > p.priceChange!.from ? 'soft-neg' : 'soft-pos'}`}>
                          {formatCents(p.priceChange!.from)} → {formatCents(p.priceChange!.to)}
                        </span>
                        <span className="muted">since {shortMonth(p.priceChange!.since)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {started.length > 0 && (
                <div>
                  <h4>New</h4>
                  <ul className="movers">
                    {started.map((p) => (
                      <li key={p.payee}>
                        <PayeeLink payee={p.payee} />
                        <span className="mover-delta">{formatCents(p.monthlyCost)}</span>
                        <span className="muted">started {shortMonth(p.firstDate.slice(0, 7))}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {stopped.length > 0 && (
                <div>
                  <h4>Stopped</h4>
                  <ul className="movers">
                    {stopped.map((p) => (
                      <li key={p.payee}>
                        <PayeeLink payee={p.payee} />
                        <span className="mover-delta soft-pos">{formatCents(p.monthlyCost)}</span>
                        <span className="muted">last seen {shortMonth(p.lastDate.slice(0, 7))}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          {recurring.payees.length === 0 ? (
            <p className="muted">No recurring payees yet. They show up once a payee has charged three months in a row.</p>
          ) : (
            <table className="grid insight-table">
              <thead>
                <tr>
                  <th>Payee</th>
                  <th>Category</th>
                  <th>Cadence</th>
                  <th className="num">Amount</th>
                  <th className="num">Per month</th>
                  <th>Last charged</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {recurring.payees.map((p) => (
                  <tr key={p.payee} className={p.status === 'stopped' ? 'insight-stopped' : ''}>
                    <td>
                      <PayeeLink payee={p.payee} />
                    </td>
                    <td>{categoryCell(p.categoryId)}</td>
                    <td className="muted">{p.cadence}</td>
                    <td className="num">{formatCents(p.priceChange?.to ?? p.amount)}</td>
                    <td className="num">{formatCents(p.monthlyCost)}</td>
                    <td className="muted">{p.lastDate}</td>
                    <td>
                      <StatusTags p={p} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="card">
          <h3>Targets vs reality</h3>
          {targets.rows.length === 0 ? (
            <p className="muted">
              No category has a monthly target yet. Set one from the category's panel on the <Link to="/app/budget">Budget</Link> page and
              this will show how spending compares with it.
            </p>
          ) : (
            <>
              <p className="muted">
                Targets add up to <strong>{formatCents(targets.totals.target)}</strong> a month; what actually happened averages{' '}
                <strong>{formatCents(targets.totals.actual)}</strong> over the last {count} months. For a reserve, "actual" is what was assigned
                to it, not what was spent from it.
              </p>
              <table className="grid insight-table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th className="num">Target</th>
                    <th className="num">Actual avg</th>
                    <th className="num">Difference</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {targets.rows.map((r) => (
                    <tr key={r.category.id}>
                      <td>
                        <Link to={trendPath({ kind: 'category', id: r.category.id })}>{r.category.name}</Link>
                        {r.category.reserve && <span className="tag">reserve</span>}
                      </td>
                      <td className="num">{formatCents(r.target)}</td>
                      <td className="num">{formatCents(r.actual)}</td>
                      <td className={`num ${r.verdict === 'over' ? 'soft-neg' : r.verdict === 'under' ? 'soft-pos' : ''}`}>
                        {r.delta === 0 ? <span className="muted">–</span> : `${r.delta > 0 ? '▲' : '▼'} ${formatCents(Math.abs(r.delta))}`}
                        {r.delta !== 0 && <span className="muted count"> · {Math.round(Math.abs(r.pct) * 100)}%</span>}
                      </td>
                      <td>
                        <VerdictTag verdict={r.verdict} reserve={!!r.category.reserve} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </section>

        <section className="card">
          <h3>Top payees</h3>
          <p className="muted">Where the most money went over the last {count} months, net of refunds. Change compares the later half of the range with the earlier half.</p>
          {payees.length === 0 ? (
            <p className="muted">Nothing in this range.</p>
          ) : (
            <table className="grid insight-table">
              <thead>
                <tr>
                  <th>Payee</th>
                  <th>Category</th>
                  <th className="num">Transactions</th>
                  <th className="num">Total</th>
                  <th className="num">Per month</th>
                  <th className="num">Change</th>
                </tr>
              </thead>
              <tbody>
                {payees.map((p) => (
                  <tr key={p.payee}>
                    <td>
                      <PayeeLink payee={p.payee} />
                    </td>
                    <td>{categoryCell(p.categoryId)}</td>
                    <td className="num">{p.count}</td>
                    <td className="num">{formatCents(p.total)}</td>
                    <td className="num">{formatCents(p.average)}</td>
                    <td className={`num ${p.shift > 0 ? 'soft-neg' : p.shift < 0 ? 'soft-pos' : ''}`}>
                      {p.shift === 0 ? <span className="muted">–</span> : `${p.shift > 0 ? '▲' : '▼'} ${formatCents(Math.abs(p.shift))}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="card">
          <h3>Reserve health</h3>
          {reserves.length === 0 ? (
            <p className="muted">
              No categories are marked as reserves. Mark sinking funds (vacation, buffer, investments) from the <Link to="/app/reports">Overview</Link>{' '}
              page to track how they fill and drain.
            </p>
          ) : (
            <>
              <p className="muted">What each reserve holds now, how much goes in and comes out each month on average, and how long the balance would last at that draw rate.</p>
              <table className="grid insight-table">
                <thead>
                  <tr>
                    <th>Reserve</th>
                    <th className="num">Balance</th>
                    <th className="num">Set aside / month</th>
                    <th className="num">Drawn / month</th>
                    <th className="num">Net / month</th>
                    <th className="num">Target</th>
                    <th>Runway</th>
                  </tr>
                </thead>
                <tbody>
                  {reserves.map((r) => (
                    <tr key={r.category.id}>
                      <td>
                        <Link to={trendPath({ kind: 'category', id: r.category.id })}>{r.category.name}</Link>
                      </td>
                      <td className={`num ${r.balance < 0 ? 'neg' : ''}`}>{formatCents(r.balance)}</td>
                      <td className="num">{formatCents(r.avgSetAside)}</td>
                      <td className="num">{formatCents(r.avgDrawn)}</td>
                      <td className={`num ${r.net > 0 ? 'soft-pos' : r.net < 0 ? 'soft-neg' : ''}`}>{formatCents(r.net)}</td>
                      <td className="num">
                        {r.target === undefined ? (
                          <span className="muted">–</span>
                        ) : (
                          <>
                            {formatCents(r.target)}
                            {r.vsTarget !== null && r.vsTarget !== 0 && (
                              <span className={`count ${r.vsTarget < 0 ? 'soft-neg' : 'soft-pos'}`}>
                                {' '}
                                · {r.vsTarget < 0 ? '▼' : '▲'} {formatCents(Math.abs(r.vsTarget))}
                              </span>
                            )}
                          </>
                        )}
                      </td>
                      <td className="muted">{r.runwayMonths === null ? 'not drawn from' : `covers ${r.runwayMonths} months of draws`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </section>
      </div>
    </>
  )
}

function PayeeLink({ payee }: { payee: string }) {
  return (
    <Link className="mover-name" to={trendPath({ kind: 'payee', name: payee })} title="Spending over time">
      {payee}
    </Link>
  )
}

function StatusTags({ p }: { p: RecurringPayee }) {
  return (
    <>
      {p.status === 'new' && <span className="tag">new</span>}
      {p.status === 'stopped' && <span className="tag tag-muted">stopped</span>}
      {p.priceChange && <span className={`tag ${p.priceChange.to > p.priceChange.from ? 'tag-warn' : ''}`}>{p.priceChange.to > p.priceChange.from ? 'price up' : 'price down'}</span>}
      {!p.stable && <span className="tag tag-muted">varies</span>}
    </>
  )
}

function VerdictTag({ verdict, reserve }: { verdict: TargetVerdict; reserve: boolean }) {
  if (verdict === 'on') return <span className="tag tag-muted">on target</span>
  // Spending over a living target is the problem; assigning under a reserve target is.
  const bad = reserve ? verdict === 'under' : verdict === 'over'
  const label = reserve ? (verdict === 'over' ? 'over-funded' : 'under-funded') : verdict === 'over' ? 'over target' : 'under target'
  return <span className={`tag ${bad ? 'tag-warn' : ''}`}>{label}</span>
}

function Stat({ label, value }: { label: string; value: Cents }) {
  return (
    <div className="stat">
      <span className="muted">{label}</span>
      <strong>{formatCents(value)}</strong>
    </div>
  )
}
