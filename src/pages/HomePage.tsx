import { Fragment, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CardClosings } from '../components/CardClosings'
import { MonthlyBars } from '../components/MonthlyBars'
import { SpendingCurve } from '../components/SpendingCurve'
import { currentDate, formatMonth, ordinalDay } from '../model/dates'
import { buildHome, spendingCurve, type Home, type SpendingCurve as Curve } from '../model/home'
import { formatCents } from '../model/money'
import { buildMonthReview, type Pace } from '../model/monthReview'
import { buildReport, monthRange } from '../model/reports'
import { isSplit } from '../model/splits'
import { INCOME_CATEGORY_ID, type BudgetFile, type Transaction } from '../model/types'
import { getAccessUrl } from '../simplefin/client'
import { useBudget } from '../store/budgetStore'
import { useSync } from '../store/syncStore'
import { PaceBar } from './MonthReviewPage'
import { describeRun } from './SyncPage'

/** How many months the income and spending bars cover. */
const RECENT_MONTHS = 6

/** A sync older than this many days is called out. */
const STALE_AFTER_DAYS = 3

/** Home: where the budget stands today, what is waiting on you, and what the bank last sent. */
export function HomePage() {
  const file = useBudget((s) => s.file)!
  const today = currentDate()
  const home = useMemo(() => buildHome(file, today), [file, today])
  const review = useMemo(() => buildMonthReview(file, home.month, today), [file, home.month, today])
  const pace = review.pace
  const day = Number(today.slice(8))
  const curve = useMemo(() => spendingCurve(file, today), [file, today])
  const recentMonths = useMemo(() => buildReport(file, monthRange(home.month, RECENT_MONTHS), day).summaries, [file, home.month, day])

  return (
    <>
      <header className="page-header">
        <h2>Home</h2>
        <span className="muted">
          {formatMonth(home.month)}, through the {ordinalDay(day)}
        </span>
      </header>
      <div className="page-body">
        <div className="stat-row">
          <Link to="/app/budget" className={`stat to-budget ${home.toBudget < 0 ? 'over' : ''}`}>
            <span className="muted">To budget</span>
            <strong>{formatCents(home.toBudget)}</strong>
          </Link>
          <Link to="/app/reports/month" className="stat">
            <span className="muted">Spent so far</span>
            <strong>{formatCents(review.living.value)}</strong>
            {pace && pace.usualByNow > 0 && (
              <Delta label={`usual by the ${ordinalDay(day)}`} good={pace.soFar <= pace.usualByNow}>
                {formatCents(pace.usualByNow)}
              </Delta>
            )}
          </Link>
          {pace && (
            <Link to="/app/budget" className="stat">
              <span className="muted">Left in budget</span>
              <strong className={pace.available < 0 ? 'neg' : ''}>{formatCents(pace.available)}</strong>
              {pace.daysLeft > 0 && pace.available > 0 && (
                <Delta label={`a day for ${pace.daysLeft} ${pace.daysLeft === 1 ? 'day' : 'days'}`}>
                  {formatCents(Math.floor(pace.available / pace.daysLeft))}
                </Delta>
              )}
            </Link>
          )}
          <Link to="/app/reports/month" className="stat">
            <span className="muted">Income</span>
            <strong>{formatCents(review.income.value)}</strong>
          </Link>
          <Link to="/app/reports/net-worth" className="stat">
            <span className="muted">Net worth</span>
            <strong className={home.netWorth < 0 ? 'neg' : ''}>{formatCents(home.netWorth)}</strong>
            <Delta label="this month" good={home.netWorthChange >= 0}>
              {home.netWorthChange > 0 ? '▲' : home.netWorthChange < 0 ? '▼' : ''} {formatCents(Math.abs(home.netWorthChange))}
            </Delta>
          </Link>
        </div>

        <CardClosings file={file} />

        <div className="home-grid">
          <Attention home={home} />
          <SyncCard file={file} />
        </div>
        {pace && <PaceSummary pace={pace} curve={curve} month={home.month} />}
        <div className="home-grid">
          {pace && pace.groups.length > 0 && <GroupSpending pace={pace} />}
          <section className="card">
            <div className="card-head">
              <h3>Last {RECENT_MONTHS} months</h3>
              <Link to="/app/reports" className="home-more">
                Reports ›
              </Link>
            </div>
            <MonthlyBars summaries={recentMonths} width={520} />
          </section>
        </div>
        <RecentTransactions file={file} transactions={home.recent} />
      </div>
    </>
  )
}

function Delta({ label, good, children }: { label: string; good?: boolean; children: React.ReactNode }) {
  return (
    <span className={`stat-delta ${good === undefined ? 'muted' : good ? 'soft-pos' : 'soft-neg'}`}>
      <span className="stat-delta-label">{label}</span> {children}
    </span>
  )
}

/** Everything that wants a decision, each linking to where it gets made. */
function Attention({ home }: { home: Home }) {
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
  const shown = home.overspent.slice(0, 3)
  const items: { to: string; text: React.ReactNode }[] = []

  if (home.toBudget < 0) {
    items.push({ to: '/app/budget', text: <><strong className="neg">{formatCents(-home.toBudget)}</strong> assigned that you do not have</> })
  } else if (home.toBudget > 0) {
    items.push({ to: '/app/budget', text: <><strong className="pos">{formatCents(home.toBudget)}</strong> ready to assign</> })
  }
  if (home.uncategorized > 0) {
    items.push({
      to: '/app/accounts?filter=uncategorized',
      text: <><strong className="warn-text">{home.uncategorized}</strong> {home.uncategorized === 1 ? 'transaction needs' : 'transactions need'} a category</>,
    })
  }
  if (home.overspent.length > 0) {
    items.push({
      to: '/app/budget',
      text: (
        <>
          <strong className="neg">{plural(home.overspent.length, 'category', 'categories')}</strong> overspent:{' '}
          {shown.map((r) => `${r.category.name} ${formatCents(r.available)}`).join(', ')}
          {home.overspent.length > shown.length && `, and ${home.overspent.length - shown.length} more`}
        </>
      ),
    })
  }
  if (home.underfunded.count > 0) {
    items.push({
      to: '/app/budget',
      text: <><strong>{plural(home.underfunded.count, 'target', 'targets')}</strong> still {formatCents(home.underfunded.total)} short this month</>,
    })
  }
  for (const r of home.unmatched) {
    items.push({
      to: `/app/accounts/${r.account.id}`,
      text: <><strong className="warn-text">{r.account.name}</strong> is {formatCents(Math.abs(r.difference))} off from the bank</>,
    })
  }

  return (
    <section className="card">
      <h3>Needs attention</h3>
      {items.length === 0 ? (
        <p className="muted">Nothing is waiting on you.</p>
      ) : (
        <ul className="attention">
          {items.map((item, i) => (
            <li key={i}>
              <Link to={item.to}>
                <span>{item.text}</span>
                <span className="muted">›</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** When the bank was last asked, what that brought in, and a button to ask again. */
function SyncCard({ file }: { file: BudgetFile }) {
  const busy = useSync((s) => s.busy)
  const error = useSync((s) => s.error)
  const sync = useSync((s) => s.sync)
  const [connected, setConnected] = useState<boolean | null>(null)
  useEffect(() => {
    getAccessUrl().then((u) => setConnected(!!u))
  }, [])

  const linked = file.accounts.filter((a) => a.simplefinId && !a.closed)
  const lastRun = file.syncRuns?.[file.syncRuns.length - 1]
  const last = file.simplefinLastSync
  const stale = last !== undefined && Date.now() - Date.parse(last) > STALE_AFTER_DAYS * 86_400_000

  return (
    <section className="card">
      <div className="card-head">
        <h3>Bank sync</h3>
        <button onClick={() => sync()} disabled={!connected || linked.length === 0 || busy}>
          {busy ? 'Syncing…' : 'Sync now'}
        </button>
      </div>
      {connected === false ? (
        <p className="muted">
          Bank sync is not set up yet. Connect SimpleFIN under <Link to="/app/settings/accounts" className="link">Settings → Accounts</Link>.
        </p>
      ) : connected === null ? null : linked.length === 0 ? (
        <p className="muted">
          No accounts are linked yet. Link them under <Link to="/app/settings/accounts" className="link">Settings → Accounts</Link>.
        </p>
      ) : (
        <p>
          {last ? (
            <>
              Last synced <strong className={stale ? 'warn-text' : ''}>{ago(last)}</strong>
            </>
          ) : (
            'Not synced yet'
          )}
          <span className="muted"> · {linked.length === 1 ? '1 linked account' : `${linked.length} linked accounts`}</span>
        </p>
      )}
      {busy && <p className="muted">Pulling transactions from the bank…</p>}
      {error && <p className="neg">{error}</p>}
      {lastRun && (
        <p className="muted">
          {describeRun(lastRun)}.{' '}
          <Link to="/app/sync" className="link">
            See what came in ›
          </Link>
        </p>
      )}
    </section>
  )
}

/** "just now", "12 min ago", "5 hr ago", "3 days ago". */
function ago(iso: string): string {
  const minutes = Math.floor((Date.now() - Date.parse(iso)) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hr ago`
  const days = Math.floor(hours / 24)
  return `${days} ${days === 1 ? 'day' : 'days'} ago`
}

/** Where the month's living spending is heading; the month review has the breakdown. */
function PaceSummary({ pace, curve, month }: { pace: Pace; curve: Curve; month: string }) {
  const over = pace.averageMonth > 0 && pace.projected > pace.averageMonth
  return (
    <section className="card">
      <div className="card-head">
        <h3>This month</h3>
        <Link to="/app/reports/month" className="home-more">
          Month review ›
        </Link>
      </div>
      <p className="pace-headline">
        On pace for <strong className={over ? 'neg' : 'pos'}>{formatCents(pace.projected)}</strong> living spending
        {pace.averageMonth > 0 && (
          <>
            , against an average month of <strong>{formatCents(pace.averageMonth)}</strong>
          </>
        )}
        . {pace.daysLeft} {pace.daysLeft === 1 ? 'day' : 'days'} left.
      </p>
      <SpendingCurve curve={curve} monthLabel={formatMonth(month).slice(0, 3)} />
    </section>
  )
}

/** How many groups the spending card lists. */
const TOP_GROUPS = 6

/** The groups with the most spending so far, each on the month review's pace bar and one shared scale. */
function GroupSpending({ pace }: { pace: Pace }) {
  const groups = [...pace.groups].sort((a, b) => b.soFar - a.soFar).slice(0, TOP_GROUPS)
  const scale = Math.max(1, ...groups.flatMap((g) => [g.projected, g.averageMonth]))
  return (
    <section className="card">
      <div className="card-head">
        <h3>Spending by group</h3>
        <Link to="/app/reports/month" className="home-more">
          Month review ›
        </Link>
      </div>
      <div className="home-groups">
        {groups.map((g) => (
          <Fragment key={g.group.id}>
            <span className="name">{g.group.name}</span>
            <PaceBar figures={g} scale={scale} />
            <span className="num">{formatCents(g.soFar)}</span>
          </Fragment>
        ))}
      </div>
      <div className="chart-legend">
        <span>
          <i className="swatch pace-swatch-spent" /> Spent so far
        </span>
        <span>
          <i className="swatch pace-swatch-projected" /> Projected
        </span>
        <span>
          <i className="swatch swatch-average" /> Average month
        </span>
      </div>
    </section>
  )
}

function RecentTransactions({ file, transactions }: { file: BudgetFile; transactions: Transaction[] }) {
  const accountName = new Map(file.accounts.map((a) => [a.id, a.name]))
  const categoryName = new Map(file.categories.map((c) => [c.id, c.name]))
  const category = (t: Transaction) => {
    if (t.transferAccountId) return <span className="muted">Transfer</span>
    if (isSplit(t)) return <span className="muted">Split</span>
    if (!t.categoryId) return <span className="warn-text">Uncategorized</span>
    return t.categoryId === INCOME_CATEGORY_ID ? 'Income' : categoryName.get(t.categoryId) ?? '?'
  }

  return (
    <section className="card">
      <div className="card-head">
        <h3>Recent transactions</h3>
        <Link to="/app/accounts" className="home-more">
          All transactions ›
        </Link>
      </div>
      {transactions.length === 0 ? (
        <p className="muted">No transactions yet.</p>
      ) : (
        <div className="home-scroll">
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
              {transactions.map((t) => (
                <tr key={t.id}>
                  <td className="muted">{t.date}</td>
                  <td>{t.payee || <span className="muted">No payee</span>}</td>
                  <td>{category(t)}</td>
                  <td>
                    <Link to={`/app/accounts/${t.accountId}`}>{accountName.get(t.accountId)}</Link>
                  </td>
                  <td className={`num ${t.amount > 0 ? 'pos' : ''}`}>{formatCents(t.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
