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

Not yet: adding transactions by hand, categorization rules, AI
categorization, credit card payment envelopes (see below).

## Development

```sh
pnpm install
pnpm dev        # http://localhost:5173
pnpm test       # vitest
pnpm typecheck
pnpm build      # static output in dist/, deployable to Cloudflare Pages
```

`public/_redirects` makes Cloudflare Pages serve `index.html` for every route.

## Layout

- `src/model/` – data types (`BudgetFile`), money and date helpers, and
  `budgetMath.ts`, which computes a month's envelope view.
- `src/storage/fileStore.ts` – file handle persistence and read/write.
- `src/store/budgetStore.ts` – in-memory state (zustand) with debounced autosave.
- `src/import/ynab.ts` – YNAB JSON importer.
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
