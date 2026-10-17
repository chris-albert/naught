import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { BalanceLine } from '../components/BalanceLine'
import { ReportsNav } from '../components/ReportsNav'
import { addDays, balanceHistory } from '../model/accountBalances'
import { currentDate } from '../model/dates'
import { formatCents } from '../model/money'
import type { Account, BudgetFile, Cents } from '../model/types'
import { useBudget } from '../store/budgetStore'

const RANGES: [number, string][] = [
  [30, '30 days'],
  [90, '90 days'],
  [180, '6 months'],
  [365, '1 year'],
]

/** The Accounts report, scrolled to one account's card, for links from elsewhere. */
export const accountBalancesPath = (accountId: string) => `/app/reports/accounts#${encodeURIComponent(accountId)}`

/** Every account's balance at the end of each day in the range, one chart per account. */
export function AccountBalancesPage() {
  const file = useBudget((s) => s.file)!
  const { hash } = useLocation()
  const [days, setDays] = useState(90)
  const open = file.accounts.filter((a) => !a.closed)
  const closed = file.accounts.filter((a) => a.closed)
  const today = currentDate()
  const from = addDays(today, 1 - days)

  // Coming from an account page: scroll that account's card into view.
  useEffect(() => {
    if (!hash) return
    document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView({ block: 'start' })
  }, [hash])

  return (
    <>
      <header className="page-header">
        <h2>Reports</h2>
        <ReportsNav />
        <div className="segmented">
          {RANGES.map(([n, label]) => (
            <button key={n} className={days === n ? 'on' : ''} onClick={() => setDays(n)}>
              {label}
            </button>
          ))}
        </div>
      </header>
      <div className="page-body">
        {file.accounts.length === 0 && <p className="muted">No accounts yet.</p>}
        {open.map((a) => (
          <AccountCard key={a.id} file={file} account={a} from={from} to={today} days={days} />
        ))}
        {closed.map((a) => (
          <AccountCard key={a.id} file={file} account={a} from={from} to={today} days={days} />
        ))}
      </div>
    </>
  )
}

function AccountCard({ file, account, from, to, days }: { file: BudgetFile; account: Account; from: string; to: string; days: number }) {
  const history = useMemo(() => balanceHistory(file, account.id, from, to), [file, account.id, from, to])
  return (
    <section className="card" id={account.id}>
      <h3>
        {account.name}
        {account.closed && <span className="tag">closed</span>}{' '}
        <Link className="bank-link" to={`/app/accounts/${account.id}`}>
          transactions ↗
        </Link>
      </h3>
      <div className="stat-row">
        <Stat label="Balance" value={history.balance} />
        <Stat label={`Change · ${days} days`} value={history.change} signed />
        <Stat label="Lowest" value={history.low} />
        <Stat label="Highest" value={history.high} />
      </div>
      <BalanceLine points={history.points} />
    </section>
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
