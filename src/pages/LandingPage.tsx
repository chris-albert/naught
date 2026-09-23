import { Link } from 'react-router-dom'

const REPO = 'https://github.com/chris-albert/naught'

const features = [
  {
    title: 'Give every dollar a job',
    body: 'Zero-based envelopes with the rules you already know: money carries forward, overspending resets, and each credit card gets a payment envelope that fills as you spend.',
  },
  {
    title: 'One file. Yours.',
    body: 'The whole budget is a single JSON file written straight to your disk. Keep it in iCloud, Drive or Dropbox and it is backed up and on your other machines, with no account to create.',
  },
  {
    title: 'Bank sync without a middleman',
    body: 'Connect through SimpleFIN and pull transactions in one click. Pending items are skipped, posted ones are matched against what you typed, and the credentials never leave your browser.',
  },
  {
    title: 'Reconcile with confidence',
    body: 'Each synced account shows the bank balance next to your cleared total, lists exactly which entries explain any gap, and locks the rest.',
  },
  {
    title: 'Reports that answer the question',
    body: 'Income against living spending, savings rate, the biggest swings, and a month-by-month grid of every category. Savings goals count as set aside, not spent.',
  },
  {
    title: 'Bring your YNAB history',
    body: 'Import the JSON export and keep years of transactions, splits, transfers and assignments.',
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

      <section className="feature-grid">
        {features.map((f) => (
          <div key={f.title} className="card">
            <h3>{f.title}</h3>
            <p className="muted">{f.body}</p>
          </div>
        ))}
      </section>

      <section className="steps">
        <h2>How it works</h2>
        <ol>
          <li>
            <strong>Create a file</strong> in a folder that syncs, or open the one you already have.
          </li>
          <li>
            <strong>Bring in transactions</strong> by importing from YNAB or syncing your bank.
          </li>
          <li>
            <strong>Assign, spend, reconcile.</strong> Autosave keeps the file current as you go.
          </li>
        </ol>
      </section>

      <footer className="landing-footer">
        <p className="muted small">
          Saving to disk uses the File System Access API, so it needs Chrome, Edge or another Chromium-based browser.
          Other browsers get an in-memory mode plus a backup download.
        </p>
        <p className="muted small">
          <a href={REPO}>Source and issues on GitHub.</a>
        </p>
      </footer>
    </div>
  )
}
