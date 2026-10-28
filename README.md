# Naught

A zero-based (envelope) budget that runs entirely in the browser and stores
everything in a single JSON file you own. No backend, no accounts, no server to
run. Put the file in a synced folder (Google Drive, iCloud, Dropbox) and it is
backed up and available on your other machines.

## Status

Early skeleton. Working today:

- Open or create a budget file (File System Access API, so Chromium browsers
  only for writing; other browsers get an in-memory mode plus "Download backup").
- Or keep the budget in Google Drive (works in every browser, phones
  included). The app talks to Drive straight from the browser with the
  `drive.file` scope, so it only sees the files it created. Returning to the
  tab picks up changes saved from another device; if both sides changed, it
  asks which version to keep. Only offered when a Google client ID is
  configured (see Google Drive setup).
- Import a YNAB budget export (the JSON from the YNAB API / `ynab-export`).
- Budget page: month navigation, To Budget, per-category assigned / activity /
  available with editable assignments. Autosaves to the file. Clicking a
  category name opens a panel with its numbers for the month, a monthly
  target (how much it needs assigned each month, optionally with the day of
  the month it is needed by, shown as a small pill next to the name), a
  one-click "Assign" that moves the shortfall from To Budget, and the
  reserve / hidden flags. A dot next to the name marks categories still
  short of their target. Hovering a
  group row shows "Rename" and a "+" that adds a category to it; "+ Add
  group" sits at the bottom of the table. A category is renamed or moved to
  another group from its panel.
- Account pages with transaction lists; payee and category are editable. The
  payee list starts with "Transfer: <account>" entries; picking one makes the
  row a transfer, links the matching row on the other account if the bank
  already sent it (otherwise adds one, which a later sync adopts), and clears
  the category. A card payment is a transfer to the card. "Split" on a row
  (or `s`) divides it across categories: lower a line's amount and give the
  leftover its own category; each line counts under its category in the
  budget and reports, and any leftover stays uncategorized. An
  account can carry a link to its bank's site (set under Settings → Accounts),
  shown in the page header for quick logins. A credit card can also record
  the day of the month its statement closes (the balance that day is what
  the issuer reports to the credit bureaus). For the four days before a
  card closes, the budget page shows a notice with what it owes, what its
  payment category has set aside, and the bank link, so it can be paid
  down before the balance is reported. Dismissing the notice hides that
  card until its next closing; the dismissal lives in the browser, not
  the file.
- Reconciliation: each synced account shows the bank's balance against the
  sum of cleared transactions, lists uncleared and unconfirmed entries that
  explain any gap, and can lock cleared transactions (booking an adjustment
  if you accept a difference). Sidebar dots show which accounts match.
- Reports: income vs living spending chart with a cumulative net line,
  average monthly figures, savings rate, biggest category swings, and a
  month-by-month grid of every group and category. Categories can be flagged
  as reserves (vacation fund, buffer, investments): assigning to a reserve is
  "set aside" in that month and spending from it later is a draw that does
  not count against the later month. Money arriving directly in a category
  counts as income; transfers between your own accounts are ignored. Any
  group, category or payee opens a drill-down page (from the arrow on its
  report row, or "Spending over time" in the category panel) with its monthly
  bars, a breakdown by category or payee, and the transactions behind them.
  Tabs above the overview open more views: This month (the month's figures
  against last month and the average, the pace living spending is on, budget
  vs actual, usual spending not seen yet, largest transactions), Trends
  (savings rate by month, smoothed spending, which categories are rising or
  falling, the same month last year, plan vs actual by month), Insights
  (recurring payees and subscriptions with price changes, targets vs reality,
  top payees, reserve health), Net worth (every account's month-end balance,
  off-budget included), Accounts (every account's balance at the end of each
  day as a line, one chart per account, also reachable from "Balance
  history" on the account page) and Year in review. These views start their range at
  the first month with data, so a young budget is not averaged over empty
  months.
- SimpleFIN bank sync: Settings → Accounts walks through creating the
  SimpleFIN Bridge account and setup token (with links straight to the right
  pages), recognizes a pasted setup token, claim URL or access URL as you
  type, then fetch, link bank accounts to budget accounts (or create them),
  import. Pending transactions are imported as uncleared and clear when they
  post. Posted ones are de-duplicated by bank id and by
  same-amount-within-10-days against manually entered ones. Once accounts are
  linked, the Sync page (or ↻ in the sidebar, which opens it) pulls and
  imports in one step. Every sync is recorded in the file, and the Sync page
  lists the past ones with their counts; each opens to the transactions it
  added, matched or updated in the same editable table as the account pages,
  so new rows are categorized and matches checked right there. The SimpleFIN
  credentials live in the browser's IndexedDB, not in the file. For a budget
  in Google Drive they are also copied to the app's hidden Drive folder
  (`drive.appdata`), so other devices signed in to the same Google account
  connect without a new token; disconnecting on one device disconnects them
  all.

- Undo and redo: every change made in the current tab can be undone with
  Cmd/Ctrl+Z (Shift to redo, or the buttons at the bottom of the sidebar),
  including bank imports and version restores. The history lives in memory
  and is dropped when the file is reloaded or closed.
- Version history (Google Drive budgets only): Settings → File
  lists Drive's revisions of the file, shows what any of them held, and
  restores one as a new save (itself undoable). Drive keeps every revision
  for 30 days or until there are 100, so the app also marks the first save
  of each day `keepForever` and keeps the latest 60 of those. A file in a
  synced folder has no history in the app; use the provider's own.
- Payee rules: after you pick a category for a transaction, the row offers to
  always use that category for the payee. Saying yes categorizes the other
  uncategorized transactions from that payee and future bank imports. Rules
  are listed under Settings → Payee rules, where they can be changed or
  removed. Matching is on the exact payee name.
- AI settings: Settings → AI takes an Anthropic API key for the AI features.
  The key lives in the browser's IndexedDB, not in the file, and each device
  needs it pasted once. With a key saved, "Review with Claude" on the Insights
  tab runs the subscription review in the app (Claude Opus, about $0.06 a run)
  and shows the answer under the button; without one, the prompt can still be
  opened in Claude or ChatGPT or copied. Only payee names, amounts, dates and
  category names are sent.
- AI categorization: with a key saved, "Suggest categories" on an account page
  (or on a run on the Sync page) asks Claude for a category for each uncategorized
  transaction, and every bank sync does the same for the rows it added. Each
  suggestion sits under its row with a confidence and a one-click accept;
  "Accept all above 90%" takes the sure ones in one undoable step. Claude also
  offers a cleaner payee name (`AMZN Mktp US*2K3J` → Amazon) as a separate
  suggestion. Nothing changes in the file until you accept, accepting offers a
  payee rule the same as picking by hand, and the sync history marks what
  Claude categorized. Sent: the payee, memo, amount and account type of the
  rows, your category names, and about 40 of your past categorized
  transactions as examples (Claude Opus, about a cent per transaction).
- Ask: with a key saved, the Ask page is a chat with Claude where every
  figure comes from tools that run the report functions in the browser
  (spending by category, transactions, recurring payees, month review, net
  worth, budget month, categories, accounts). Each answer lists the tools it
  called. What is sent: your questions and the tables those tools return.
  The conversation is kept in memory only.

Not yet: adding transactions by hand, credit card payment
envelopes (see below).

## Development

```sh
pnpm install
pnpm dev        # http://localhost:5173
pnpm test       # vitest
pnpm typecheck
pnpm build      # static output in dist/
```

### Google Drive setup

Sign-in uses Google's authorization-code flow: the browser gets a one-time
code from Google's popup and posts it to `/auth/exchange`, a Pages Function
(`functions/auth/[action].ts`) that trades it for tokens using the client
secret. The refresh token stays in an HttpOnly cookie, so the page can renew
its hour-long access token through `/auth/refresh` without a popup, and the
user signs in once per browser rather than once an hour.

1. In the [Google Cloud console](https://console.cloud.google.com/), create a
   project and enable the **Google Drive API** (APIs & Services → Library).
2. Under Google Auth Platform (OAuth consent screen), set the app name and
   support email, audience **External**, and add the scopes
   `https://www.googleapis.com/auth/drive.file` and
   `https://www.googleapis.com/auth/drive.appdata` under Data Access.
3. Under Clients, create an OAuth client of type **Web application**. Add
   every origin the app is served from to *Authorized JavaScript origins*:
   `http://localhost:5173` and `https://naught.lbert.io`. No redirect URIs:
   the popup flow uses the fixed `postmessage` redirect. Copy the client ID
   and the client secret.
4. Put the client ID in `VITE_GOOGLE_CLIENT_ID` and the secret in
   `GOOGLE_CLIENT_SECRET`. For development, the ID goes in `.env.local`
   (read by Vite) and both go in `.dev.vars` (read by wrangler); both files
   are ignored by git. In the Cloudflare Pages project, add both under
   Settings → Variables and secrets for Production and Preview, the secret
   with type *Secret*; Pages passes them to builds and to Functions.

While the consent screen is in *Testing*, only the Google accounts listed as
test users can sign in, and Google expires refresh tokens after 7 days, so
sign-in comes back weekly. Publishing it to production lifts both; the two
Drive scopes are non-sensitive, so no verification is needed. Branch
previews have their own hostnames and only work with Drive if that origin is
added to the client too (wildcards are not allowed).

Vite's dev server does not run Pages Functions. Run `pnpm functions` in a
second terminal; it serves them on port 8788 and `vite.config.ts` proxies
`/auth` there.

Routes: `/` is the landing page, `/demo` opens six months of generated
sample data in memory (`src/demo/sampleBudget.ts`), and the app lives under
`/app`.

## Deployment

The site is a Cloudflare Pages project connected to this repo, served at
https://naught.lbert.io. GitHub Actions runs the tests on every push and PR
(`.github/workflows/ci.yml`); Pages builds and deploys. Its settings live in
the Cloudflare dashboard, not the repo: production branch `main`, build
command `pnpm build`, build output directory `dist`, and `naught.lbert.io` as
a custom domain. `public/_redirects` makes Pages serve `index.html` for every
route. Pages also deploys everything under `functions/` as routes, with no
extra configuration.

Every push to `main` deploys production. Every other branch gets a preview at
`<branch>.naught-3kn.pages.dev`, posted on the pull request. The hostname is
stable for the life of the branch, so browser-side state on a preview (the
remembered file handle, SimpleFIN credentials, theme) survives new pushes but
stays separate from production and from other branches.

## Layout

- `src/model/` – data types (`BudgetFile`), money and date helpers, and
  `budgetMath.ts`, which computes a month's envelope view.
- `src/storage/storage.ts` – the `BudgetStorage` interface the store saves through.
- `src/storage/fileStore.ts` – file handle persistence and read/write.
- `src/storage/googleDrive.ts` – Google sign-in and the Drive REST calls.
- `functions/auth/[action].ts` – the Pages Function that exchanges, refreshes and revokes Google tokens.
- `src/store/budgetStore.ts` – in-memory state (zustand) with debounced autosave.
- `src/import/ynab.ts` – YNAB JSON importer.
- `src/demo/sampleBudget.ts` – deterministic sample data for `/demo`.
- `src/pages/`, `src/components/` – UI.

## Budget rules

All amounts are integer cents. Only on-budget accounts affect envelopes.

- available = last month's available (if positive) + assigned + activity
- A negative available resets to zero at month end. Overspending paid in
  cash shows up in next month's To Budget; overspending on a credit card is
  debt with no envelope behind it and does not.
- Every credit card has a payment category in the "Credit Card Payments"
  group (linked by name on YNAB import, created automatically otherwise).
  Categorized spending on the card moves that much into it, but only what the
  spending envelope could cover. Paying the card moves money out of it.
  Income received on a card and a card's starting balance leave it alone, as
  in YNAB. When a card is closed, whatever is left in its payment category is
  released.
- To Budget is derived from balances rather than a running ledger:
  cash in on-budget accounts − money in envelopes − this month's credit
  overspending − money assigned in future months.
