# SHEIN POS Lite

A simple, mobile-first POS for tracking discounted SHEIN orders using voucher-based accounts.

Built for real use — not overengineered.

---

## What it does

Tracks the full workflow of SHEIN reselling:

- accounts with vouchers
- customer orders
- split checkouts
- tracking numbers
- profit (accurately, including account cost)

---

## How it works

Each customer order can have multiple checkouts.

Each checkout tracks:
- account used
- voucher used
- item count
- total price (customer payment)
- discounted price (SHEIN checkout)
- refund
- tracking number
- status

---

## Profit calculation

Profit is calculated per checkout and includes a fair share of the account cost.

### Formula
 - Base Profit = Total Price - Discounted Price + Refund
 - Account Cost Share = Account Cost / Number of checkouts using that account
 - Profit = Base Profit - Account Cost Share
 
---

### Example

If:
- account cost = 190
- 2 checkouts use the same account

Then:
 - Account Cost Share = 190 / 2 = 95 per checkout
 Each checkout only carries its portion of the account cost.

---

### Important behavior

- Account cost is **not fully deducted per checkout**
- It is **distributed across all checkouts using that account**
- Profit updates dynamically as more checkouts use the same account

---

## Ad Spend (logged per day)

Track money spent on ads **per day**, and have profit reflect it.

- Log and edit ad spend in **Stats → Ad Spend Log**:
  - Add an entry by picking a date + amount, then **Add** (logging the same date twice adds up).
  - Edit any day's amount inline; clear it or hit **✕** to remove the entry.
  - Entries are grouped by month with a monthly subtotal, plus an all-time total.
- **Home → Net Profit** = gross profit − total ad spend (all time). A dedicated **Ad Spend** card shows the running total.
- **Stats** shows **Net Profit** for the selected range, plus a separate **Ad Spend** KPI and a Gross / Ad Spend / Net breakdown in the summary.

### How ad spend is applied to a date range
A range simply **sums the daily entries that fall inside it** — no estimation or pro-rating. So
"This Month" is the exact total of every day logged this month, "Today" is just today's entry, and
a custom range adds up the days within it.

---

## Accounts

- add SHEIN accounts
- assign available vouchers
- track:
  - Available (has vouchers)
  - Used (no vouchers left)
  - Expired (time-based)

---

## Orders

- grouped by customer (batch)
- supports multiple checkouts per customer
- each checkout can use different:
  - account
  - voucher
  - tracking

---

## UI

- mobile-first
- fast input
- minimal navigation: Home · Accounts · Orders · Customers · Stats
- the **+** floating button opens quick actions: Add Checkout Batch, Add Account, Log Ad Spend
- the Ad Spend Log groups entries into **collapsible months** (current month open by default)

---

## Accounts & cloud sync

- **Sign up / log in** with email + password (set a **Shop name** at sign-up — it becomes the header title).
- Each login has its **own private data**, synced in **realtime across that account's devices**.
- Published data lives in **Firebase** (`users/{uid}` in Firestore); **localStorage** is kept as an offline cache.
- Localhost testing uses sandbox data (`devUsers/{uid}`) so test orders do not sync into the published shop.
- Per-user security rules mean **no account can see another account's data**.
- Karl's account has an admin-only export panel for downloading another user's Firestore document as backup JSON. This requires the matching admin read rule below.
- **Log out** from the ⚙ menu (desktop) or **More** sheet (mobile).
- Migrating existing data into a new account: **⚙ → Export backup**, sign up, then **⚙ → Import backup**.

---

## Booker fulfillment board

The **Fulfillment** view manages invite-code mobile work for bookers.

- Owner creates one account card per SHEIN voucher account.
- Each account card contains multiple voucher checkouts. One checkout is one voucher use for one customer, with customer details, voucher, cart link, expected total, notes, and item lines.
- Owner sets a Gmail base once in the Fulfillment board settings. The surrender email is generated automatically when the booker opens the surrender popup.
- Owner creates reusable personal invite codes for bookers and sends them the official `booker.html` portal link.
- Bookers open `booker.html`, enter their invite code once, claim an account card, decide every checkout, then surrender the account with email, password, optional unused voucher list, and hours left until expiry.
- The booker portal has bottom tabs for unclaimed COs, the booker's active CO, and approved stats/earnings.
- If any item in a checkout cannot be fulfilled, the whole checkout is marked `cannot_fulfill` with a reason.
- Bookers do not upload proof or screenshots in POS. The board only reminds them to send order-status screenshots for each checkout to Messenger.
- Owner reviews surrendered cards, enters customer payment/final checkout cost, and approves only fulfilled checkouts into normal POS accounts/orders.
- Failed checkouts remain visible with their reason but do **not** affect profit or stats.

Shared board data is stored separately from `users/{uid}`:

- `bookerInvites/{inviteHash}`
- `bookerSessions/{authUid}`
- `bookerBoards/{boardId}`
- `bookerBoards/{boardId}/cards/{cardId}`
- `bookerBoards/{boardId}/cards/{cardId}/checkouts/{checkoutId}`

When running locally on `localhost` or `127.0.0.1`, fulfillment data is sandboxed under `devBookerInvites`, `devBookerSessions`, and `devBookerBoards`.

Invite codes are the access gate. Firestore rules require a valid anonymous session created from an active invite before booker board data can be read.

### Local testing safety

- `localhost`, `127.0.0.1`, and `::1` use sandbox collections: `devUsers`, `devBookerInvites`, `devBookerSessions`, and `devBookerBoards`.
- The published site uses live collections: `users`, `bookerInvites`, `bookerSessions`, and `bookerBoards`.
- Local browser storage also uses a separate key, so test data does not reuse the live cache.
- Test data already created before this sandbox change may still exist in live `users/{uid}` and should be removed manually from the published POS if needed.

---

## Setup

### Hosting
1. Push to GitHub → enable GitHub Pages → open the site.
2. When deploying code changes, bump the manual asset version in `index.html` and `booker.html` for `css/style.css`, `js/app.js`, `js/sync.js`, `js/admin.js`, and `js/fulfillment.js` (for example `?v=2026-06-20l`) so browsers fetch the latest files without a hard refresh.

### Firebase (one-time)
1. Create a project at console.firebase.google.com (free Spark plan).
2. **Authentication → Sign-in method →** enable **Email/Password** and **Anonymous**.
3. **Firestore Database → Create** (Production mode, region `asia-southeast1`).
4. **Firestore > Rules** publish the repository `firestore.rules` file. It allows live data in `users` / `bookerInvites` / `bookerSessions` / `bookerBoards` and local test data in the matching `dev*` collections.
5. **Authentication ? Settings ? Authorized domains ?** add your Pages domain (e.g. `krljde.github.io`).
6. **Project settings → Your apps → Web →** copy `firebaseConfig` into the marked block in `js/sync.js`.

---

## Notes

This is a lightweight internal tool.

Built for speed and real workflow, not complexity.
