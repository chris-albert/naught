import { Fragment, useMemo, useState } from 'react'
import { CategoryTrend } from '../components/CategoryTrend'
import { CumulativeLine } from '../components/CumulativeLine'
import { MonthlyBars } from '../components/MonthlyBars'
import { currentMonth, formatMonth } from '../model/dates'
import { formatCents } from '../model/money'
import { buildReport, monthRange, type CategoryReport, type GroupReport, type MonthSummary } from '../model/reports'
import type { Cents } from '../model/types'
import { useBudget } from '../store/budgetStore'

const RANGES = [3, 6, 12, 24]

export function ReportsPage() {
  const file = useBudget((s) => s.file)!
  const updateCategory = useBudget((s) => s.updateCategory)
  const [count, setCount] = useState(12)
  const [showReserves, setShowReserves] = useState(false)
  const [includeReserves, setIncludeReserves] = useState(true)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [openCategory, setOpenCategory] = useState<string | null>(null)
  const months = useMemo(() => monthRange(currentMonth(), count), [count])
  const today = new Date().getDate()
  const report = useMemo(() => buildReport(file, months, today), [file, months, today])
  const groups = useMemo(() => (includeReserves ? report.groups : withoutReserves(report.groups)), [report, includeReserves])
  const summaries = useMemo(() => (includeReserves ? report.summaries : ignoringReserves(report.summaries)), [report, includeReserves])
  const last = summaries[summaries.length - 1]
  const avgNet = includeReserves ? report.avgNet : Math.round(summaries.reduce((t, s) => t + s.net, 0) / Math.max(1, summaries.length))
  const paymentIds = useMemo(() => new Set(file.accounts.map((a) => a.paymentCategoryId).filter(Boolean)), [file.accounts])
  const isPaymentCategory = (id: string) => paymentIds.has(id)

  const toggle = (id: string) => {
    const next = new Set(collapsed)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setCollapsed(next)
  }

  return (
    <>
      <header className="page-header">
        <h2>Reports</h2>
        <div className="segmented">
          {RANGES.map((n) => (
            <button key={n} className={count === n ? 'on' : ''} onClick={() => setCount(n)}>
              {n} months
            </button>
          ))}
        </div>
        <label className="muted">
          <input type="checkbox" checked={includeReserves} onChange={(e) => setIncludeReserves(e.target.checked)} /> show reserves
        </label>
      </header>
      <div className="page-body">
        <div className="stat-row">
          <Stat label="Avg monthly income" value={report.avgIncome} />
          <Stat label="Avg living spending" value={report.avgLiving} />
          {includeReserves && <Stat label="Avg set aside" value={report.avgSetAside} signed />}
          <Stat label="Avg monthly net" value={avgNet} signed />
          <div className="stat">
            <span className="muted">Savings rate</span>
            <strong className={report.savingsRate !== null && report.savingsRate < 0 ? 'neg' : ''}>
              {report.savingsRate === null ? '—' : `${Math.round(report.savingsRate * 100)}%`}
            </strong>
          </div>
          <div className="stat">
            <span className="muted">Uncategorized this month</span>
            <strong className={last.uncategorized ? 'warn-text' : ''}>{last.uncategorized}</strong>
          </div>
        </div>

        <section className="card">
          <h3>Income vs living spending</h3>
          <MonthlyBars summaries={summaries} />
          <CumulativeLine summaries={summaries} />
        </section>

        <section className="card">
          <h3>
            Reserve categories{' '}
            <button className="link" onClick={() => setShowReserves(!showReserves)}>
              {showReserves ? 'hide' : `${file.categories.filter((c) => c.reserve).length} marked · edit`}
            </button>
          </h3>
          <p className="muted">
            Reserves are sinking funds: vacation, buffer, investments. Money assigned to them counts as set aside in that
            month; spending from them later is a draw and does not count against that later month.
          </p>
          {showReserves && (
            <div className="reserve-grid">
              {file.categoryGroups.map((g) => {
                const cats = file.categories.filter((c) => c.groupId === g.id && !isPaymentCategory(c.id))
                if (cats.length === 0) return null
                return (
                  <div key={g.id} className="reserve-group">
                    <strong>{g.name}</strong>
                    {cats.map((c) => (
                      <label key={c.id}>
                        <input type="checkbox" checked={!!c.reserve} onChange={(e) => updateCategory(c.id, { reserve: e.target.checked })} /> {c.name}
                      </label>
                    ))}
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {report.movers.length > 0 && (
          <section className="card">
            <h3>Biggest swings so far in {formatMonth(last.month)}</h3>
            <p className="muted">
              Spending through the {ordinal(today)}, compared with each category's average through the {ordinal(today)} of the earlier months in this
              range.
            </p>
            <ul className="movers">
              {report.movers.map((c) => (
                <Mover key={c.category.id} c={c} />
              ))}
            </ul>
          </section>
        )}

        <table className="grid report">
          <thead>
            <tr>
              <th>Category</th>
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
            <SummaryRow label="Income" title="Income category plus money arriving directly in categories" values={summaries.map((s) => s.income)} />
            <SummaryRow label="Living spending" title="Net outflow from non-reserve categories" values={summaries.map((s) => s.living)} />
            {includeReserves && (
              <>
                <SummaryRow label="Set aside" title="Assigned to reserves plus inflows landing in them" values={summaries.map((s) => s.setAside)} signed />
                <SummaryRow label="Drawn from reserves" title="Spent out of reserve categories; already counted when set aside" values={summaries.map((s) => s.drawn)} />
              </>
            )}
            <SummaryRow label="Net" title={includeReserves ? 'Income − living − set aside' : 'Income − living'} values={summaries.map((s) => s.net)} signed />
            <SummaryRow label="Cumulative net" values={summaries.map((s) => s.cumulativeNet)} signed noTotals />
          </tbody>
          {groups.map((g) => {
            const max = Math.max(1, ...g.categories.flatMap((c) => c.byMonth))
            return (
              <tbody key={g.group.id}>
                <tr className={`group-row ${collapsed.has(g.group.id) ? 'collapsed' : ''}`} onClick={() => toggle(g.group.id)}>
                  <th>
                    <span className="chevron">▾</span> {g.group.name}
                  </th>
                  {g.byMonth.map((v, i) => (
                    <th key={months[i]} className="num">
                      {cell(v)}
                    </th>
                  ))}
                  <th className="num">{formatCents(g.average)}</th>
                  <th className="num">{formatCents(g.total)}</th>
                </tr>
                {!collapsed.has(g.group.id) &&
                  g.categories
                    .filter((c) => c.total !== 0)
                    .map((c) => (
                      <Fragment key={c.category.id}>
                        <tr
                          className={`category-row ${openCategory === c.category.id ? 'open' : ''}`}
                          onClick={() => setOpenCategory(openCategory === c.category.id ? null : c.category.id)}
                        >
                          <td>
                            <span className="chevron">▾</span> {c.category.name}
                            {c.category.reserve && <span className="tag">reserve</span>}
                          </td>
                          {c.byMonth.map((v, i) => (
                            <td key={months[i]} className="num heat" style={{ '--heat': v > 0 ? Math.min(1, v / max) : 0 } as React.CSSProperties}>
                              {cell(v)}
                            </td>
                          ))}
                          <td className="num">{formatCents(c.average)}</td>
                          <td className="num">{formatCents(c.total)}</td>
                        </tr>
                        {openCategory === c.category.id && <CategoryTrend report={c} months={months} />}
                      </Fragment>
                    ))}
              </tbody>
            )
          })}
        </table>
      </div>
    </>
  )
}

/** Month summaries as if reserves did not exist: nothing set aside or drawn, net is income minus living. */
function ignoringReserves(summaries: MonthSummary[]): MonthSummary[] {
  let cumulative = 0
  return summaries.map((s) => {
    const net = s.income - s.living
    cumulative += net
    return { ...s, setAside: 0, drawn: 0, net, cumulativeNet: cumulative }
  })
}

/** Drop reserve categories from each group and recompute the group totals from what is left. */
function withoutReserves(groups: GroupReport[]): GroupReport[] {
  return groups
    .map((g) => {
      const categories = g.categories.filter((c) => !c.category.reserve)
      const byMonth = g.byMonth.map((_, i) => categories.reduce((t, c) => t + c.byMonth[i], 0))
      const total = byMonth.reduce((t, v) => t + v, 0)
      return { ...g, categories, byMonth, total, average: byMonth.length ? Math.round(total / byMonth.length) : 0 }
    })
    .filter((g) => g.categories.length > 0)
}

function SummaryRow({
  label,
  title,
  values,
  signed = false,
  noTotals = false,
}: {
  label: string
  title?: string
  values: Cents[]
  signed?: boolean
  noTotals?: boolean
}) {
  const total = values.reduce((t, v) => t + v, 0)
  const average = values.length ? Math.round(total / values.length) : 0
  const cls = (v: Cents) => (signed ? (v < 0 ? 'soft-neg' : v > 0 ? 'soft-pos' : '') : '')
  const show = (v: Cents) => (v === 0 ? <span className="muted">–</span> : formatCents(v))
  return (
    <tr className="total-row">
      <th title={title}>{label}</th>
      {values.map((v, i) => (
        <td key={i} className={`num ${cls(v)}`}>
          {show(v)}
        </td>
      ))}
      <td className={`num ${cls(average)}`}>{noTotals ? '' : formatCents(average)}</td>
      <td className={`num ${cls(total)}`}>{noTotals ? '' : formatCents(total)}</td>
    </tr>
  )
}

function Stat({ label, value, signed = false }: { label: string; value: Cents; signed?: boolean }) {
  return (
    <div className="stat">
      <span className="muted">{label}</span>
      <strong className={signed ? (value < 0 ? 'neg' : 'pos') : ''}>{formatCents(value)}</strong>
    </div>
  )
}

function Mover({ c }: { c: CategoryReport }) {
  const up = c.deltaVsAverage > 0
  return (
    <li>
      <span className="mover-name">{c.category.name}</span>
      <span className={`mover-delta ${up ? 'soft-neg' : 'soft-pos'}`}>
        {up ? '▲' : '▼'} {formatCents(Math.abs(c.deltaVsAverage))}
      </span>
      <span className="muted">
        {formatCents(c.soFar)} vs {formatCents(c.soFarAverage)} avg
      </span>
    </li>
  )
}

/** Report cells: money out as a plain number, net money in as a green "+" figure. */
const cell = (v: Cents) =>
  v === 0 ? <span className="muted">–</span> : v < 0 ? <span className="soft-pos">+{formatCents(-v)}</span> : formatCents(v)

function ordinal(n: number): string {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'] as const)[n % 10] ?? 'th'
  return `${n}${suffix}`
}

function shortMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' })
}
