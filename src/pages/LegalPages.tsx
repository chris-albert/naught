import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

const REPO = 'https://github.com/chris-albert/naught'
const UPDATED = 'October 5, 2026'

/** Shared frame for the privacy policy and terms: the landing header, a prose column, and the landing footer. */
function Legal({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="landing">
      <header className="landing-nav">
        <Link to="/" className="brand-row">
          <img src="/icon.svg" alt="" className="brand-icon" />
          <span className="brand">Naught</span>
        </Link>
        <nav>
          <a href={REPO}>GitHub</a>
          <Link to="/app">Open the app</Link>
        </nav>
      </header>
      <article className="legal">
        <h1>{title}</h1>
        <p className="muted small">Last updated {UPDATED}</p>
        {children}
      </article>
      <footer className="landing-footer">
        <p className="muted small">
          <Link to="/privacy">Privacy policy</Link> · <Link to="/terms">Terms of service</Link> ·{' '}
          <a href={REPO}>Source and issues on GitHub</a>
        </p>
      </footer>
    </div>
  )
}

export function PrivacyPage() {
  return (
    <Legal title="Privacy policy">
      <p>
        Naught is a budgeting app that runs in your browser. It is built so that your financial data stays with you:
        there is no Naught account, no database of users, and no copy of your budget anywhere but where you choose to
        keep it. This page describes what the app touches and where it goes.
      </p>

      <h2>Your budget</h2>
      <p>
        Your budget is a single file. You choose where it lives: a file on your own computer, or a file in your own
        Google Drive. Naught reads and writes that file directly from your browser. It is never sent to a server run by
        Naught. If you delete the file, the data is gone; Naught holds no other copy.
      </p>

      <h2>Google Drive and sign-in</h2>
      <p>
        If you choose to keep your budget in Google Drive, you sign in with Google and grant Naught two permissions:
      </p>
      <ul>
        <li>
          <strong>See, edit, create and delete only the files in Google Drive that you use with this app</strong>{' '}
          (<code>drive.file</code>). Naught can only see the budget files it created; it cannot list or read anything
          else in your Drive.
        </li>
        <li>
          <strong>See, create and delete its own configuration data in your Google Drive</strong> (
          <code>drive.appdata</code>). This is a hidden folder only Naught can access, used to share your SimpleFIN
          credentials between your devices so you only have to set up bank sync once.
        </li>
      </ul>
      <p>
        Signing in involves a small server function, hosted on Cloudflare, whose only job is to exchange Google's
        sign-in code for tokens and to renew them, since that step requires a secret that cannot live in a web page.
        It stores nothing. The refresh token that keeps you signed in is kept in a cookie in your browser that scripts
        cannot read, and the short-lived access token is kept in your browser's storage. Neither is logged or retained
        by the server. Your budget file never passes through this function; your browser talks to Google Drive
        directly.
      </p>
      <p>
        Naught's use of information received from Google APIs adheres to the{' '}
        <a href="https://developers.google.com/terms/api-services-user-data-policy">
          Google API Services User Data Policy
        </a>
        , including the Limited Use requirements. Data from your Google Drive is used only to open and save your
        budget. It is not shared with anyone, not sold, and not used for advertising.
      </p>
      <p>
        You can end Google access at any time with "sign out of Google" on the app's welcome page, which revokes the
        token, or from your{' '}
        <a href="https://myaccount.google.com/permissions">Google account's third-party access page</a>.
      </p>

      <h2>Bank sync through SimpleFIN</h2>
      <p>
        Bank sync is optional and goes through <a href="https://www.simplefin.org/">SimpleFIN</a>, a service you set up
        and pay for yourself. When you connect it, your browser fetches account balances and transactions from SimpleFIN
        directly and writes them into your budget file. The SimpleFIN access credentials are stored in your browser and,
        if you use Google Drive, in the hidden app folder described above. They are not sent to Naught. SimpleFIN's own
        privacy policy covers how it handles your bank connections.
      </p>

      <h2>What stays in your browser</h2>
      <p>Naught uses browser storage for conveniences, all of it local to that browser:</p>
      <ul>
        <li>a reference to the last file or Drive budget you opened, so it reopens next time</li>
        <li>the Google access token and the sign-in cookie described above</li>
        <li>your SimpleFIN credentials, if you connected a bank</li>
        <li>your light or dark theme preference</li>
      </ul>
      <p>Clearing the site's data in your browser removes all of it. Naught sets no analytics or tracking cookies.</p>

      <h2>Hosting</h2>
      <p>
        The site is served by Cloudflare. Like any web host, Cloudflare sees the requests your browser makes to load the
        app and may keep standard server logs, such as IP addresses, for security and operations under its own privacy
        policy. Naught does not add analytics of any kind.
      </p>

      <h2>The demo</h2>
      <p>The demo uses generated sample data held in memory. Nothing you do there is saved anywhere.</p>

      <h2>Changes and contact</h2>
      <p>
        If this policy changes, the new version will be posted here with an updated date. Naught is open source;
        questions can be raised <a href={`${REPO}/issues`}>as an issue on GitHub</a>, where you can also read the code
        that does everything described above.
      </p>
    </Legal>
  )
}

export function TermsPage() {
  return (
    <Legal title="Terms of service">
      <p>
        Naught is a free, open-source budgeting app offered as a personal project. By using it you agree to the
        following.
      </p>

      <h2>What Naught is</h2>
      <p>
        Naught is a tool for keeping an envelope budget. It is not a bank, a financial institution or a financial
        adviser, and nothing it shows is financial advice. The numbers it computes come from the data you enter or
        import, and you are responsible for checking them.
      </p>

      <h2>Your data is your responsibility</h2>
      <p>
        Your budget lives in a file you control, on your computer or in your Google Drive. Naught keeps no copy. You are
        responsible for backing that file up, and for the security of the computer, browser and accounts you use it
        from.
      </p>

      <h2>Third-party services</h2>
      <p>
        Google Drive and SimpleFIN are optional and are provided by their own operators under their own terms. Your
        use of them through Naught is subject to those terms, and Naught is not responsible for their availability or
        conduct.
      </p>

      <h2>No warranty</h2>
      <p>
        Naught is provided "as is", without warranty of any kind, express or implied. To the fullest extent permitted by
        law, its author is not liable for any loss or damage arising from its use, including lost or corrupted data and
        decisions made on the basis of what it shows.
      </p>

      <h2>Acceptable use</h2>
      <p>
        Use Naught only for its intended purpose and in compliance with the law. Do not attempt to disrupt the service or
        interfere with other people's use of it.
      </p>

      <h2>Changes</h2>
      <p>
        Naught may change or be discontinued at any time. Because your budget is a plain file in your own storage, it
        remains yours regardless. Changes to these terms will be posted here with an updated date.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about these terms can be raised <a href={`${REPO}/issues`}>as an issue on GitHub</a>.
      </p>
    </Legal>
  )
}
