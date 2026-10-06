import type { CSSProperties, ReactNode } from 'react'

/**
 * Static renderings of the app for the landing page. They reuse the app's own
 * CSS classes so they look like the real thing in both themes, but they are
 * illustrations: nothing here is interactive.
 */

function Shot({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`shot ${className}`} aria-hidden="true">
      {children}
    </div>
  )
}

function Pill({ value, kind }: { value: string; kind: 'pos' | 'neg' | 'zero' }) {
  return <span className={`pill ${kind}`}>{value}</span>
}

/** The budget page: To budget, a couple of groups, and categories with their Available pills. */
export function BudgetShot() {
  return (
    <Shot className="shot-budget">
      <div className="shot-head">
        <div className="stat to-budget">
          <span className="muted">To budget</span>
          <strong>$184.50</strong>
        </div>
        <div className="month-nav">
          <span className="month-arrow">‹</span>
          <h3>October 2026</h3>
          <span className="month-arrow">›</span>
        </div>
      </div>
      <table className="grid budget">
        <thead>
          <tr>
            <th>Category</th>
            <th className="num">Assigned</th>
            <th className="num hide-narrow">Activity</th>
            <th className="num">Available</th>
          </tr>
        </thead>
        <tbody>
          <tr className="group-row">
            <th>
              <span className="chevron">▾</span> Bills
            </th>
            <th className="num">$2,035.00</th>
            <th className="num hide-narrow">−$1,849.99</th>
            <th className="num">$185.01</th>
          </tr>
          <tr className="category-row">
            <td>Rent</td>
            <td className="num">$1,650.00</td>
            <td className="num hide-narrow">−$1,650.00</td>
            <td className="num"><Pill value="$0.00" kind="zero" /></td>
          </tr>
          <tr className="category-row">
            <td>Electric</td>
            <td className="num">$120.00</td>
            <td className="num hide-narrow">−$74.99</td>
            <td className="num"><Pill value="$45.01" kind="pos" /></td>
          </tr>
          <tr className="group-row">
            <th>
              <span className="chevron">▾</span> Everyday
            </th>
            <th className="num">$1,085.00</th>
            <th className="num hide-narrow">−$781.98</th>
            <th className="num">$303.02</th>
          </tr>
          <tr className="category-row selected">
            <td>Groceries</td>
            <td className="num">$650.00</td>
            <td className="num hide-narrow">−$412.36</td>
            <td className="num"><Pill value="$237.64" kind="pos" /></td>
          </tr>
          <tr className="category-row">
            <td>Dining out</td>
            <td className="num">$300.00</td>
            <td className="num hide-narrow">−$318.40</td>
            <td className="num"><Pill value="−$18.40" kind="neg" /></td>
          </tr>
          <tr className="category-row">
            <td>Gas</td>
            <td className="num">$135.00</td>
            <td className="num hide-narrow">−$51.22</td>
            <td className="num"><Pill value="$83.78" kind="pos" /></td>
          </tr>
          <tr className="group-row">
            <th>
              <span className="chevron">▾</span> Goals
            </th>
            <th className="num">$1,750.00</th>
            <th className="num hide-narrow">–</th>
            <th className="num">$9,340.00</th>
          </tr>
          <tr className="category-row">
            <td>
              Vacation<span className="target-dot" />
            </td>
            <td className="num">$400.00</td>
            <td className="num hide-narrow">–</td>
            <td className="num"><Pill value="$2,400.00" kind="pos" /></td>
          </tr>
        </tbody>
      </table>
    </Shot>
  )
}

/** The category panel: month numbers, a monthly target with its progress, and the six-month trend. */
export function PanelShot() {
  const months = [
    { label: 'May', h: 78 },
    { label: 'Jun', h: 62 },
    { label: 'Jul', h: 91 },
    { label: 'Aug', h: 70 },
    { label: 'Sep', h: 84 },
    { label: 'Oct', h: 48, active: true },
  ]
  return (
    <Shot className="shot-panel">
      <div className="slideover-head">
        <div>
          <h3>Groceries</h3>
          <span className="muted">Everyday · Spending over time ›</span>
        </div>
        <span className="muted close">×</span>
      </div>
      <section className="slideover-stats">
        <div>
          <span className="muted">Assigned</span>
          <strong>$552.50</strong>
        </div>
        <div>
          <span className="muted">Activity</span>
          <strong>−$412.36</strong>
        </div>
        <div>
          <span className="muted">Available</span>
          <strong className="pos">$140.14</strong>
        </div>
      </section>
      <section>
        <h4>Monthly target</h4>
        <div className="target-row">
          <span className="faux-input num">$650.00</span>
          <span className="muted small">Clear</span>
        </div>
        <div className="target-bar under">
          <span style={{ width: '85%' }} />
        </div>
        <p className="warn-text">$97.50 to go this month.</p>
        <div className="target-actions">
          <span className="faux-button">Assign $97.50</span>
          <span className="muted">from To budget</span>
        </div>
      </section>
      <section className="panel-trend">
        <h4>Last 6 months</h4>
        <div className="panel-trend-columns">
          {months.map((m) => (
            <div key={m.label}>
              <div className="trend-plot" style={{ height: 72 }}>
                <div className="trend-line target" style={{ bottom: '82%' }} />
                <div className={`trend-bar out ${m.active ? '' : 'dim'}`} style={{ bottom: 0, height: `${m.h}%` }} />
              </div>
              <span className={m.active ? 'active' : 'muted'}>{m.label}</span>
            </div>
          ))}
        </div>
        <div className="trend-legend">
          <span>
            <i className="swatch swatch-target" /> Target $650
          </span>
          <span>
            <i className="swatch series-spending" /> Spent
          </span>
        </div>
      </section>
    </Shot>
  )
}

/** An account's transactions: a row waiting for a category, a payee rule offer, a split, a transfer, and the hotkeys. */
export function TransactionsShot() {
  return (
    <Shot className="shot-transactions">
      <div className="shot-head">
        <h3>Visa</h3>
        <span className="muted">
          <span className="bank-link">Open bank site ↗</span>
        </span>
        <span className="badge" style={{ marginLeft: 'auto' }}>
          3
        </span>
      </div>
      <table className="grid">
        <thead>
          <tr>
            <th className="hide-narrow">Date</th>
            <th>Payee</th>
            <th>Category</th>
            <th className="num">Amount</th>
            <th className="hide-narrow" />
          </tr>
        </thead>
        <tbody>
          <tr className="uncategorized selected">
            <td className="muted hide-narrow">Oct 4</td>
            <td>Whole Foods</td>
            <td>
              <span className="picker-button needs-category">Pick a category</span>
            </td>
            <td className="num neg">−$87.34</td>
            <td className="muted hide-narrow"></td>
          </tr>
          <tr>
            <td className="muted hide-narrow">Oct 3</td>
            <td>Netflix</td>
            <td>Fun money</td>
            <td className="num neg">−$15.49</td>
            <td className="muted hide-narrow">✓</td>
          </tr>
          <tr className="rule-suggestion">
            <td colSpan={5}>
              <span className="muted">Always use Fun money for Netflix?</span>
              <span className="faux-button small">Yes</span>
              <span className="muted">No</span>
            </td>
          </tr>
          <tr>
            <td className="muted hide-narrow">Oct 1</td>
            <td>Costco</td>
            <td>
              <span className="muted">Split</span>
            </td>
            <td className="num neg">−$142.10</td>
            <td className="muted hide-narrow">✓</td>
          </tr>
          <tr className="split-line">
            <td className="hide-narrow" />
            <td className="muted split-lead">↳</td>
            <td>Groceries</td>
            <td className="num neg">−$98.60</td>
            <td className="hide-narrow" />
          </tr>
          <tr className="split-line">
            <td className="hide-narrow" />
            <td className="muted split-lead">↳</td>
            <td>Household</td>
            <td className="num neg">−$43.50</td>
            <td className="hide-narrow" />
          </tr>
          <tr>
            <td className="muted hide-narrow">Sep 30</td>
            <td>Transfer: Checking</td>
            <td>
              <span className="muted">Transfer: Checking</span>
            </td>
            <td className="num pos">$1,200.00</td>
            <td className="muted hide-narrow">🔒</td>
          </tr>
        </tbody>
      </table>
      <p className="muted hotkeys">
        <kbd>j</kbd>/<kbd>k</kbd> move · <kbd>c</kbd> category · <kbd>p</kbd> payee · <kbd>s</kbd> split · <kbd>⌫</kbd> delete
      </p>
    </Shot>
  )
}

/** Reconciliation: the bank's balance against cleared, and the sidebar dots that summarise it. */
export function ReconcileShot() {
  return (
    <Shot className="shot-reconcile">
      <div className="card reconcile ok">
        <div className="reconcile-row">
          <div className="stat">
            <span className="muted">Bank balance · today</span>
            <strong>$4,812.40</strong>
          </div>
          <div className="stat">
            <span className="muted">Cleared in Naught</span>
            <strong>$4,812.40</strong>
          </div>
          <div className="stat to-budget">
            <span className="muted">Difference</span>
            <strong>$0.00</strong>
          </div>
          <div className="reconcile-actions">
            <span className="faux-button">Lock cleared</span>
          </div>
        </div>
      </div>
      <div className="card reconcile off">
        <div className="reconcile-row">
          <div className="stat">
            <span className="muted">Bank balance · today</span>
            <strong>−$612.31</strong>
          </div>
          <div className="stat">
            <span className="muted">Cleared in Naught</span>
            <strong>−$588.51</strong>
          </div>
          <div className="stat to-budget over">
            <span className="muted">Difference</span>
            <strong>−$23.80</strong>
          </div>
        </div>
        <div className="reconcile-details">
          <div>
            <h4>Uncleared</h4>
            <p className="muted">Still pending at the bank; it explains the gap.</p>
            <ul className="explain-list">
              <li>
                <span className="muted">Oct 4</span>
                <span>Uber</span>
                <span className="num neg">−$23.80</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
      <div className="shot-sidebar">
        <h2>Budget accounts</h2>
        <div className="account-link">
          <span>
            <i className="recon-dot ok" />
            Checking
          </span>
          <span className="num">$4,812.40</span>
        </div>
        <div className="account-link">
          <span>
            <i className="recon-dot ok" />
            Savings
          </span>
          <span className="num">$9,340.00</span>
        </div>
        <div className="account-link">
          <span>
            <i className="recon-dot off" />
            Visa
          </span>
          <span className="num">−$588.51</span>
        </div>
      </div>
    </Shot>
  )
}

/** Reports: the headline figures and the income vs living spending chart with its net line. */
export function ReportsShot() {
  // Six months of made-up figures, in dollars.
  const months = ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct']
  const income = [5200, 5200, 5200, 5650, 5200, 5200]
  const spending = [3310, 3580, 3190, 3720, 3420, 2140]
  const W = 600
  const H = 190
  const base = 160
  const top = 16
  const scale = (base - top) / 6000
  const colW = W / months.length
  const barW = 26
  let running = 0
  const net = income.map((v, i) => {
    running += v - spending[i]
    return running
  })
  const netMax = Math.max(...net)
  const netY = (v: number) => base - (v / netMax) * (base - top - 20)
  const netPoints = net.map((v, i) => `${colW * i + colW / 2},${netY(v)}`).join(' ')

  return (
    <Shot className="shot-reports">
      <div className="stat-row">
        <div className="stat">
          <span className="muted">Avg monthly income</span>
          <strong className="pos">$5,275.00</strong>
        </div>
        <div className="stat">
          <span className="muted">Avg living spending</span>
          <strong>$3,226.67</strong>
        </div>
        <div className="stat">
          <span className="muted">Savings rate</span>
          <strong>39%</strong>
        </div>
        <div className="stat">
          <span className="muted">Monthly targets</span>
          <strong>$4,980.00</strong>
          <span className="muted">94% of income</span>
        </div>
      </div>
      <div className="card" style={{ margin: 0 }}>
        <h3>Income vs living spending</h3>
        <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`}>
          {[0.25, 0.5, 0.75].map((f) => (
            <line key={f} className="chart-grid" x1={0} x2={W} y1={base - f * (base - top)} y2={base - f * (base - top)} />
          ))}
          <line className="chart-baseline" x1={0} x2={W} y1={base} y2={base} />
          {months.map((m, i) => {
            const x = colW * i + colW / 2
            const ih = income[i] * scale
            const sh = spending[i] * scale
            return (
              <g key={m}>
                <rect className="chart-bar series-income" x={x - barW - 2} y={base - ih} width={barW} height={ih} rx={3} />
                <rect className="chart-bar series-spending" x={x + 2} y={base - sh} width={barW} height={sh} rx={3} />
                <text className={`chart-axis ${i === months.length - 1 ? 'active' : ''}`} x={x} y={H - 4} textAnchor="middle">
                  {m}
                </text>
              </g>
            )
          })}
          <polyline className="series-net-halo" points={netPoints} />
          <polyline className="series-net-line" points={netPoints} />
          {net.map((v, i) => (
            <circle key={i} className="series-net-dot" cx={colW * i + colW / 2} cy={netY(v)} r={3.5} />
          ))}
        </svg>
        <div className="chart-legend">
          <span>
            <i className="swatch series-income" /> Income
          </span>
          <span>
            <i className="swatch series-spending" /> Living spending
          </span>
          <span>
            <i className="swatch series-net" /> Cumulative net
          </span>
        </div>
      </div>
    </Shot>
  )
}

/** The drill-down page for one category: the shift, and a payee breakdown with heat-shaded months. */
export function TrendShot() {
  const months = ['Jun', 'Jul', 'Aug', 'Sep', 'Oct']
  const rows: { name: string; count: number; values: number[] }[] = [
    { name: "Trader Joe's", count: 12, values: [168, 121, 190, 155, 88] },
    { name: 'Costco', count: 5, values: [0, 236, 0, 198, 99] },
    { name: 'Safeway', count: 8, values: [112, 74, 88, 60, 62] },
    { name: 'Berkeley Bowl', count: 4, values: [58, 0, 71, 0, 48] },
  ]
  // On a phone only the last three months fit.
  const narrow = (i: number) => (i < months.length - 3 ? 'hide-narrow' : '')
  const max = Math.max(...rows.flatMap((r) => r.values))
  const fmt = (v: number) => (v === 0 ? <span className="muted">–</span> : `$${v.toFixed(2)}`)
  return (
    <Shot className="shot-trend">
      <div className="shot-head" style={{ alignItems: 'flex-start', flexDirection: 'column', gap: 2 }}>
        <div className="breadcrumb muted">Reports › Everyday ›</div>
        <h3>Groceries</h3>
      </div>
      <div className="stat-row">
        <div className="stat">
          <span className="muted">Average</span>
          <strong>$448.17</strong>
          <span className="muted">per month</span>
        </div>
        <div className="stat">
          <span className="muted">Recent vs earlier</span>
          <strong className="pos">−$41.30</strong>
          <span className="muted">per month</span>
        </div>
        <div className="stat">
          <span className="muted">Transactions</span>
          <strong>34</strong>
        </div>
      </div>
      <table className="grid report">
        <thead>
          <tr>
            <th>By payee</th>
            {months.map((m, i) => (
              <th key={m} className={`num ${narrow(i)}`}>
                {m}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <td>
                {r.name}
                <span className="muted count"> · {r.count}</span>
              </td>
              {r.values.map((v, i) => (
                <td key={i} className={`num heat ${narrow(i)}`} style={{ '--heat': v > 0 ? v / max : 0 } as CSSProperties}>
                  {fmt(v)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Shot>
  )
}

/** The budget on a phone, with the bottom sheet for a category, and a Drive-backed file. */
export function PhoneShot() {
  return (
    <div className="phone" aria-hidden="true">
      <div className="topbar">
        <span className="icon-button menu">☰</span>
        <img src="/icon.svg" alt="" className="brand-icon" />
        <span className="brand">Household</span>
      </div>
      <div className="phone-stats">
        <div className="stat to-budget">
          <span className="muted">To budget</span>
          <strong>$184.50</strong>
        </div>
        <div className="stat">
          <span className="muted">Oct 2026</span>
          <strong>‹ ›</strong>
        </div>
      </div>
      <table className="grid budget">
        <tbody>
          <tr className="group-row">
            <th>
              <span className="chevron">▾</span> Everyday
            </th>
            <th className="num">$303.02</th>
          </tr>
          <tr className="category-row">
            <td>Groceries</td>
            <td className="num"><Pill value="$237.64" kind="pos" /></td>
          </tr>
          <tr className="category-row">
            <td>Dining out</td>
            <td className="num"><Pill value="−$18.40" kind="neg" /></td>
          </tr>
          <tr className="category-row">
            <td>Gas</td>
            <td className="num"><Pill value="$83.78" kind="pos" /></td>
          </tr>
        </tbody>
      </table>
      <div className="phone-sheet">
        <div className="slideover-head">
          <div>
            <h3>Dining out</h3>
            <span className="muted">Everyday</span>
          </div>
        </div>
        <section className="slideover-stats">
          <div>
            <span className="muted">Assigned</span>
            <strong>$300.00</strong>
          </div>
          <div>
            <span className="muted">Activity</span>
            <strong>−$318.40</strong>
          </div>
          <div>
            <span className="muted">Available</span>
            <strong className="neg">−$18.40</strong>
          </div>
        </section>
        <div className="target-actions">
          <span className="faux-button small">Cover $18.40</span>
          <span className="muted">from Fun money</span>
        </div>
      </div>
      <div className="phone-save">
        <span className="save-dot" /> Saved to Google Drive · Household.json
      </div>
    </div>
  )
}
