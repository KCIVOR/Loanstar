# Deliverables (September 3, 2026) — Status Check

**Checked on:** September 4, 2026, against the live system and its database.
**Covers:** the 5 items agreed in the September 1 meeting, plus the offset
discount carry-over fix.

---

## Quick status

| # | Item | Status |
|---|------|--------|
| 1 | Move of Payment — the "amount to pay" | ✅ Done |
| 2 | Penalty breakdown — the duplicated month | ❌ Not in the system yet |
| 3 | Collector discount in the DCRR | ✅ Done |
| 4 | Special quarterly & two-monthly schedule | ✅ Done |
| 5 | Daily schedule | ✅ Done |
| — | Carry-over: offset early-settlement discount | ✅ Done (tested live) |

**5 of 5 done, plus the carry-over.** One item — the penalty breakdown — could
not be found anywhere in the shared system.

---

## 1. Move of Payment — ✅ Done

- When a payment is moved, the borrower is charged exactly **one month's
  interest** for that payment. The old "roughly 85%" placeholder from the demo
  is gone — the figure is now correct and stable.
- The amount shows on the **Collection page** and on the **AR ledger**, as a
  surcharge line that does **not** add to the loan total.
- If the borrower misses the new deadline, the whole schedule **goes back to
  normal and a penalty applies** — this happens automatically.
- Covered by automated tests.

---

## 2. Penalty breakdown — ❌ Not in the system yet

The per-item penalty breakdown — the view that shows, for each overdue period,
how the penalty was built up (base amount, rate, how it compounds) — **could
not be found anywhere** in the shared system: no screen, no report, no
document.

An earlier penalty fix from August 25 (which stopped the system from
re-charging penalties every night) **is** in place and was confirmed working —
but that is a different fix from the "breakdown duplicates the month" issue
raised on September 1.

**What this means:** this item is either sitting only on Rovick's own computer
and hasn't been shared yet, or it hasn't been built. Needs to be confirmed.

---

## 3. Collector discount in the DCRR — ✅ Done

Every point from the meeting is in place and was checked against the live
system:

- A **new permission** exists that allows only the **Collector** role to enter
  this discount.
- The Collector can enter a discount on **interest** and on **accumulated /
  compounded penalties**, choosing which payments it applies to.
- **Management approval comes first** — the Collector cannot just decide the
  amount. There is a required note ("who approved this, and when") that must be
  filled in, otherwise the entry cannot be submitted.
- The discount is applied only **when the payment is actually posted**, and it
  **never edits the real contract amount** — it stays a separate, traceable
  figure.
- It shows in the **AR / PDC discount column** and is marked as coming from the
  Collector (so it's distinct from an offset or origination discount).
- It appears on a **payment receipt / letter** (a new document created for
  this).
- The payment still goes through the **normal accounting approval** like any
  other.
- All database changes are applied and live. Covered by automated tests.

---

## 4. Special quarterly & two-monthly schedule — ✅ Done

- The **normal** quarterly and two-monthly schedules are untouched and still
  work exactly as demoed.
- A **special version** is now selectable in the calculator, clearly labelled
  "Quarterly (Special)" / "Two-monthly (Special)", with a note explaining it.
- The special version produces: **interest only** each period, then a **final
  payment of the full remaining principal plus the last interest** (the balloon).
- Works for both the quarterly and the two-monthly big-client cases.
- Covered by automated tests. Live-tested September 4.

**Naming note:** the deliverable sheet says "bi-monthly", but the client's
meaning was "every two months", so it was built as **two-monthly**. The
15-day "bi-monthly" schedule was deliberately left out, as agreed.

---

## 5. Daily schedule — ✅ Done

- The staff member picks a **payment date** (the day the borrower will pay it
  all off).
- Interest is charged for the **number of days from release to that date** —
  one month's interest spread across the actual days.
- The schedule and ledger show **one single payment** on that date — no monthly
  instalments. (The "Terms" box is now hidden for daily loans, since it doesn't
  apply.)
- Confirmed working live in the browser. Covered by automated tests.

**One thing to confirm with Sir Rene (not blocking):** the system currently
divides the monthly rate by a flat **30** to get the daily rate. The client's
own Excel calculator divides by the **actual number of days in the release
month** (28, 29, 30, or 31). They give the same answer for a loan released in a
30-day month (which is why the September 1 demo matched), and differ by about
3–7% in other months. If Sir Rene is happy with "÷ 30", nothing needs to
change.

---

## Carry-over: offset early-settlement discount — ✅ Done (tested live)

- The discount now **saves and reappears after a refresh** — the problem in the
  demo was the local test environment, as Rovick said.
- It shows in the **deduction breakdown** on the computation.
- **Tested live on September 4:** the offset payoff reaches **AR → Internal
  Transfers** as a pending item (loan AN300452 paying off account AN300442,
  ₱83,781.00). When AR confirms it, the amount is applied to the target
  account's payments and its balance goes down.

**One thing to confirm with Sir Rene:** the amount shown on the AR Internal
Transfers screen is the **payoff amount after the discount** — there is no
separate "discount" line on that screen. The target account's balance drops by
the discounted amount. Is a separate discount line wanted there, or is "the
net amount reduces the balance" what he meant?

---

## What to bring back to Sir Rene

1. **Penalty breakdown (item 2)** — is this on your machine and not yet shared,
   or still to be built? Nothing for it is in the shared system.
2. **Daily rate (item 5)** — keep dividing by a flat 30, or match the Excel and
   divide by the actual days in the release month?
3. **Offset discount** — the AR Internal Transfers flow works. Do you want the
   discount shown as its own line on that screen, or is the net payoff amount
   reducing the balance enough?
