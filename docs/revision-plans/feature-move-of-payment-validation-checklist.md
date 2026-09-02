# Move of Payment — Step-by-Step Validation (User Journey)

**Purpose:** a manual walkthrough to confirm the feature works as designed, in plain steps anyone can follow — not a developer document. Every "Expected Result" below was already observed once during live testing on 2026-09-01; this checklist lets you (or anyone else) reproduce the same checks independently.

**Before you start:**
- You'll need a Collector login and an AR login (use the "Quick login (seed accounts)" panel on the login screen if testing in a non-production environment).
- Pick a real, active loan account that has **not** used Move of Payment yet, has an upcoming payment still unpaid, and is **not** an Invoice (Weekly) loan. Any regular Monthly, Salary, or Bi-Monthly loan works.
- Write down the account's borrower name and loan number before you begin — you'll need to find it again partway through.

---

## Journey 1 — A Collector offers Move of Payment (happy path)

| # | Action | Expected Result |
|---|---|---|
| 1 | Log in as **Collector**. Go to **Accounts**. | You see your list of assigned borrower accounts. |
| 2 | Find your test account. Look at its row of action buttons. | Alongside "Loan File," "Demand letter," "Log contact," and "Record payment," there is a **"Move of payment"** button. |
| 3 | Click **"Move of payment."** | A new page opens showing the borrower's name, the account number, and a **table listing every one of their open installments**, each with its own due date and its own **exact surcharge amount** (one month's interest) for moving that specific one. |
| 4 | Without selecting a row or touching the date field, look at the **"Offer Move of Payment"** button. | The button is **greyed out / disabled** — you cannot proceed without picking both an installment and a date first. |
| 5 | Click any row in the table (it doesn't have to be the earliest one), then click the date field and pick a real future date (e.g., a few weeks out). | The row you clicked is now marked selected, the date field shows your chosen date, and **"Offer Move of Payment" becomes clickable.** |
| 6 | Click **"Offer Move of Payment."** | A confirmation popup appears, naming the **specific due date you selected**, the surcharge amount, the deadline date you picked, and a warning that **this can only be used once per loan.** |
| 7 | Click **"Confirm"** in the popup. | The popup closes and a **green success message** appears: "Move of Payment applied," showing the surcharge amount and the deadline you set. |
| 8 | Refresh the page (or navigate away and back to the same account's Move of Payment page). | Instead of the offer form, you now see: **"Not eligible — Move of Payment has already been used on this loan."** The offer form is gone. |

**What this proves:** the whole staff-facing flow works, you can freely pick which installment to move (not just the earliest one), the surcharge shown for each is real (not a placeholder), the deadline is something *you* choose (never auto-filled), and the system correctly remembers it's been used.

---

## Journey 2 — The account's records reflect what happened

| # | Action | Expected Result |
|---|---|---|
| 1 | Log in as **AR**. Go to **Masterlist**, and open the same account you just tested. | The account detail page loads. |
| 2 | Look just below the Principal / Monthly / Terms summary. | A small note reads: **"Move of Payment already used on [the date you confirmed it]."** |
| 3 | Scroll down to **Account ledger.** Find the row for the payment date you moved. | That row now shows: **Target column is blank ("—")**, **Debit and Credit both show the surcharge amount**, and its **Status badge says "moved."** |
| 4 | Compare the account's **Balance** column before and after that row. | The balance is **unchanged** across that row — the surcharge did not reduce what the borrower owes. |
| 5 | Check the **Report Total** row at the very bottom of the ledger. | Debit total minus Credit total still equals the account's real Outstanding Balance shown at the top of the page — the numbers still add up correctly. |

**What this proves:** the surcharge is visible on the books as real money that moved, without secretly reducing the loan balance, and the ledger's own math still checks out.

---

## Journey 3 — Excluded loan types are correctly blocked

| # | Action | Expected Result |
|---|---|---|
| 1 | As Collector, find an **Invoice (Weekly)** loan account you're assigned to. | — |
| 2 | Open its **Move of Payment** page. | Instead of the offer form, you see **"Not eligible"** with a message explaining Move of Payment doesn't apply to Invoice loans. |

**What this proves:** the one confirmed exclusion (Invoice/Weekly loans) is actually enforced, not just documented.

---

## Journey 4 — Missing the shifted deadline reverts everything

*This one requires either waiting for a real deadline to pass, or using a test/staging environment's date-simulation tool if available.*

| # | Action | Expected Result |
|---|---|---|
| 1 | Complete Journey 1 on a fresh test account, setting the deadline to a date that has **already passed** (or wait for a real one to pass). | — |
| 2 | Trigger the account's aging/penalty check to run (this normally happens automatically overnight, or via a staff "simulate" tool in test environments). | — |
| 3 | Reopen the account. | The moved payment is **back to its original due date**, no longer marked "moved." |
| 4 | Check the ledger and the account's aging status. | A **normal penalty now applies**, the same as if Move of Payment had never been used — but the one-time use is still considered spent; it cannot be offered again on this loan. |

**What this proves:** the safety net works — a borrower who doesn't follow through doesn't get a free pass, they just get treated exactly as if they'd missed a normal payment.

---

## Journey 5 — Quarterly / Two-Monthly loans (if applicable)

*Skip this journey if your test environment has no active Quarterly or Two-Monthly loans yet.*

| # | Action | Expected Result |
|---|---|---|
| 1 | Find an account on a **Quarterly** or **Two-Monthly** payment schedule. | These loans store one real payment as two internal entries (interest and principal) — invisible to you normally. |
| 2 | Offer and confirm Move of Payment on it, same as Journey 1. | The confirmation and success messages work exactly the same way — no visible difference. |
| 3 | Check the account's ledger. | You see **exactly one "moved" row** for that payment date — not two — and the surcharge shown matches only the interest portion. |
| 4 | If you also let this one revert (Journey 4's steps), check the ledger afterward. | **Both** internal entries return to normal together — never just one of them. |

**What this proves:** the more complex loan types are handled correctly behind the scenes, and the borrower/staff never see the internal complexity.

---

## Journey 6 — There's a paper trail

| # | Action | Expected Result |
|---|---|---|
| 1 | As a Super Admin or whoever has access to the system's audit log, search for the account you tested in Journey 1. | There is **exactly one** logged entry for the Move of Payment action — not zero, not two. |
| 2 | Open that entry. | It records who did it (the Collector), when, the surcharge amount, and the deadline chosen. |

**What this proves:** every use of this feature is traceable to a specific staff member and moment — nothing happens silently.

---

## Quick reference — what "done correctly" looks like end to end

- ✅ Button only shows where it should (per-account action bar), never as a borrower-facing option.
- ✅ Surcharge amount shown to staff is always the real, computed number — never a placeholder.
- ✅ Deadline is always something a human types in — never pre-filled or guessed.
- ✅ Confirmation step exists before anything is final.
- ✅ Can only ever be used once per loan — enforced, not just written down as a rule.
- ✅ Invoice (Weekly) loans are excluded.
- ✅ The ledger shows exactly what happened, without disturbing the running balance.
- ✅ Missing the new deadline reverts everything and applies a normal penalty.
- ✅ Every action is logged with who/when/how much.
