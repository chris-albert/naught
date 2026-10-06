import { Link } from 'react-router-dom'
import { BudgetShot, PanelShot, PhoneShot, ReconcileShot, ReportsShot, TransactionsShot, TrendShot } from './LandingShots'

const REPO = 'https://github.com/chris-albert/naught'

const showcase = [
  {
    eyebrow: 'Budget',
    title: 'Targets that tell you what is left to fund',
    body: [
      'Give a category a monthly target and its panel shows the shortfall, a bar to the goal, and a one-click Assign that moves exactly that much from To budget. A dot beside the name marks anything still short.',
      'Click a group row instead and you get the same view for the whole group: what its categories need each month in total, how far assigned is from it, and every transaction behind it.',
    ],
    shot: <PanelShot />,
  },
  {
    eyebrow: 'Transactions',
    title: 'Clear the inbox without touching the mouse',
    body: [
      'Move with j and k, pick a category with c, a payee with p, split with s. When you categorize a payee the row offers to remember it, so the next import lands already sorted.',
      'Split a transaction across categories by lowering a line and giving the leftover its own. Pick "Transfer: Checking" as the payee and the row becomes a transfer, linked to the other side when the bank sends it. Each account can carry a link to its bank for quick logins.',
    ],
    shot: <TransactionsShot />,
    reverse: true,
  },
  {
    eyebrow: 'Bank sync',
    title: 'Pending today, reconciled by tonight',
    body: [
      'Connect through SimpleFIN and pull transactions in one click from the sidebar. Pending charges arrive right away so you can categorize them, then keep their category when they post for the final amount. Delete a stray pending charge and it stays gone on the next sync.',
      'Every synced account shows the bank balance next to your cleared total and lists the exact entries that explain any gap. Lock what matches. The sidebar dots tell you at a glance which accounts line up.',
    ],
    shot: <ReconcileShot />,
  },
  {
    eyebrow: 'Reports',
    title: 'Income, living spending, and the line between them',
    body: [
      'Average income and living spending, savings rate, and the sum of your monthly targets as a share of what you earn. Reserve categories such as a vacation fund count as set aside, not spent, so saving does not look like a bad month.',
      'Every figure has an info bubble that spells out how it was computed. Hover a month on the chart for the breakdown.',
    ],
    shot: <ReportsShot />,
    reverse: true,
  },
  {
    eyebrow: 'Spending over time',
    title: 'Drill into any group, category or payee',
    body: [
      'From the arrow on a report row or the link in a category panel, open a page with that scope’s monthly bars, how recent months compare to earlier ones, a breakdown by category or payee with heat-shaded cells, and the transactions behind them.',
    ],
    shot: <TrendShot />,
  },
  {
    eyebrow: 'Anywhere',
    title: 'Your file, on your phone too',
    body: [
      'Keep the budget in your own Google Drive and open it from any browser, phones included. Naught only ever sees the files it created, stays signed in between visits, and asks before overwriting if two devices changed the same file.',
      'On a narrow screen the sidebar becomes a drawer and category panels slide up as a sheet. A SimpleFIN connection made on one device follows you to the others through Drive, so there is nothing to set up twice.',
    ],
    shot: <PhoneShot />,
    reverse: true,
  },
]

const more = [
  {
    title: 'Give every dollar a job',
    body: 'Zero-based envelopes with the rules you already know: money carries forward, overspending resets, and each open credit card gets a payment envelope that fills as you spend.',
  },
  {
    title: 'One file. Yours.',
    body: 'The whole budget is a single JSON file written straight to your disk or your Drive. Keep it in iCloud, Drive or Dropbox and it is backed up and on your other machines, with no account to create.',
  },
  {
    title: 'Move money where it is needed',
    body: 'Click an Available amount to move money to another category or cover an overspend from one that has room. Negative balances offer the cover directly.',
  },
  {
    title: 'Payee rules',
    body: 'Rules are kept under Settings where they can be changed or removed. A new rule also categorizes the other uncategorized transactions from that payee.',
  },
  {
    title: 'Bring your YNAB history',
    body: 'Import the JSON export and keep years of transactions, splits, transfers and assignments.',
  },
  {
    title: 'Light and dark',
    body: 'Follows your system theme, or pin either one from the sidebar. Install it from the browser for an icon on your home screen.',
  },
]

export function LandingPage() {
  return (
    <div className="landing">
      <header className="landing-nav">
        <div className="brand-row">
          <img src="/icon.svg" alt="" className="brand-icon" />
          <span className="brand">Naught</span>
        </div>
        <nav>
          <a href={REPO}>GitHub</a>
          <Link to="/app">Open the app</Link>
        </nav>
      </header>

      <section className="hero">
        <h1>A zero-based budget that lives in a file you own.</h1>
        <p>
          Naught runs entirely in your browser. No server, no subscription, no one else holding your numbers. Just an
          envelope budget, bank sync and reports on top of one file you control.
        </p>
        <div className="hero-actions">
          <Link to="/demo" className="cta">
            Try the demo
          </Link>
          <Link to="/app" className="cta secondary">
            Open the app
          </Link>
        </div>
        <p className="muted small">The demo is six months of made-up data. Poke at anything; nothing is saved.</p>
      </section>

      <div className="hero-shot">
        <BudgetShot />
      </div>

      {showcase.map((s) => (
        <section key={s.title} className={`showcase ${s.reverse ? 'reverse' : ''}`}>
          <div className="showcase-text">
            <div className="eyebrow">{s.eyebrow}</div>
            <h2>{s.title}</h2>
            {s.body.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </div>
          <div className="showcase-shot">{s.shot}</div>
        </section>
      ))}

      <section className="more">
        <h2>And the rest</h2>
        <div className="feature-grid">
          {more.map((f) => (
            <div key={f.title} className="card">
              <h3>{f.title}</h3>
              <p className="muted">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="steps">
        <h2>How it works</h2>
        <ol>
          <li>
            <strong>Create a file</strong> in a folder that syncs, or in Google Drive, or open the one you already have.
          </li>
          <li>
            <strong>Bring in transactions</strong> by importing from YNAB or syncing your bank.
          </li>
          <li>
            <strong>Assign, spend, reconcile.</strong> Autosave keeps the file current as you go.
          </li>
        </ol>
        <div className="hero-actions">
          <Link to="/demo" className="cta">
            Try the demo
          </Link>
        </div>
      </section>

      <footer className="landing-footer">
        <p className="muted small">
          Saving to disk uses the File System Access API, so it needs Chrome, Edge or another Chromium-based browser.
          Other browsers can keep the budget in Google Drive, or use an in-memory mode plus a backup download.
        </p>
        <p className="muted small">
          <Link to="/privacy">Privacy policy</Link> · <Link to="/terms">Terms of service</Link> ·{' '}
          <a href={REPO}>Source and issues on GitHub</a>
        </p>
      </footer>
    </div>
  )
}
