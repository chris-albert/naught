import { Fragment, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ReportsNav } from '../components/ReportsNav'
import { currentDate, currentMonth, addMonths, formatMonth, shortMonth } from '../model/dates'
import { formatCents } from '../model/money'
import { buildMonthReview, type Headline, type Pace, type PaceFigures, type RateHeadline } from '../model/monthReview'
import { trendPath } from '../model/trend'
import { INCOME_CATEGORY_ID } from '../model/types'
import { useBudget } from '../store/budgetStore'

/** One month in review: headline numbers against last month and the average, where the month is heading, and what stands out. */
export function MonthReviewPage() {
  const file = useBudget((s) => s.file)!
  const { month: param } = useParams()
  const today = currentDate()
  const thisMonth = currentMonth()
  const month = param && /^\d{4}-\d{2}$/.test(param) ? param : thisMonth
  const review = useMemo(() => buildMonthReview(file, month, today), [file, month, today])
  const accountName = new Map(file.accounts.map((a) => [a.id, a.name]))
  const categoryName = (id: string | null) =>
    id === null ? 'Uncategorized' : id === INCOME_CATEGORY_ID ? 'Income' : file.categories.find((c) => c.id === id)?.name ?? '?'
  const prevLabel = `vs ${shortMonth(review.prevMonth)}`
  const avgLabel = review.comparedMonths > 0 ? `vs ${review.comparedMonths}-mo avg` : 'vs avg'

  return (
    <>
      <header className="page-header">
        <h2>Reports</h2>
        <ReportsNav />
        <div className="month-nav">
          <Link to={`/app/reports/month/${addMonths(month, -1)}`}>‹</Link>
          <h2>{formatMonth(month)}</h2>
          {month < thisMonth ? <Link to={`/app/reports/month/${addMonths(month, 1)}`}>›</Link> : <span className="month-nav-end" />}
        </div>
      </header>
      <div className="page-body">
        {review.current && (
          <p className="muted review-note">
            Through the {ordinal(review.throughDay)}. Comparisons use the same days of earlier months.
          </p>
        )}
        <div className="stat-row">
          <MoneyStat label="Income" h={review.income} prevLabel={prevLabel} avgLabel={avgLabel} upIsGood />
          <MoneyStat label="Living spending" h={review.living} prevLabel={prevLabel} avgLabel={avgLabel} />
          {(review.setAside.value !== 0 || review.setAside.vsAverage !== 0) && (
            <MoneyStat label="Set aside" h={review.setAside} prevLabel={prevLabel} avgLabel={avgLabel} upIsGood />
          )}
          <MoneyStat label="Net" h={review.net} prevLabel={prevLabel} avgLabel={avgLabel} upIsGood signed />
          <RateStat label="Savings rate" h={review.savingsRate} prevLabel={prevLabel} avgLabel={avgLabel} />
        </div>

        {review.pace && <PaceCard pace={review.pace} throughDay={review.throughDay} />}

        <section className="card">
          <h3>Budget vs actual</h3>
          <div className="review-figures">
            <span>
              <span className="muted">Assigned</span> <strong>{formatCents(review.budget.assigned)}</strong>
            </span>
            <span>
              <span className="muted">Spent</span> <strong>{formatCents(review.budget.spent)}</strong>
            </span>
            <span>
              <span className="muted">Difference</span>{' '}
              <strong className={review.budget.assigned - review.budget.spent < 0 ? 'neg' : 'pos'}>
                {formatCents(review.budget.assigned - review.budget.spent)}
              </strong>
            </span>
            <span>
              <span className="muted">Overspent</span>{' '}
              <strong className={review.budget.overspent.length ? 'warn-text' : ''}>
                {review.budget.overspent.length} {review.budget.overspent.length === 1 ? 'category' : 'categories'}
              </strong>
            </span>
          </div>
          {review.budget.overspent.length === 0 ? (
            <p className="muted">Nothing overspent.</p>
          ) : (
            <table className="grid review-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th className="num">Assigned</th>
                  <th className="num">Spent</th>
                  <th className="num">Available</th>
                </tr>
              </thead>
              <tbody>
                {review.budget.overspent.map((r) => (
                  <tr key={r.category.id}>
                    <td>
                      <Link to={trendPath({ kind: 'category', id: r.category.id })}>{r.category.name}</Link>
                    </td>
                    <td className="num">{formatCents(r.assigned)}</td>
                    <td className="num">{formatCents(-r.activity)}</td>
                    <td className="num neg">{formatCents(r.available)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {review.missing.length > 0 && (
          <section className="card">
            <h3>Usual spending not seen yet</h3>
            <p className="muted">
              Categories with nothing {review.current ? `through the ${ordinal(review.throughDay)}` : 'this month'} that had spending by then in most recent months.
              Often a bill that has not posted, or a sync that did not run.
            </p>
            <ul className="movers">
              {review.missing.map((m) => (
                <li key={m.category.id}>
                  <Link className="mover-name" to={trendPath({ kind: 'category', id: m.category.id })}>
                    {m.category.name}
                  </Link>
                  <span className="muted">
                    usually {formatCents(m.usual)}
                    {review.current && ` by the ${ordinal(review.throughDay)}`}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="card">
          <h3>Largest transactions</h3>
          {review.largest.length === 0 ? (
            <p className="muted">Nothing spent yet.</p>
          ) : (
            <table className="grid review-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Payee</th>
                  <th>Category</th>
                  <th>Account</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {review.largest.map((t) => (
                  <tr key={t.id}>
                    <td className="muted">{t.date}</td>
                    <td>{t.payee ? <Link to={trendPath({ kind: 'payee', name: t.payee })}>{t.payee}</Link> : <span className="muted">No payee</span>}</td>
                    <td>
                      {t.categoryId ? (
                        <Link to={trendPath({ kind: 'category', id: t.categoryId })}>{categoryName(t.categoryId)}</Link>
                      ) : (
                        <span className="warn-text">Uncategorized</span>
                      )}
                    </td>
                    <td>
                      <Link to={`/app/accounts/${t.accountId}`}>{accountName.get(t.accountId)}</Link>
                    </td>
                    <td className="num">{formatCents(t.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </>
  )
}

function PaceCard({ pace, throughDay }: { pace: Pace; throughDay: number }) {
  const [byGroup, setByGroup] = useState(false)
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set())
  const toggleGroup = (id: string) => {
    const next = new Set(openGroups)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setOpenGroups(next)
  }
  const scale = Math.max(1, pace.projected, pace.averageMonth)
  const over = pace.averageMonth > 0 && pace.projected > pace.averageMonth
  // One scale for every row so the bars compare across groups and categories.
  const rowScale = Math.max(1, ...pace.groups.flatMap((g) => [g.projected, g.averageMonth]))
  return (
    <section className="card">
      <h3>Pace</h3>
      <p className="pace-headline">
        On pace for <strong className={over ? 'neg' : 'pos'}>{formatCents(pace.projected)}</strong> living spending
        {pace.averageMonth > 0 && (
          <>
            , against an average month of <strong>{formatCents(pace.averageMonth)}</strong>
          </>
        )}
        . {pace.daysLeft} {pace.daysLeft === 1 ? 'day' : 'days'} left.
      </p>
      <PaceBar figures={{ soFar: pace.livingSoFar, projected: pace.projected, averageMonth: pace.averageMonth }} scale={scale} />
      <div className="pace-legend chart-legend">
        <span>
          <i className="swatch pace-swatch-spent" /> Spent so far {formatCents(pace.livingSoFar)}
        </span>
        <span>
          <i className="swatch pace-swatch-projected" /> Projected
        </span>
        {pace.averageMonth > 0 && (
          <span>
            <i className="swatch swatch-average" /> Average month
          </span>
        )}
      </div>
      <p className="muted">
        The projection adds what each category usually spends after the {ordinal(throughDay)} in earlier months, so a rent payment on the 1st does not get
        counted twice and a bill due later is not missed.
      </p>
      {pace.groups.length > 0 && (
        <>
          <button type="button" className={`link toggle pace-toggle ${byGroup ? 'open' : ''}`} onClick={() => setByGroup(!byGroup)}>
            <span className="chevron" /> By group
          </button>
          {byGroup && (
            <table className="grid review-table pace-table">
              <thead>
                <tr>
                  <th>Group</th>
                  <th />
                  <th className="num">So far</th>
                  <th className="num">Projected</th>
                  <th className="num">Average</th>
                </tr>
              </thead>
              {pace.groups.map((g) => (
                <tbody key={g.group.id}>
                  <tr className={`group-row ${openGroups.has(g.group.id) ? '' : 'collapsed'}`} onClick={() => toggleGroup(g.group.id)}>
                    <th>
                      <span className="chevron">▾</span> {g.group.name}
                    </th>
                    <PaceCells figures={g} scale={rowScale} header />
                  </tr>
                  {openGroups.has(g.group.id) &&
                    g.categories.map((c) => (
                      <tr key={c.category.id}>
                        <td className="pace-category">
                          <Link to={trendPath({ kind: 'category', id: c.category.id })}>{c.category.name}</Link>
                        </td>
                        <PaceCells figures={c} scale={rowScale} />
                      </tr>
                    ))}
                </tbody>
              ))}
            </table>
          )}
        </>
      )}
    </section>
  )
}

/** The bar and three figures of one row; group rows are header cells like the other grids. */
function PaceCells({ figures, scale, header = false }: { figures: PaceFigures; scale: number; header?: boolean }) {
  const over = figures.averageMonth > 0 && figures.projected > figures.averageMonth
  const Cell = header ? 'th' : 'td'
  return (
    <Fragment>
      <Cell className="pace-cell">
        <PaceBar figures={figures} scale={scale} />
      </Cell>
      <Cell className="num">{formatCents(figures.soFar)}</Cell>
      <Cell className={`num ${over ? 'neg' : ''}`}>{formatCents(figures.projected)}</Cell>
      <Cell className="num muted">{formatCents(figures.averageMonth)}</Cell>
    </Fragment>
  )
}

function PaceBar({ figures, scale }: { figures: PaceFigures; scale: number }) {
  const over = figures.averageMonth > 0 && figures.projected > figures.averageMonth
  return (
    <div className="pace-bar" title={`${formatCents(figures.soFar)} spent so far`}>
      <div className="pace-spent" style={{ width: `${(100 * figures.soFar) / scale}%` }} />
      <div className={`pace-projected ${over ? 'over' : ''}`} style={{ width: `${(100 * figures.projected) / scale}%` }} />
      {figures.averageMonth > 0 && <div className="pace-average" style={{ left: `${(100 * figures.averageMonth) / scale}%` }} />}
    </div>
  )
}

function MoneyStat({
  label,
  h,
  prevLabel,
  avgLabel,
  upIsGood = false,
  signed = false,
}: {
  label: string
  h: Headline
  prevLabel: string
  avgLabel: string
  upIsGood?: boolean
  signed?: boolean
}) {
  return (
    <div className="stat">
      <span className="muted">{label}</span>
      <strong className={signed ? (h.value < 0 ? 'neg' : 'pos') : ''}>{formatCents(h.value)}</strong>
      <Delta label={prevLabel} good={upIsGood ? h.vsPrev > 0 : h.vsPrev < 0} zero={h.vsPrev === 0}>
        {arrow(h.vsPrev)} {formatCents(Math.abs(h.vsPrev))}
      </Delta>
      <Delta label={avgLabel} good={upIsGood ? h.vsAverage > 0 : h.vsAverage < 0} zero={h.vsAverage === 0}>
        {arrow(h.vsAverage)} {formatCents(Math.abs(h.vsAverage))}
      </Delta>
    </div>
  )
}

function RateStat({ label, h, prevLabel, avgLabel }: { label: string; h: RateHeadline; prevLabel: string; avgLabel: string }) {
  const points = (r: number) => `${arrow(r)} ${Math.abs(Math.round(r * 100))} pts`
  return (
    <div className="stat">
      <span className="muted">{label}</span>
      <strong className={h.value !== null && h.value < 0 ? 'neg' : ''}>{h.value === null ? '—' : `${Math.round(h.value * 100)}%`}</strong>
      <Delta label={prevLabel} good={(h.vsPrev ?? 0) > 0} zero={h.vsPrev === null || Math.round(h.vsPrev * 100) === 0}>
        {h.vsPrev === null ? '—' : points(h.vsPrev)}
      </Delta>
      <Delta label={avgLabel} good={(h.vsAverage ?? 0) > 0} zero={h.vsAverage === null || Math.round(h.vsAverage * 100) === 0}>
        {h.vsAverage === null ? '—' : points(h.vsAverage)}
      </Delta>
    </div>
  )
}

function Delta({ label, good, zero, children }: { label: string; good: boolean; zero: boolean; children: React.ReactNode }) {
  return (
    <span className={`stat-delta ${zero ? 'muted' : good ? 'soft-pos' : 'soft-neg'}`}>
      <span className="stat-delta-label">{label}</span> {zero ? '—' : children}
    </span>
  )
}

const arrow = (v: number) => (v > 0 ? '▲' : v < 0 ? '▼' : '')

function ordinal(n: number): string {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'] as const)[n % 10] ?? 'th'
  return `${n}${suffix}`
}
