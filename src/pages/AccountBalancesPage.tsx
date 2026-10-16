import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { BalanceLine } from '../components/BalanceLine'
import { ReportsNav } from '../components/ReportsNav'
import { addDays, balanceHistory } from '../model/accountBalances'
import { currentDate } from '../model/dates'
import { formatCents } from '../model/money'
import type { Cents } from '../model/types'
import { useBudget } from '../store/budgetStore'

const RANGES: [number, string][] = [
  [30, '30 days'],
  [90, '90 days'],
  [180, '6 months'],
  [365, '1 year'],
]

/** Where the Accounts report shows one account, for links from elsewhere. */
export const accountBalancesPath = (accountId: string) => `/app/reports/accounts?account=${encodeURIComponent(accountId)}`

/** One account's balance at the end of every day in the range. */
export function AccountBalancesPage() {
  const file = useBudget((s) => s.file)!
  const [params, setParams] = useSearchParams()
  const [days, setDays] = useState(90)
  const open = file.accounts.filter((a) => !a.closed)
  const closed = file.accounts.filter((a) => a.closed)
  const account = file.accounts.find((a) => a.id === params.get('account')) ?? open[0] ?? closed[0]
  const today = currentDate()
  const from = addDays(today, 1 - days)
  const history = useMemo(() => (account ? balanceHistory(file, account.id, from, today) : null), [file, account, from, today])

  return (
    <>
      <header className="page-header">
        <h2>Reports</h2>
        <ReportsNav />
        {account && (
          <select value={account.id} onChange={(e) => setParams({ account: e.target.value })} aria-label="Account">
            {open.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
            {closed.length > 0 && (
              <optgroup label="Closed">
                {closed.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        )}
        <div className="segmented">
          {RANGES.map(([n, label]) => (
            <button key={n} className={days === n ? 'on' : ''} onClick={() => setDays(n)}>
              {label}
            </button>
          ))}
        </div>
      </header>
      <div className="page-body">
        {!account || !history ? (
          <p className="muted">No accounts yet.</p>
        ) : (
          <>
            <div className="stat-row">
              <Stat label="Balance" value={history.balance} />
              <Stat label={`Change · ${days} days`} value={history.change} signed />
              <Stat label="Lowest" value={history.low} />
              <Stat label="Highest" value={history.high} />
            </div>
            <section className="card">
              <h3>
                {account.name} by day{' '}
                <Link className="bank-link" to={`/app/accounts/${account.id}`}>
                  transactions ↗
                </Link>
              </h3>
              <p className="muted">The account's balance at the end of each day: every transaction dated that day or earlier, cleared or not.</p>
              <BalanceLine points={history.points} />
            </section>
          </>
        )}
      </div>
    </>
  )
}

function Stat({ label, value, signed = false }: { label: string; value: Cents; signed?: boolean }) {
  return (
    <div className="stat">
      <span className="muted">{label}</span>
      <strong className={signed ? (value < 0 ? 'neg' : value > 0 ? 'pos' : '') : value < 0 ? 'neg' : ''}>
        {signed && value > 0 ? '+' : ''}
        {formatCents(value)}
      </strong>
    </div>
  )
}
