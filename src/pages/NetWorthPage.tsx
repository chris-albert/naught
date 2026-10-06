import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { NetWorthChart } from '../components/NetWorthChart'
import { ReportsNav } from '../components/ReportsNav'
import { addMonths, currentMonth, shortMonth } from '../model/dates'
import { sinceFirstActivity } from '../model/ledger'
import { formatCents } from '../model/money'
import { netWorthHistory, type AccountHistory } from '../model/netWorth'
import { monthRange } from '../model/reports'
import type { Cents } from '../model/types'
import { useBudget } from '../store/budgetStore'

const RANGES = [12, 24, 36]

/** Every account's month-end balance, on-budget and off, added up into a net worth line. */
export function NetWorthPage() {
  const file = useBudget((s) => s.file)!
  const [count, setCount] = useState<number | 'all'>(12)
  const now = currentMonth()
  const firstMonth = useMemo(() => netWorthHistory(file, [now]).firstMonth, [file, now])
  const months = useMemo(() => {
    const n = count === 'all' ? Math.max(1, monthsBetween(firstMonth ?? now, now) + 1) : count
    return sinceFirstActivity(file, monthRange(now, n))
  }, [file, count, firstMonth, now])
  const history = useMemo(() => netWorthHistory(file, months), [file, months])
  const last = history.summaries[history.summaries.length - 1]
  const onBudget = history.accounts.filter((a) => a.account.onBudget)
  const offBudget = history.accounts.filter((a) => !a.account.onBudget)

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
          <button className={count === 'all' ? 'on' : ''} onClick={() => setCount('all')}>
            All
          </button>
        </div>
      </header>
      <div className="page-body">
        <div className="stat-row">
          <Stat label="Net worth" value={history.net} />
          <Stat label={`Change · ${months.length} months`} value={history.change} signed />
          <Stat label="Change last month" value={history.changeLastMonth} signed />
          <Stat label="Assets" value={last.assets} />
          <Stat label="Debts" value={last.debts} />
        </div>

        <section className="card">
          <h3>Net worth by month</h3>
          <p className="muted">Every account's balance at the end of each month, budget and off-budget alike, with debts taken off.</p>
          {history.accounts.length === 0 ? <p className="muted">No transactions in this range.</p> : <NetWorthChart summaries={history.summaries} />}
        </section>

        {history.accounts.length > 0 && (
          <table className="grid report net-worth">
            <thead>
              <tr>
                <th>Account</th>
                {months.map((m) => (
                  <th key={m} className="num">
                    {shortMonth(m)}
                  </th>
                ))}
              </tr>
            </thead>
            {onBudget.length > 0 && <AccountGroup label="Budget accounts" rows={onBudget} />}
            {offBudget.length > 0 && <AccountGroup label="Off budget" rows={offBudget} />}
            <tbody>
              <TotalRow label="Assets" values={history.summaries.map((s) => s.assets)} />
              <TotalRow label="Debts" values={history.summaries.map((s) => -s.debts)} />
              <TotalRow label="Net worth" values={history.summaries.map((s) => s.net)} />
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}

function AccountGroup({ label, rows }: { label: string; rows: AccountHistory[] }) {
  const cols = rows[0].byMonth.length
  return (
    <tbody>
      <tr className="group-row">
        <th>{label}</th>
        {Array.from({ length: cols }, (_, i) => (
          <th key={i} className="num">
            {cell(rows.reduce((t, r) => t + r.byMonth[i], 0))}
          </th>
        ))}
      </tr>
      {rows.map((r) => (
        <tr key={r.account.id}>
          <td>
            <Link to={`/app/accounts/${r.account.id}`}>{r.account.name}</Link>
            {r.account.closed && <span className="tag">closed</span>}
          </td>
          {r.byMonth.map((v, i) => (
            <td key={i} className="num">
              {cell(v)}
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  )
}

function TotalRow({ label, values }: { label: string; values: Cents[] }) {
  return (
    <tr className="total-row">
      <th>{label}</th>
      {values.map((v, i) => (
        <td key={i} className="num">
          {cell(v)}
        </td>
      ))}
    </tr>
  )
}

function Stat({ label, value, signed = false }: { label: string; value: Cents; signed?: boolean }) {
  return (
    <div className="stat">
      <span className="muted">{label}</span>
      <strong className={signed ? (value < 0 ? 'neg' : value > 0 ? 'pos' : '') : ''}>
        {signed && value > 0 ? '+' : ''}
        {formatCents(value)}
      </strong>
    </div>
  )
}

const cell = (v: Cents) => (v === 0 ? <span className="muted">–</span> : <span className={v < 0 ? 'soft-neg' : ''}>{formatCents(v)}</span>)

function monthsBetween(from: string, to: string): number {
  let n = 0
  for (let m = from; m < to; m = addMonths(m, 1)) n++
  return n
}
