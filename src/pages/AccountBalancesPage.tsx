import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { BalanceHistoryStats, RangePicker } from '../components/BalanceHistoryCard'
import { ReportsNav } from '../components/ReportsNav'
import { addDays } from '../model/accountBalances'
import { currentDate } from '../model/dates'
import { useBudget } from '../store/budgetStore'

/** The Accounts report, scrolled to one account's card, for links from elsewhere. */
export const accountBalancesPath = (accountId: string) => `/app/reports/accounts#${encodeURIComponent(accountId)}`

/** Every open account's balance at the end of each day in the range, one chart per account. */
export function AccountBalancesPage() {
  const file = useBudget((s) => s.file)!
  const { hash } = useLocation()
  const [days, setDays] = useState(90)
  const open = file.accounts.filter((a) => !a.closed)
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
        <RangePicker days={days} onChange={setDays} />
      </header>
      <div className="page-body">
        {open.length === 0 && <p className="muted">No open accounts.</p>}
        {open.map((a) => (
          <section key={a.id} className="card" id={a.id}>
            <h3>
              {a.name}{' '}
              <Link className="bank-link" to={`/app/accounts/${a.id}`}>
                transactions ↗
              </Link>
            </h3>
            <BalanceHistoryStats file={file} accountId={a.id} from={from} to={today} days={days} />
          </section>
        ))}
      </div>
    </>
  )
}
