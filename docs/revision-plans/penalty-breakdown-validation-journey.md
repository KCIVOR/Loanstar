# Late Fee (Penalty) — Validation Walkthrough

Plain-language checks for what shipped in Phases 2, 3, 4a and 7. No technical
knowledge needed — do each **Action**, confirm the **You should see** matches.

"Late fee" = what the screens sometimes call a *penalty*. "Monthly payment" =
one line in the borrower's payment schedule.

---

## Setup

- Pick a **test loan** that is already released and has several unpaid monthly
  payments. Note its account number and its current balance — you will want to
  put it back afterward (ask the dev team for a reset, or use a throwaway loan).
- Logins: the `/login` page has one-click buttons per role (AR, Collector, …).

There is a dev tool that ages an account by a chosen number of days without
waiting real time: **AR → open the loan → "Simulate delinquency"** (enter a
number of days). It runs the exact same nightly job the system runs on its own.

---

## Part 1 — The late fee grows every month, on every missed month

| # | Action | You should see |
|---|---|---|
| 1.1 | As **AR**, open the test loan. Run **Simulate delinquency → 40 days**. | The oldest unpaid monthly payment now shows a **late fee** (about 5% of what that month owes, or 15% for a seafarer loan). Aging bucket moves to "31–60". |
| 1.2 | Run **Simulate delinquency → 70 days** on the same loan. | The **same** monthly payment's late fee is now **bigger** — a second month has been added, and the second month's fee was charged on _(month's amount + the first fee)_, not just the amount. |
| 1.3 | Run **Simulate delinquency → 100 days**. | A **third** month of fee has been added, again on the growing balance. Three separate fee lines exist in the payment's history. The account is now flagged for the remedial team (91+ days). |
| 1.4 | Look at the **second** unpaid monthly payment (the one after the oldest). | It **also** carries its own late fee now — every overdue month is charged, not just the oldest. Its fee is smaller because it has been overdue for less time. |
| 1.5 | Run the same 100-day simulation **again** immediately. | **Nothing changes.** Re-running the job the same day does not double-charge. |

**Part 1 is correct if:** the fee on a 3-months-late payment is visibly larger
than on a 1-month-late one, it kept growing (not one flat charge), *both* overdue
months carry a fee, and re-running the job changed nothing.

---

## Part 2 — Paid on time, receipt came in late → the fee is removed automatically

| # | Action | You should see |
|---|---|---|
| 2.1 | On a fresh test loan, run **Simulate delinquency → 40 days** so the oldest month gets a late fee. | The oldest monthly payment shows a late fee. |
| 2.2 | As **Collector**, record that borrower's payment for that month. Set the **payment date to on or before that month's due date** (i.e. they really paid on time). Batch it into a DCRR and have **AR** post it. | After posting: that monthly payment shows **paid**, and its **late fee is gone** (back to ₱0). Nobody had to press a "waive" button. |
| 2.3 | Open the payment's fee history. | The earlier fee lines are marked **reversed** ("paid on or before due date"), and there is a matching **negative** line that cancels them out. Nothing was deleted — the history still shows what happened. |

**Part 2 is correct if:** recording an on-time-dated payment made the late fee
disappear by itself, with a visible reversal trail.

---

## Part 3 — Paid late and only part of it → the fee is recomputed on what's left

| # | Action | You should see |
|---|---|---|
| 3.1 | On a fresh test loan, run **Simulate delinquency → 40 days**. | Oldest month (say it owes ₱10,000) now has a ~₱500 late fee. |
| 3.2 | As **Collector**, record a **partial** payment — e.g. ₱5,000 — dated **today** (i.e. late). Post it through **AR**. | The monthly payment is now **partly paid**. Its late fee is **recomputed** down to about **5% of the ₱5,000 that is still unpaid** (~₱250) — not left at ₱500, and not wiped to ₱0. |
| 3.3 | Run **Simulate delinquency → 70 days**. | The remaining ₱5,000 now carries a **second** month of fee, compounding — the leftover keeps aging like any unpaid balance. |

**Part 3 is correct if:** a partial late payment left a smaller, recomputed fee
on the remaining balance, and that remainder kept accruing.

---

## Part 4 — The system records how much of a payment was late-fee money

| # | Action | You should see |
|---|---|---|
| 4.1 | On a test loan with a monthly payment of ₱10,000 that has a ₱500 late fee, record a payment of **₱10,500** (late-dated) and post it. | The monthly payment shows **paid**. |
| 4.2 | As a **reports** user, open **Reports → Collections** and look at **"Penalty income"** for today's date range. | It reflects the **₱500** fee portion of that payment — the fee money that was actually **collected**, separate from the ₱10,000 loan payment. |
| 4.3 | Repeat 4.1 but with an **on-time-dated** payment of ₱10,000 (no fee). | "Penalty income" does **not** move — an on-time payment carries no fee. |
| 4.4 | Repeat with a payment where Collections granted a **₱200 fee discount** (borrower hands over ₱10,300). | "Penalty income" goes up by **₱300**, not ₱500 — the ₱200 that was written off is not counted as collected. |

**Part 4 is correct if:** "Penalty income" tracks only the fee portion actually
received, and ignores on-time payments and written-off amounts.

> **Not in this batch:** a field where the collector *types* the fee split by
> hand. Right now the system splits it automatically (fee first, then loan).
> The manual override is a later change.

---

## Part 5 — One bad account can't stop the nightly job

| # | Action | You should see |
|---|---|---|
| 5.1 | (Dev) point one active account's "segment" at a bad value, then run the nightly aging job. | The job **finishes** and reports how many accounts it refreshed and how many it skipped. Every other account is aged normally; only the bad one is skipped (and logged). Previously the whole run stopped at the first bad account. |

---

## Result sheet

| # | Check | OK? |
|---|---|---|
| 1 | 3-months-late fee is bigger than 1-month-late, and it compounded | ☐ |
| 2 | Every overdue month carries its own fee, not just the oldest | ☐ |
| 3 | Re-running the nightly job the same day changes nothing | ☐ |
| 4 | An on-time-dated payment removes the fee automatically, with a reversal trail | ☐ |
| 5 | A partial late payment leaves a smaller recomputed fee on the remainder | ☐ |
| 6 | "Penalty income" report shows only the fee money actually collected | ☐ |
| 7 | The nightly job survives one bad account | ☐ |

> Still to come (separate batch): the collector-typed fee-split field, the
> per-payment balance breakdown on the ledger, and the "stop interest after 3
> months" rule for Invoice/Auto/Real-Estate loans.
