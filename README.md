# SAN Ledger — Rice Mill Management System

A bilingual (English / မြန်မာ) rice mill management web app. Plain HTML/CSS/JS with no build step.

Live at **https://yt-graham.github.io/san-ledger/**. Data is saved online in a Neon Postgres database, so the
owner and the cashier see the same records on any phone or computer. Use **Backup / Restore** to download a
backup file regularly as well.

## Sign-in
1. Business account (email + password, Neon Auth). Create it once; the owner and cashier both use it.
2. Role: Owner or Cashier with a 4-digit PIN (default `0000`; change it in Settings).

## Cloud sync (`js/cloud.js`)
- Neon project `san-ledger` (`sparkling-shape-26895695`), branch `main`, database `neondb`.
- Table `public.books (user_id, data jsonb, version, updated_at)`: one row per business account holding the
  whole ledger. Row-level security: an account can only read/insert/update its own row; no anonymous access.
- Each save pushes with a version check. If another device saved first, the two copies are merged record by
  record (`merge3`), then saved again. Every 15 s the app checks for changes from other devices.
- A local copy is kept per account for fast start-up; if the internet drops, the pill shows "Offline" and
  saving retries automatically.
- The database URL in `js/cloud.js` is public by design; access is controlled by sign-in and row security.

## Run locally
Open `index.html` through any static web server (localhost is allowed by Neon Auth), for example:

```
python3 -m http.server 8765
```

then visit http://localhost:8765.

## Pages
Dashboard · Cash drawer · Paddy purchases · Rice purchases · Paddy receipts · Rice receipts · Jobs ·
Sales · Delivery orders · Inventory · Expenses · Other income · Transport advances · Salary advances ·
Reports (8) · Audit logs · Settings · Backup / Restore · User guide.
The Cashier role cannot see the Dashboard or Backup / Restore, cannot open the Income/expense or Profit/loss reports,
cannot change the Owner PIN or delete business records, and cannot edit or delete records.

## How the data fits together
- **Payments ledger** (`db.payments`): every money in/out, tagged with a payment method. Methods marked *cash* feed the cash drawer.
- **Stock ledger** (`db.moves`): every stock in/out, by kind (paddy, rice, milling output, polishing output), owner (mill or customer) and item. Balances are computed, never stored.
- Record numbers follow the draft: `PUR-2026-001` (paddy purchase), `RPU-` (rice purchase), `REC-` (receipts),
  `SAL-` (sales), `EXP-` (expenses), `OIN-` (other income), `ADV-` (salary advances). Counters restart each year.
- Purchase, sale and expense forms use a payment status (fully paid / partly paid / not paid yet). Unpaid amounts show in Receivables/Payables.
- Receipts can record a transport advance and a cash advance (အသုံးကြိုထုတ်ငွေ); both appear on the Transport advances page for repayment.
- Main forms record date and time (`date` + `time` fields), so date filters keep working.
- Sale lines pick a stage first (milling output, polishing output, raw rice, other). "Other" items are not stock-tracked.
- Purchases add mill stock. Customer receipts add customer stock (plus an optional transport advance).
  Jobs consume the input, record outputs, collect the service fee, and create a delivery order on collection.
  Sales deduct mill stock when delivered.

## Files
- `js/store.js` data model, ledgers, session
- `js/cloud.js` sign-in, cloud load/save, merge and sync status
- `js/i18n.js` English → Burmese dictionary (English text is the key; missing keys fall back to English)
- `js/ui.js` form/modal engine, tables, charts, print, CSV
- `js/pages-*.js` pages · `js/app.js` shell, router, login · `css/styles.css`
