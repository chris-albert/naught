import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { RateLine } from '../components/RateLine'
import { ReportsNav } from '../components/ReportsNav'
import { SmoothedBars } from '../components/SmoothedBars'
import { Sparkline } from '../components/Sparkline'
import { addMonths, currentMonth, formatMonth, shortMonth } from '../model/dates'
import { sinceFirstActivity } from '../model/ledger'
import { formatCents } from '../model/money'
import { buildReport, monthRange } from '../model/reports'
import { trendPath } from '../model/trend'
import { categoryDirections, planVsActual, rollingAverage, sameMonthLastYear, savingsRateByMonth, type CategoryDirection, type Comparison } from '../model/trends'
import type { Cents } from '../model/types'
import { useBudget } from '../store/budgetStore'

const RANGES = [12, 24, 36]
const DIRECTION_LIMIT = 8

/** How the budget is moving over time: savings rate, smoothed spending, category direction, a year-over-year month, and plan against actual. */
export function TrendsPage() {
  const file = useBudget((s) => s.file)!
  const [count, setCount] = useState(12)
  const [compareMonth, setCompareMonth] = useState(() => addMonths(currentMonth(), -1))
  const months = useMemo(() => sinceFirstActivity(file, monthRange(currentMonth(), count)), [file, count])
  const report = useMemo(() => buildReport(file, months, new Date().getDate()), [file, months])
  const rates = useMemo(() => savingsRateByMonth(report.summaries), [report])
  const rollingRates = useMemo(() => rollingAverage3(rates), [rates])
  const living = useMemo(() => report.summaries.map((s) => s.living), [report])
  const rollingLiving = useMemo(() => rollingAverage(living), [living])
  const rollingIncome = useMemo(() => rollingAverage(report.summaries.map((s) => s.income)), [report])
  const directions = useMemo(() => categoryDirections(report), [report])
  const rising = directions.filter((d) => d.shift > 0).slice(0, DIRECTION_LIMIT)
  const falling = directions.filter((d) => d.shift < 0).slice(0, DIRECTION_LIMIT)
  const yoy = useMemo(() => sameMonthLastYear(file, compareMonth), [file, compareMonth])
  const plan = useMemo(() => planVsActual(file, months), [file, months])
  const half = Math.floor(months.length / 2)

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
          <h3>Savings rate by month</h3>
          <p className="muted">The share of each month's income not spent on living. The dashed line smooths it over three months.</p>
          <RateLine months={months} rates={rates} rolling={rollingRates} />
        </section>

        <section className="card">
          <h3>Living spending, smoothed</h3>
          <p className="muted">Each month's living spending against its three-month average, so one big month does not read as a trend.</p>
          <SmoothedBars months={months} living={living} rollingLiving={rollingLiving} rollingIncome={rollingIncome} />
        </section>

        <section className="card">
          <h3>Where spending is heading</h3>
          <p className="muted">
            Each living category's average over the last {half} months against its average over the {months.length - half} before them.
          </p>
          <div className="direction-grid">
            <DirectionTable title="Rising" rows={rising} />
            <DirectionTable title="Falling" rows={falling} />
          </div>
        </section>

        <section className="card">
          <h3>Same month last year</h3>
          <div className="month-nav yoy-nav">
            <Link to="#" onClick={(e) => (e.preventDefault(), setCompareMonth(addMonths(compareMonth, -1)))}>
              ‹
            </Link>
            <h2>{formatMonth(compareMonth)}</h2>
            <Link to="#" onClick={(e) => (e.preventDefault(), setCompareMonth(addMonths(compareMonth, 1)))}>
              ›
            </Link>
          </div>
          {!yoy.hasLastYear && <p className="muted">Nothing recorded for {formatMonth(yoy.lastYear)}, so there is nothing to compare against.</p>}
          <table className="grid report yoy">
            <thead>
              <tr>
                <th></th>
                <th className="num">{shortMonth(yoy.month)}</th>
                <th className="num">{shortMonth(yoy.lastYear)}</th>
                <th className="num">Change</th>
              </tr>
            </thead>
            <tbody>
              <TotalRow label="Income" c={yoy.totals.income} upIsGood />
              <TotalRow label="Living spending" c={yoy.totals.living} />
              <TotalRow label="Net" c={yoy.totals.net} upIsGood signed />
            </tbody>
            {yoy.categories.length > 0 && (
              <tbody>
                {yoy.categories.map((c) => (
                  <tr key={c.category.id}>
                    <td>
                      <Link to={trendPath({ kind: 'category', id: c.category.id })}>{c.category.name}</Link>
                      {c.category.reserve && <span className="tag">reserve</span>}
                    </td>
                    <td className="num">{cell(c.now)}</td>
                    <td className="num">{cell(c.before)}</td>
                    <td className="num">{change(c.change, false)}</td>
                  </tr>
                ))}
              </tbody>
            )}
          </table>
        </section>

        <section className="card">
          <h3>Plan vs actual</h3>
          <p className="muted">What was assigned to living categories each month against what they spent, and how many ended the month overspent.</p>
          <table className="grid report">
            <thead>
              <tr>
                <th></th>
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
              <PlanRow label="Assigned" values={plan.map((p) => p.assigned)} />
              <PlanRow label="Spent" values={plan.map((p) => p.spent)} />
              <PlanRow label="Difference" values={plan.map((p) => p.difference)} signed />
              <tr className="total-row">
                <th>Overspent categories</th>
                {plan.map((p) => (
                  <td key={p.month} className={`num ${p.overspent ? 'warn-text' : ''}`}>
                    {p.overspent || <span className="muted">–</span>}
                  </td>
                ))}
                <td className="num">{Math.round((plan.reduce((t, p) => t + p.overspent, 0) / Math.max(1, plan.length)) * 10) / 10}</td>
                <td className="num">{plan.reduce((t, p) => t + p.overspent, 0)}</td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>
    </>
  )
}

function DirectionTable({ title, rows }: { title: string; rows: CategoryDirection[] }) {
  return (
    <div>
      <h4>{title}</h4>
      {rows.length === 0 ? (
        <p className="muted">Nothing here.</p>
      ) : (
        <table className="grid direction">
          <thead>
            <tr>
              <th>Category</th>
              <th></th>
              <th className="num">Earlier</th>
              <th className="num">Recent</th>
              <th className="num">Change</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.category.id}>
                <td>
                  <Link to={trendPath({ kind: 'category', id: d.category.id })}>{d.category.name}</Link>
                </td>
                <td className="spark">
                  <Sparkline values={d.byMonth} />
                </td>
                <td className="num">{formatCents(d.earlierAvg)}</td>
                <td className="num">{formatCents(d.recentAvg)}</td>
                <td className="num">
                  {change(d.shift, false)}
                  {d.pct !== null && <span className="muted pct"> {Math.round(Math.abs(d.pct) * 100)}%</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function TotalRow({ label, c, upIsGood = false, signed = false }: { label: string; c: Comparison; upIsGood?: boolean; signed?: boolean }) {
  const show = (v: Cents) => (v === 0 ? <span className="muted">–</span> : signed ? <span className={v < 0 ? 'soft-neg' : 'soft-pos'}>{formatCents(v)}</span> : formatCents(v))
  return (
    <tr className="total-row">
      <th>{label}</th>
      <td className="num">{show(c.now)}</td>
      <td className="num">{show(c.before)}</td>
      <td className="num">{change(c.change, upIsGood)}</td>
    </tr>
  )
}

function PlanRow({ label, values, signed = false }: { label: string; values: Cents[]; signed?: boolean }) {
  const total = values.reduce((t, v) => t + v, 0)
  const average = values.length ? Math.round(total / values.length) : 0
  const cls = (v: Cents) => (signed ? (v < 0 ? 'soft-neg' : v > 0 ? 'soft-pos' : '') : '')
  const show = (v: Cents) => (v === 0 ? <span className="muted">–</span> : formatCents(v))
  return (
    <tr className="total-row">
      <th>{label}</th>
      {values.map((v, i) => (
        <td key={i} className={`num ${cls(v)}`}>
          {show(v)}
        </td>
      ))}
      <td className={`num ${cls(average)}`}>{formatCents(average)}</td>
      <td className={`num ${cls(total)}`}>{formatCents(total)}</td>
    </tr>
  )
}

/** Rolling average over rates, skipping months with no rate. */
function rollingAverage3(rates: (number | null)[]): (number | null)[] {
  return rates.map((_, i) => {
    const window = rates.slice(Math.max(0, i - 2), i + 1).filter((r): r is number => r !== null)
    return window.length ? window.reduce((t, r) => t + r, 0) / window.length : null
  })
}

/** Money out as a plain number, net money in as a green "+" figure. */
const cell = (v: Cents) => (v === 0 ? <span className="muted">–</span> : v < 0 ? <span className="soft-pos">+{formatCents(-v)}</span> : formatCents(v))

/** A delta with an arrow; up is bad for spending, good for income and net. */
function change(v: Cents, upIsGood: boolean) {
  if (v === 0) return <span className="muted">—</span>
  const up = v > 0
  return (
    <span className={up === upIsGood ? 'soft-pos' : 'soft-neg'}>
      {up ? '▲' : '▼'} {formatCents(Math.abs(v))}
    </span>
  )
}
