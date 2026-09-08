# Full Offset — Plain Walkthrough (what to click, what to type, what you should see)

**What this proves:** when a borrower takes a new loan and uses part of it to
**pay off an old loan of theirs in full**, the old loan ends at **₱0.00 and is
marked Paid / Closed** — even when the old loan's last payment is one big
"balloon" amount. (In the September-04 demo the old loan kept a leftover balance.
This walkthrough confirms it no longer does.)

You do **not** need any technical knowledge. Just follow the rows: **do the
action**, then **check the "You should see" matches**. If every row matches, the
feature is working.

---

## The setup (already in the system — nothing to create)

- **Borrower for the demo:** Rosa Dela Cruz
- **Her existing loan (the one we will pay off):** account **AN300454**
  - Current balance: **₱714,000.00**
  - It's a "Quarterly Special" loan: it has 8 payment lines; lines 1, 3, 5, 7
    are interest (₱47,250 each) and **line 8 is one big ₱525,000 principal
    payment** (the "balloon").
- **Login:** open the app, go to the login page. There are one-click buttons for
  each role (CSA, CIG, Committee, LRA, AR…). Click a button to sign in as that
  role. To change role: top-right menu → **Log out** → click the next button.

### First, confirm the starting point

| Do | You should see |
|---|---|
| Sign in as **AR**. Left menu → **Masterlist**. In the search box type `AN300454`. | One result: **Rosa Dela Cruz — AN300454**, **Outstanding ₱714,000.00**, Status **active**. |

Write down **₱714,000.00** — that's the number that must become **₱0.00** by the end.

---

## Step 1 — CSA creates the new loan and sets up the payoff

Sign in as **CSA**.

| # | Do this | Enter exactly | You should see |
|---|---|---|---|
| 1.1 | Click **New application**. For the borrower, choose **Rosa Dela Cruz**. | — | The application workspace opens for Rosa Dela Cruz. |
| 1.2 | Fill in the borrower details the form asks for. In the income field, enter: | **Monthly income: 400000** | The profile saves. |
| 1.3 | Do the **NCL check** and mark it **Pass**. | — | An NCL "Pass" badge shows. |
| 1.4 | Open the **Computation** section. Fill the loan fields: | **Loan type:** Multi-Purpose Loan  ·  **Amount:** 1000000  ·  **Terms:** 12  ·  **Payment schedule:** Monthly | — |
| 1.5 | Click **Compute** (or **Recalculate**). | — | A result appears: a "Net released" amount, total interest, a monthly payment figure. |
| 1.6 | Scroll down to **"Other deductions"**. You'll see **two** boxes side by side. Use the **left** one, titled **"Offset — full settlement (closes the loan)"**. Open its **Target loan** dropdown and choose **AN300454 — ₱714,000.00 bal**. | Pick **AN300454** from the dropdown | The amount next to it fills in automatically as **₱714,000.00** and is shown as plain text — **you cannot change it to a smaller number**. A note says: *"Pays the target loan's entire remaining balance so it closes…"* |
| 1.7 | Click the **"Apply early-settlement discount"** button on that row. | — | A popup opens titled **"Early-settlement discount"**. It lists payment lines **1, 3, 5, 7** only (the interest lines), each with a checkbox and a "%" box showing **100**. **Line 8 (the ₱525,000 balloon) is NOT in the list** — principal is never discounted. Paid lines (2, 4, 6) are not listed either. |
| 1.8 | Tick the checkbox for line **3** and line **5**. Leave both at **100**. Click **Apply**. | Tick **3** and **5** | The popup closes. The offset row now shows three lines: **Balance ₱714,000.00** · **Early-settlement discount −₱47,250.00** · **Final amount ₱666,750.00**. Links "Edit discount" and "Remove discount" appear. |
| 1.9 | Click **Compute** again. | — | In the deductions breakdown there's a line **"Offset — full settlement — Closes account AN300454"** with the value **₱666,750.00**. The "Net released" figure is about **₱666,750 lower** than before you added the offset. |

**Step 1 is correct if:**
- the offset amount locked itself to **₱714,000.00** and couldn't be lowered,
- the discount popup did **not** offer line 8 (the balloon),
- the **Final amount** is **₱666,750.00** (that's ₱714,000.00 minus the
  ₱47,250.00 discount).

---

## Step 2 — Send the new loan through approval and release

This part is the normal loan process — just move it forward at each stage. The
exact figures here don't matter; only that the loan reaches "released".

| # | Sign in as | Do this | You should see |
|---|---|---|---|
| 2.1 | **Borrower** (Rosa Dela Cruz) | Open the application, **sign the computation**. | It shows as signed. |
| 2.2 | **CSA** | Open **"Endorse to CIG"** and click it. | Status moves to CIG / verification. |
| 2.3 | **CIG** | Open the file, fill the verification form, click **Submit CI report**. | The file moves to Committee. |
| 2.4 | **Committee** | Cast the vote(s), then click **Approve**. | Status becomes Approved. |
| 2.5 | **CSA** | Click **Disclose** to send the terms to the borrower. | Borrower can now accept. |
| 2.6 | **Borrower** | **Accept the terms / sign again** if asked. | Signed. |
| 2.7 | **LRA** | Open the release file → choose **With PDC** → **Generate documents** → complete the **signing** for every document → have the **Briefer** acknowledge the briefing → upload the **Employment contract** → click **Record release** → upload the signed scans → **Close file**. | Status becomes **Released**, then **Closed**. |

After the loan is released, the payoff has been created and is now waiting for
Accounting. Continue to Step 3.

---

## Step 3 — Accounting confirms the payoff (this is the important part)

Sign in as **AR**.

| # | Do this | You should see |
|---|---|---|
| 3.1 | Left menu → **Internal transfers**. | One row waiting. **Target account: AN300454** with the note **"Current balance ₱714,000.00"**. **Type: Offset (full payoff)**. **Amount: ₱666,750.00**. **Discount: ₱47,250.00** (inst. 3, 5). Buttons: **Confirm** / **Reject**. |
| 3.2 | Click **Confirm**. | A dialog opens: *"Reduce **AN300454**'s balance by **₱714,000.00** … An early-settlement discount of **₱47,250.00** in interest on installments 3, 5 is forgiven … settling the account's current balance of **₱714,000.00** in full."* |
| 3.3 | Click **"Yes, post it"**. Wait a moment. | A green message: **"Posted — AN300454 balance updated."** The waiting count goes to **0** and the row disappears. |
| 3.4 | Left menu → **Masterlist**. Search **AN300454**. | The row now shows **Outstanding ₱0.00** and Status **paid**. |
| 3.5 | Click **Open** on that row. | The account page shows: **Outstanding balance ₱0.00** · **"Installments paid 8/8"** · a **100%** bar · a **"paid"** label. |
| 3.6 | On that same page, scroll to the **Account ledger** table. | Every payment line shows **paid**. The last line, **line 8 (amount due 525,000.00 — the balloon)**, shows **no discount** and a credit of **525,000.00** — it was paid **in full**, not discounted. Line 5 shows a **47,250.00 discount**. |
| 3.7 | Left menu → **Posting history** → tab **"Closed accounts"**. | **AN300454** appears in the closed list — **₱0.00** — **Closed** with today's date. |

**Step 3 is correct if:**
- **AN300454's balance is ₱0.00** and its status is **paid / closed**,
- **8 of 8** payment lines are paid,
- the **balloon line (8) got ₱0 discount** and was paid in full,
- the discount that was actually used adds up to **₱47,250.00** (nothing was
  lost).

That's the whole test. The loan the borrower wanted to pay off is now closed
with no leftover balance — which is exactly what the client asked for.

---

## Optional Step 4 — Show the safety net (a payoff that's too small is refused)

This shows that if a payoff amount can't actually cover the loan, Accounting is
stopped instead of leaving a half-paid loan. It needs a small bit of setup by a
developer (seed one under-sized payoff), or you can skip it.

| # | Do this | You should see |
|---|---|---|
| 4.1 | (Dev sets up a payoff of only **₱300,000** against AN300454, which owes ₱714,000.) | A pending row in **AR → Internal transfers** with **Amount ₱300,000.00**, target AN300454. |
| 4.2 | As **AR**, click **Confirm** → **Yes, post it**. | It **fails** with a message like: *"This offset provides ₱300,000.00 but the target loan needs ₱714,000.00 to close … Reject this transfer and ask CSA for a recomputed amount."* |
| 4.3 | Check the **Masterlist** for AN300454. | It is **unchanged** — still **₱714,000.00**, still **active**. Nothing was half-applied. |
| 4.4 | Click **Reject** on the pending row (reason: `test`). | The row is cleared. |

---

## Result sheet (tick each one)

| # | What you checked | OK? |
|---|---|---|
| 1 | The payoff amount locked to the full balance **₱714,000.00** and couldn't be lowered | ☐ |
| 2 | The discount popup only offered the interest lines (1, 3, 5, 7) — never the ₱525,000 balloon line | ☐ |
| 3 | Final amount after discount = **₱666,750.00** | ☐ |
| 4 | After AR confirmed: **AN300454 = ₱0.00**, status **paid**, **8/8 lines paid** | ☐ |
| 5 | The balloon line (8) got **₱0 discount** and was paid in full | ☐ |
| 6 | (Optional) A too-small payoff was **refused**, and AN300454 was left untouched | ☐ |

If 1–5 are ticked, the fix is correct.

> **Note:** this runs on a test system. After the walkthrough, AN300454 will show
> as closed. If you need it back to ₱714,000.00 for another run, ask the dev team
> to reset it (there's a one-line restore).
