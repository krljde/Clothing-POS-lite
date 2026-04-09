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
- minimal navigation:
  - Home
  - Accounts
  - Orders

---

## Storage

- uses browser localStorage
- no backend

### Important
- data is device-based
- clearing browser data will remove records
- use one main device

---

## Setup

1. Upload to GitHub
2. Enable GitHub Pages
3. Open the site

---

## Notes

This is a lightweight internal tool.

Built for speed and real workflow, not complexity.
