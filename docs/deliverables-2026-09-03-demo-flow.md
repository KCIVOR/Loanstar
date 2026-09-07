# Demo Flow — September 3 Deliverables

**Audience:** Sir Rene
**Presenter:** Rovick
**Format:** live walkthrough, same Google Meet, 1:00 PM

This is a step-by-step script. For each item: what to type in, what to click,
and what the screen should show. Follow one loan from the calculator all the
way to collection.

> The example numbers below assume the loan is **released today**. If you run
> it on another day, the dates shift but the shape of the result is the same.

---

## Before the call — checklist

- [ ] Use the **live server**, not local. (The demo problem last time was a
      local-environment issue.)
- [ ] Have one **existing active borrower account** open in another tab — you
      need it for the Offset and Move of Payment parts.
- [ ] Logins ready: **CSA**, **Collector**, **AR**.
- [ ] Decide beforehand how to handle **Item 2 (penalty breakdown)** — see that
      section.

---

# PART 1 — CALCULATOR CHANGES

## 1a. Daily schedule (Deliverable 5)

**In plain words:** a short-term loan with one known payoff date. The borrower
pays everything once, on that date. Interest is counted by the day.

### What to input

| Field | Value |
|-------|-------|
| Loan type | Individual - Standard |
| Interest | `3` |
| Processing fee | `5` |
| Admin fee | `0` |
| Chattel mortgage fee | `0` |
| Input mode | Principal |
| Loan schedule | **Daily** |
| Amount | `54000` |
| Payment date | pick a date **10 days from today** |

Then click **Recalculate**.

### What to point out while typing

- The moment you pick **Daily**, the **Terms** and **Add-on months** boxes
  disappear — a daily loan has no monthly terms. A **Payment date** box appears
  instead.

### Expected output

| Line | Value |
|------|-------|
| Principal | ₱56,700.00 |
| Net released (what the borrower gets) | ₱54,000.00 |
| Number of days charged | 10 |
| Interest | ₱567.00 |
| Total to pay | ₱57,267.00 |
| Schedule | **one row only**, due on the payment date, ₱57,267.00 |

### What to say

- "The staff picks the payoff date. The system counts the days from today to
  that date — here, 10 days — and charges interest only for those days."
- "It's one single payment. No monthly schedule."

### If Sir Rene asks about the rate

"Right now we divide the monthly rate by 30 to get the daily rate. Your Excel
divides by the actual number of days in the month. They match for a 30-day
month. Do you want us to match the Excel exactly?" — note it, don't promise a
change on the call.

---

## 1b. Special quarterly & two-monthly schedule (Deliverable 4)

**In plain words:** for the big clients who pay **interest only** each period,
then pay the **whole principal at the very end** (one big final payment).

### Demo A — Quarterly (Special)

**What to input**

| Field | Value |
|-------|-------|
| Loan schedule | **Quarterly (Special)** |
| Amount | `500000` |
| Interest | `3` |
| Processing fee | `5` |
| Terms | `12` (must be a multiple of 3) |
| Add-on months | `0` |

Click **Recalculate**.

**Expected output**

| | Value |
|---|---|
| Principal | ₱525,000.00 |
| Total interest | ₱189,000.00 |
| Total loan | ₱714,000.00 |
| Number of payments | 4 (one every 3 months) |
| Payment 1 (in 3 months) | ₱47,250.00 — interest only |
| Payment 2 (in 6 months) | ₱47,250.00 — interest only |
| Payment 3 (in 9 months) | ₱47,250.00 — interest only |
| Payment 4 (in 12 months) | ₱47,250.00 interest **+ ₱525,000.00 principal = ₱572,250.00** |

### Demo B — Two-monthly (Special)

**What to input**

| Field | Value |
|-------|-------|
| Loan schedule | **Two-monthly (Special)** |
| Amount | `300000` |
| Interest | `3` |
| Processing fee | `5` |
| Terms | `6` (must be a multiple of 2) |
| Add-on months | `0` |

Click **Recalculate**.

**Expected output**

| | Value |
|---|---|
| Principal | ₱315,000.00 |
| Total interest | ₱56,700.00 |
| Total loan | ₱371,700.00 |
| Number of payments | 3 (one every 2 months) |
| Payment 1 (in 2 months) | ₱18,900.00 — interest only |
| Payment 2 (in 4 months) | ₱18,900.00 — interest only |
| Payment 3 (in 6 months) | ₱18,900.00 interest **+ ₱315,000.00 principal = ₱333,900.00** |

### What to say

- "The normal quarterly and two-monthly schedules you saw last time are
  untouched. This is a separate, clearly labelled option."
- "Interest only every period, then one final payment for the full principal
  plus the last interest."

### Naming note if it comes up

"You said 'by monthly' meaning every two months, so it's built as two-monthly.
The 15-day bi-monthly schedule was left out, as agreed."

---

## 1c. Offset early-settlement discount (Carry-over fix)

**In plain words:** the fix for the discount that vanished after refresh in the
last demo. A borrower closing an existing loan early gets part of the interest
waived.

### What to input

| Step | Action |
|------|--------|
| 1 | Start a new application, open the calculator |
| 2 | Under **Offset (full settlement)**, pick the borrower's existing loan account |
| 3 | Click **Apply early settlement discount** |
| 4 | Tick 2 future months, set each to **50%** |
| 5 | Click **Recalculate** |
| 6 | **Refresh the whole page** |

### Expected output

- After Recalculate: the payoff amount for that account **goes down** by the
  waived interest.
  *Example only — real numbers depend on the account:* if the account's payoff
  is ₱134,627.40 and you waive ₱2,000 of interest, the payoff becomes
  ₱132,627.40.
- After Refresh: **the discount is still shown.** It saved.
- The discount also appears in the **deduction breakdown** on the computation.

### What to say

- "Last time this didn't stay after a refresh — that was the local test
  environment. On the live server it saves and comes back."

### Then keep going

Endorse → Committee → LRA → **release this loan**, so the offset can be shown on
the AR side in Part 3.

---

# PART 2 — COLLECTION CHANGES

## 2a. Move of Payment — the amount to pay (Deliverable 1)

**In plain words:** the one-time relief that pushes a payment forward. Last time
the "amount to pay" figure was still rough (~85%). It's now exact.

### What to input

| Step | Action |
|------|--------|
| 1 | Log in as **Collector**, open an active account with a monthly schedule |
| 2 | Click **Move of Payment** |
| 3 | Select one open payment to move (e.g. the September 15 payment) |
| 4 | Read the **Surcharge** figure shown for that payment |
| 5 | Set a new deadline (e.g. 3 days later), click **Confirm** |
| 6 | **Refresh** the account |

### Expected output

| | Value |
|---|---|
| Surcharge to move the payment | **one month's interest** for that payment. *Example:* if the loan's interest is ₱3,000 per month, the surcharge is ₱3,000. |
| Loan total | **unchanged** — the surcharge is not added to it |
| Schedule | the moved payment shows a **"moved"** status; the schedule tail extends by one month (e.g. it now ends December instead of November) |
| AR ledger | the same surcharge amount appears as its own line |

### What to say

- "The amount is now exactly one month's interest for that payment — correct
  and stable, not the rough figure from the demo."
- "It does not add to the loan total. If the borrower misses the new deadline,
  the whole schedule goes back to normal and a penalty applies — automatically."

---

## 2b. Collector discount in the DCRR (Deliverable 3)

**In plain words:** a Collector can give an **approved** discount to a good
payer settling an active account — on interest and on built-up penalties. This
is not an offset and there is no new loan.

### What to input

| Step | Action |
|------|--------|
| 1 | Log in as **Collector**, open the DCRR for a payment on an active account |
| 2 | Find the **Interest discount** section — tick 1 payment that is **not yet due**, set **50%** |
| 3 | Find the **Penalty discount** section — tick 1 payment that is **overdue and has a penalty**, set **50%** |
| 4 | **Try to submit without the approval note** — it should be blocked |
| 5 | Fill in the note: e.g. "Approved by Sir Rene, 09/03, per phone call" |
| 6 | Submit |

### Expected output

| | Value |
|---|---|
| Interest discount | *Example:* payment's interest is ₱3,000 → 50% → **₱1,500** waived |
| Penalty discount | *Example:* penalty is ₱1,000 → 50% → **₱500** waived |
| Without the note | submit is **blocked** with a message that a reason is required |
| After submit | the discount shows in the **AR / PDC discount column**, marked as coming from the **Collector** |
| Receipt / letter | the discount amount and the approval note appear on the payment receipt |
| The real contract amount | **unchanged** — the discount is a separate figure |
| Approval path | the payment still goes through **normal accounting approval** |

### What to say

- "Only the Collector role can do this — it's a new permission."
- "Management approves the amount outside the system first. The Collector only
  enters what was approved, and the note is required — no note, no submit."
- "It never changes the real contract amount, and it only applies when the
  payment actually posts."
- "It can bring a big compounded penalty down so the account can be closed."

---

# PART 3 — DOWNSTREAM CONFIRMATION

## 3c. Offset payoff reaches AR (continues 1c)

### What to input

| Step | Action |
|------|--------|
| 1 | Log in as **AR**, go to **Internal Transfers** |
| 2 | Find the pending transfer from the loan you released in Part 1c |
| 3 | Click **Confirm** |
| 4 | Open the **target account** and check its balance |

### Expected output

*Using the transfer already tested:*

| | Value |
|---|---|
| Pending transfer | Loan **AN300452** paying off account **AN300442** |
| Amount | **₱83,781.00** (this is the payoff **after** the discount) |
| Target account balance before | ₱134,627.40 |
| After Confirm | the amount is applied to the target account and its **balance goes down** |

### What to say

- "The offset payoff — after the discount — comes here for AR to confirm, then
  it reduces the other account's balance."
- Open question: "The amount shown here is the payoff **after** the discount.
  Do you want the discount shown as its own separate line on this screen, or is
  the net amount reducing the balance what you meant?"

---

# PART 4 — PENALTY BREAKDOWN (Deliverable 2)

**Status:** the per-item penalty breakdown — the view that shows, for each
overdue period, the base amount, the rate, and how it compounds — **could not
be found in the shared system.** No screen, no report, no document.

### Options for the call — decide beforehand

- **If it's on your machine and not yet shared:** demo it from local, and
  commit to sharing it right after the call.
- **If it isn't built yet:** say so plainly. Show what exists today (the
  penalty column on the ledger) and describe what's still needed — the itemised
  view with each overdue period listed once, no duplicates.
- Either way, mention the August 25 fix that **is** live: the system no longer
  re-charges penalties every night.

**Do not present this as done if it isn't visible in the shared system.**

---

# CLOSING — 3 QUESTIONS FOR SIR RENE

1. **Penalty breakdown** — is it on your machine and not yet shared, or still
   to be built?
2. **Daily rate** — keep dividing by a flat 30, or match the Excel (divide by
   the actual days in the release month)?
3. **Offset discount on the AR screen** — separate discount line, or is the net
   payoff amount reducing the balance enough?

---

# ONE-LINE RECAP FOR THE CHAT AFTERWARD

> Demoed: daily schedule, special quarterly & two-monthly, offset discount
> save + AR flow, Move of Payment amount, Collector discount in DCRR.
> Open: penalty breakdown (to confirm), daily rate basis, offset discount
> display on the AR screen.
