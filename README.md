# Naught

A zero-based (envelope) budget that runs entirely in the browser and stores
everything in a single JSON file you own. No backend, no accounts, no server to
run. Put the file in a synced folder (Google Drive, iCloud, Dropbox) and it is
backed up and available on your other machines.

## Status

Early skeleton. Working today:

- Open or create a budget file (File System Access API, so Chromium browsers
  only for writing; other browsers get an in-memory mode plus "Download backup").
- Import a YNAB budget export (the JSON from the YNAB API / `ynab-export`).
- Budget page: month navigation, To Budget, per-category assigned / activity /
  available with editable assignments. Autosaves to the file.
- Account pages with transaction lists; payee and category are editable.
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
  counts as income; transfers between your own accounts are ignored.
- SimpleFIN bank sync: paste a setup token, fetch, link bank accounts to
  budget accounts (or create them), import. Pending transactions are skipped
  (banks change their id and amount when they post). Posted ones are
  de-duplicated by bank id and by same-amount-within-10-days against manually
  entered ones. The SimpleFIN credentials live in the browser's IndexedDB, not
  in the file.

- Payee rules: after you pick a category for a transaction, the row offers to
  always use that category for the payee. Saying yes categorizes the other
  uncategorized transactions from that payee and future bank imports. Rules
  are listed under Settings → Payee rules, where they can be changed or
  removed. Matching is on the exact payee name.

Not yet: adding transactions by hand, AI categorization, credit card payment
envelopes (see below).

## Development

```sh
pnpm install
pnpm dev        # http://localhost:5173
pnpm test       # vitest
pnpm typecheck
pnpm build      # static output in dist/
```

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
route.

Every push to `main` deploys production. Every other branch gets a preview at
`<branch>.naught-3kn.pages.dev`, posted on the pull request. The hostname is
stable for the life of the branch, so browser-side state on a preview (the
remembered file handle, SimpleFIN credentials, theme) survives new pushes but
stays separate from production and from other branches.

## Layout

- `src/model/` – data types (`BudgetFile`), money and date helpers, and
  `budgetMath.ts`, which computes a month's envelope view.
- `src/storage/fileStore.ts` – file handle persistence and read/write.
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
