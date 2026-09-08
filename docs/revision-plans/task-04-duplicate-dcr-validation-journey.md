# Task 4 — validation journey (warn / block duplicate DCRRs)

Covers what is **implemented** (Phases 1–6): the record-payment warning, the
"DCR pending" queue badge, and the **hard block** at DCRR add + submit.
The override path is not built (client decision pending) — every conflict here
is a hard stop.

Plan: [task-04-duplicate-dcr-IMPLEMENTATION-plan.md](task-04-duplicate-dcr-IMPLEMENTATION-plan.md).

---

## Part A — Preconditions

- Log in as **Collector** (`collector@loanstar.local` on the seed DB, or your
  own collector account). Remedial parity is checked in Part F.
- You need **two of your assigned accounts** with **no "DCR pending" badge**
  showing on `/collector/accounts` at the start — call them **ACC-1** and
  **ACC-2**. Each should have at least one open (unpaid) installment.
- Nothing to seed in SQL. If you want a clean slate, first go to
  `/collector/dcr`, and **reject** any draft/submitted DCRRs you don't need.

Exact wording is quoted below — the test passes only if the message matches.

---

## Part B — "DCR pending" badge on the queue

1. On **ACC-1**, open **Record payment**, enter any amount + today's date + a
   reference no. (e.g. `TEST-B1`), and **Record payment**.
2. Go back to `/collector/accounts`.

**Expected**
- **ACC-1's row now shows a `DCR pending` badge** (amber), next to the account
  number in the table view / next to the aging badge in the card view.
- Hovering the badge shows *"1 payment(s) recorded, not yet posted by Accounting"*.
- **ACC-2 (untouched) shows no badge.**
- The KPI tiles at the top (Assigned / Total balance / …) are **unchanged** —
  the badge must not shift any total.

---

## Part C — Record-payment warning (informational, does NOT block)

1. Still on **ACC-1**, open **Record payment** again.

**Expected — before you submit**
- An amber notice appears above the form:
  > "This account already has **1 payment** totalling **₱<amount from B1>**
  > recorded and waiting for Accounting to post. Recording another may
  > double-count — review the pending payments below before continuing."
  > "Pending ref: **TEST-B1**"

2. Enter a second payment (amount, date, reference `TEST-C1`) and **Record
   payment**.

**Expected — after submit**
- It **succeeds** (this is a warning, not a block — a genuinely separate
  payment is allowed).
- The success banner reads:
  > "Payment recorded and ready for the DCR workflow. Recorded. Note: **1**
  > other payment on this account **is** still waiting for Accounting to post."
- Re-opening Record payment now shows the notice with **2 payments** and both
  refs (`TEST-B1, TEST-C1`).

> Cosmetic nit to note, not a failure: the banner says "Recorded" twice
> ("…workflow. Recorded. Note:…"). Flag it if you want it tidied.

---

## Part D — HARD BLOCK when a second DCRR covers the same installment

This is the core of Task 4 — the scenario from the Sept-04 demo.

1. Go to `/collector/dcr`. Create a **new DCRR** (this is **DCR-1**).
2. Add payment **TEST-B1** to DCR-1. It auto-allocates to ACC-1's oldest open
   installment(s). **Leave DCR-1 as a draft** (do not submit yet).
3. Create **another new DCRR** (**DCR-2**).
4. Try to add payment **TEST-C1** (same account, ACC-1) to DCR-2.

**Expected**
- **Blocked.** An error appears and TEST-C1 is **not** added to DCR-2:
  > "One or more installments this payment covers are already on another
  > unposted DCRR for this account. Post or reject that DCRR first, or remove
  > the overlapping allocation."
- DCR-2 still has 0 items.

---

## Part E — HARD BLOCK also fires at submit (backstop)

Set up the race where two drafts were built before either was submitted.

1. Reject DCR-2 (from Part D) so it's out of the way. Keep **DCR-1** as a draft
   containing TEST-B1.
2. Create **DCR-3**. Add payment **TEST-C1** to it — this time it is **allowed**
   (DCR-1 is still just a draft and… wait). *If Part D already blocks the add,
   it will block here too — that's fine, it means the add-time guard is doing
   its job. To test the submit backstop specifically, use two payments on two
   different installments:*
   - Record a **third** payment on ACC-1 (`TEST-E1`) for a **small** amount
     (e.g. ₱100) so auto-allocation lands it on a **later** installment than
     TEST-B1's.
   - Add **TEST-B1** to **DCR-1** (installment #1), add **TEST-E1** to
     **DCR-3** (installment #2) — both adds succeed (different installments).
3. Now **submit DCR-1**.
4. Then **submit DCR-3**.

**Expected**
- Steps 2 adds both succeed (no installment overlap).
- **DCR-1 submits fine.**
- If the two payments happened to overlap an installment after all,
  **submitting DCR-3 is blocked**:
  > "This DCRR overlaps installment(s) already on another unposted DCRR for
  > the same account. Resolve that before submitting."
- If they truly don't overlap, **both submit fine** — that's the correct
  "different months / different installments are allowed" behaviour Rovick
  described.

> The cleanest, deterministic version of E: make TEST-B1 and TEST-E1 both large
> enough to cover ACC-1's **first** installment. Add TEST-B1 → DCR-1 (draft,
> not submitted). Add TEST-E1 → DCR-3 — **this add is blocked by Part D's
> guard**. So in practice the add-time block (Part D) catches this before
> submit ever matters; the submit backstop is belt-and-braces for edge timing.

---

## Part F — Regression / must-still-work

| # | Do this | Expected |
| :- | :- | :- |
| F1 | Add a payment for **ACC-2** (a different account) to any draft DCRR | **Allowed** — different account, different installments, no block |
| F2 | **Post or reject DCR-1** (as AR / from the AR DCRR screen), then retry adding TEST-C1 to a new DCRR | **Allowed** now — the conflicting DCRR is resolved |
| F3 | Try to add the **same payment** (TEST-B1) to **two** DCRRs | Still blocked by the original guard: *"Payment is already on a DCRR"* |
| F4 | Add a payment on an account with **no other unposted payment**, single DCRR | **Allowed**, no warning, no badge — the feature is invisible when there's nothing pending |
| F5 | AR reconcile / posting flow | **Unchanged** — no new step, same screens; report totals and account balances unaffected |

---

## Part G — Remedial parity

1. Log in as **Remedial** (`remedial@loanstar.local`).
2. On a remedial account, record a payment, then re-open Record payment.

**Expected**
- Same amber "already has N payment(s)…" notice (Part C).
- On `/remedial` the account row shows the same **`DCR pending`** badge.
- Building a remedial DCRR that overlaps an installment already on another
  unposted DCRR is **blocked** with the same Part D message.

---

## Part H — Cleanup

- `/collector/dcr` (and `/remedial/dcr`) → **reject** every test DCRR (DCR-1,
  DCR-3, any others).
- The test `payments` rows (`TEST-B1`, `TEST-C1`, `TEST-E1`) will return to the
  desk as unbatched; leave them or have AR reject them.
- The "DCR pending" badge clears once the test payments are posted or their
  DCRRs rejected and the payments removed.

---

## What "correct" means (summary)

| Behaviour | Pass condition |
| :- | :- |
| Badge | Shows on accounts with ≥1 recorded-unposted payment, hidden otherwise; KPIs unchanged |
| Record-payment warning | Shows the count + total + refs; recording still **succeeds** (non-blocking) |
| Add block | A second DCRR item covering an installment already on another **draft/submitted** DCRR is **refused** with the Part D message |
| Submit block | Same refusal at submit for a draft built before the conflict |
| Different installments / accounts | **Allowed** — multiple DCRRs are fine as long as they don't overlap an installment |
| Resolve & retry | Once the other DCRR is **posted or rejected**, the block lifts |
| Same-payment guard | Still blocks re-batching one payment (`"Payment is already on a DCRR"`) |
| Posting pipeline / balances / reports | **Unchanged** |

**Open for the client at the demo:** should the block be *hard* (as tested
here) or an **override-with-reason**; should the scope be *same-installment*
(as built) or *any unposted payment on the account*; message wording.
