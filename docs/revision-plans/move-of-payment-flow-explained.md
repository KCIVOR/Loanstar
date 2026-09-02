# Move of Payment — How It Works, Stage by Stage (Plain Language)

**Written:** 2026-09-02. Based on reading the live code and the live database — not assumptions.

This walks through what actually happens, in order, when a collector uses Move of Payment,
and where the borrower and accounting fit in. It ends with a list of what is currently
broken or undefined.

**Example used throughout:** a loan paid monthly at **₱58,385.51** per month, 6 months left.
One month's interest works out to **₱10,528.54** — that is the "surcharge."

---

## Stage 0 — Normal loan, nothing done

The borrower's schedule:

| Payment | Due date | Amount | Status |
|--|--|--|--|
| 1 | Oct 10, 2026 | 58,385.51 | Not yet paid |
| 2 | Nov 10, 2026 | 58,385.51 | Not yet paid |
| 3 | Dec 10, 2026 | 58,385.51 | Not yet paid |
| 4 | Jan 10, 2027 | 58,385.51 | Not yet paid |
| 5 | Feb 10, 2027 | 58,385.51 | Not yet paid |
| 6 | Mar 10, 2027 | 58,385.51 | Not yet paid |

Total still owed: **₱350,313.06**.

---

## Stage 1 — Collector opens the "Move of Payment" screen

The collector goes to the borrower's account and opens **Move of Payment**. The screen shows
the full schedule with a **radio button on every unpaid payment** and a **"Surcharge" column**
next to each one showing ₱10,528.54 (one month's interest — the cost of moving that payment).

There is also a **deadline date box** and a note reminding them the surcharge is collected
separately.

**Nothing has changed yet.** This is just a preview.

---

## Stage 2 — Collector picks a payment, sets a deadline, confirms

The collector selects **Payment 1 (Oct 10)**, types a deadline of **Oct 15, 2026**, clicks
**Offer Move of Payment**, and confirms.

Now the schedule looks like this:

| Payment | Due date | Amount | Status |
|--|--|--|--|
| 1 | Oct 10, 2026 | 58,385.51 | **Moved** (surcharge ₱10,528.54, must pay by Oct 15) |
| 2 | Nov 10, 2026 | 58,385.51 | Not yet paid |
| 3 | Dec 10, 2026 | 58,385.51 | Not yet paid |
| 4 | Jan 10, 2027 | 58,385.51 | Not yet paid |
| 5 | Feb 10, 2027 | 58,385.51 | Not yet paid |
| 6 | Mar 10, 2027 | 58,385.51 | Not yet paid |
| **7 (new)** | **Apr 10, 2027** | **58,385.51** | Not yet paid |

What happened:

- Payment 1 is marked **Moved**.
- A **brand-new Payment 7** is added at the end (Apr 10, 2027) for the same amount — the
  loan's finish line moves out by one month.
- **What the borrower still owes does not change** — still ₱350,313.06, just spread
  differently.
- This account is now marked **"Move of Payment used"** — it can never be done again on this
  loan, even if it later falls through.

On the ledger, the moved payment shows as a single line: **+₱10,528.54 and −₱10,528.54 on the
same line**, so it cancels out and the balance stays ₱350,313.06. That line appears whether or
not the surcharge is ever actually paid — it is just a marker.

---

## Stage 3 — The surcharge gets recorded (two ways)

The system does **not** collect the surcharge for you. Someone has to record it like any other
payment.

**Way A — the collector records it** (borrower paid them in person / handed a deposit slip):
Collector → borrower's account → **Record payment** → amount ₱10,528.54, reference number,
channel. It is saved as a **confirmed payment**.

**Way B — the borrower uploads it** (through their own portal):
Borrower → **My loan → Submit payment proof** → amount ₱10,528.54, reference number, channel,
attach receipt. It is saved as **pending verification**, waiting for the collector.

Either way, at this point the surcharge payment exists but **has not hit the ledger yet**.

---

## Stage 4 — Collector puts the payment on a Daily Collection Report

The collector opens the **DCRR** screen, starts (or reuses) today's report, and adds the
surcharge payment to it.

A pop-up asks **which payments to apply the money to**:

- **Leave everything unchecked** → the ₱10,528.54 is recorded as extra money on the account,
  not paying down any installment. **This is what a surcharge should do.**
- Tick an installment → the ₱10,528.54 pays down *that* installment instead. **Wrong for a
  surcharge** — but nothing stops the collector from doing it.

---

## Stage 5 — Collector submits the report

The collector submits the DCRR. If the borrower uploaded the payment (Way B), submitting the
report is what marks it **confirmed**.

Still not on the ledger.

---

## Stage 6 — Accounting checks the bank and posts it

Accounting opens the submitted DCRR, enters the **bank deposit reference and amount**, which
must match ₱10,528.54 exactly, and posts it.

**Now** the surcharge appears on the ledger as a real credit.

---

## Stage 7 — If the deadline (Oct 15) passes and the moved payment is not made

Every night the system checks. When Oct 15 passes:

- **Payment 7 (the Apr 10 one) is deleted.**
- **Payment 1 goes back to "Not yet paid"** on its original Oct 10 date.
- On the same nightly run it is now overdue, so a **penalty is added**.
- The account **stays marked "Move of Payment used"** — the borrower does not get another
  chance.
- Any surcharge that was already collected **stays collected** — it is not refunded.

---

## What is broken or missing right now

### 1. The amount owed can jump up by one month's payment — ✅ FIXED 2026-09-02 (Fixes Plan Phase 1)

After a Move of Payment, the system briefly holds two copies of the same obligation — the
"Moved" payment and the new payment at the end. The main "total owed" figure is not
recalculated at the moment of the move, so it still looks right. But the next time *anything*
recalculates it (any payment posting, any nightly run), it counts both copies and the total
owed **jumps up by ₱58,385.51**.

On the two test accounts this already shows:

| Account | Total owed shown now | What it becomes on next recalculation |
|--|--|--|
| AN300383 | 350,313.06 | **408,698.57** |
| AN300426 | 326,880.00 | **383,520.00** |

This is the biggest problem.

### 2. There is no way for the borrower to actually "make" the moved payment — ✅ RESOLVED 2026-09-02 (Fixes Plan Phase 5, decision D1 = A)

Decision D1 = A: this is **intended behaviour**, not a bug. The moved installment always
returns to the schedule on the deadline; there is deliberately no "pay it by then to keep the
move" path. Phase 5 reworded the UI to match — the field is now "Date the shifted payment
becomes due again", and the copy says the payment is deferred penalty-free until that date,
then becomes a normal (overdue-if-late) installment.

Original framing: the deadline said "pay by Oct 15 or it reverts", but the system had no path
to apply a payment to a Moved installment, so it always reverted regardless. The deadline is
really just "when the deferred payment comes back."

### 3. The surcharge is not tied to anything — ✅ FIXED 2026-09-02 (Fixes Plan Phase 2)

*Now: a "Record surcharge payment" step on the Move of Payment page creates the payment
tagged with the move's batch id, so it is structurally linked. The deadline still does not
check whether the surcharge was paid — that follows decision D1 ("the moved installment always
reverts on the deadline").*

Original: the surcharge payment was a loose payment with no link to the Move of Payment.
Nothing checks whether it was actually paid by the deadline. Matching them up was 100% manual.

### 4. The surcharge can look like it is counted twice — ✅ FIXED 2026-09-02 (Fixes Plan Phase 4a)

*Now: a collected surcharge shows on the ledger as its own "Surcharge received" line that does
**not** reduce the loan balance or the credit total (decision D2 = B). While the surcharge has
not been collected, a "moved" marker line shows the amount as before; once it is collected, the
marker line drops its amounts and only the "Surcharge received" line carries the money. With
problem #1 also fixed, the balance figures now agree.*

Original: there was the marker line on the ledger (which cancelled out), and then — if the
real surcharge was collected and left "unapplied" — a second line that lowered the displayed
balance. Meanwhile problem #1 had the "total owed" figure wrong in the other direction.

### 5. Nothing guides the collector on the DCRR pop-up — ✅ FIXED 2026-09-02 (Fixes Plan Phase 3)

*Now: a surcharge payment (tagged in Phase 2) opens the DCRR "Allocate payment" pop-up with
**nothing pre-checked** — the full amount goes to "Advance (leftover)" by default — plus a
banner explaining it's a Move of Payment surcharge and should stay unallocated. The collector
can still override.*

Original: if they ticked an installment out of habit, the surcharge quietly paid down next
month instead of being an extra charge. (The pop-up used to pre-check the next installment
with the full surcharge.)

### 6. The moved month disappears from the DCRR "Allocate payment" pop-up — ✅ RESOLVED 2026-09-02 (Fixes Plan Phase 5, decision D1 = A)

Left as-is on purpose. With D1 = A the moved installment is never something a payment gets
applied to (it always returns to the schedule on its own), so its absence from the pop-up is
correct, not a gap. For the *surcharge* payment it never mattered — the surcharge is not meant
to pay that month, and Phase 3 now defaults a surcharge to fully-unapplied anyway.

Original: the moved month was not in the pop-up list — only still-open months showed — and
there was no screen anywhere (pop-up, auto-split, Record Payment form, Submit Proof form) that
could put a payment against the moved month.

See the "Audit — the surcharge payment path" section below for the exact code paths.

### 7. Check numbers do not follow a moved payment; the new month has no check — ✅ FIXED 2026-09-02 (Fixes Plan Phase 4b, 4b-full)

*Now: PDC checks have a lifecycle. When a payment is moved, its check is set to **held** and
shows as "667220 (held)" on the moved line. The new installment at the end shows **"replacement
needed"** until the collector records a replacement check (a "Replacement check for the
extended installment" step on the Move of Payment page). Once recorded, the original check is
marked **replaced** and the new check number shows on the extended installment. If the move
reverts on the deadline, the held check goes back to active and the replacement is removed.
Only monthly / salary / bi-monthly loans (1 check per installment) — quarterly / two-monthly
are left out.*

Original: every installment on the ledger was paired with a post-dated check by position, and
the check never moved with the payment.

Every installment on the ledger is paired with a post-dated check **by position** — 1st check
goes with the 1st payment slot, 2nd with the 2nd, and so on. When a payment is moved:

- The **moved month loses its check number on the ledger.** The check was written for that
  original date; the ledger row for it collapses into the one-line "moved" summary, and that
  summary line is shown with a blank check number.
- The **new month at the end has a blank check number.** The borrower never wrote a check for
  that new date, and the check that *was* written for the moved payment is not re-pointed to
  it. It just sits unused and out of view.

Concrete: on AN300426 the moved payment (Sep 28) had check **667220**. After the move, the
Sep 28 ledger line shows no check, and the new Mar 28, 2027 line shows no check. Check 667220
is now orphaned — written for a date that no longer exists in the schedule, displayed nowhere.

Whether the check *should* follow the payment is a real collections question (a post-dated
check is dated for a specific day, so it can't simply be deposited on the new date). But right
now the system neither moves it, replaces it, nor flags it — it just disappears from the
ledger.

See the "Audit — check numbers vs. moved payments" section below for the exact code paths.

### 8. A moved payment gets penalized before its own deadline, and then gets stuck — ✅ FIXED 2026-09-02 (Fixes Plan Phase 1)

Found while auditing the other issues. The collector normally sets the deadline a bit *after*
the payment's original due date (e.g. payment was due Oct 10, deadline to pay is Oct 15). In
that window — after Oct 10, before Oct 15 — the nightly check treats the moved payment as a
normal overdue payment, **flips it to "Overdue" and adds a penalty**, even though its deadline
has not passed and the whole point was "no penalty while moved."

Worse, once that happens the payment is stuck in a broken state: it is no longer marked
"moved", so the nightly revert can never clean it up. The extra month at the end is never
removed, and the move's leftover data stays on the row forever.

Confirmed by simulation on AN300383: running the nightly check dated Oct 12 turned the moved
payment into "Overdue" with a **₱8,757.83 penalty**, deadline still Oct 15, extra month still
present.

This fires on **every** Move of Payment where the deadline is after the original due date —
which is the normal case.

See the "Audit — moved payments and the nightly penalty check" section below.

---

**Problems 1, 2, and 8 are the ones that actually break the feature.** The rest are rough
edges. Problem 6 is the visible symptom of problem 2.

**Update 2026-09-02:** **All 8 problems are resolved** — fixed in code (1, 3, 4, 5, 7, 8) or
settled by decision as intended behaviour (2, 6). See `move-of-payment-fixes-plan.md` for the
per-phase build notes. One end-to-end browser click-through is still outstanding.

---

# Audit — the surcharge payment path (2026-09-02)

Focused check on what a collector and a borrower can actually do when paying the surcharge,
and specifically on the report that **the moved month does not show in the collector's DCRR
"Allocate payment" pop-up.** Every claim below is traced to a file and line — nothing is
assumed.

## Files checked

| Purpose | File |
|--|--|
| Collector "Record payment" form | `src/components/payments/RecordPaymentForm.tsx` |
| Borrower "Submit payment proof" form | `src/components/borrower/LoanActivePanel.tsx` |
| Borrower loan data feed | `src/app/api/borrower/applications/[id]/loan/route.ts` |
| DCRR page + "Allocate payment" pop-up | `src/app/collector/dcr/page.tsx` |
| Pop-up's installment list | `src/app/api/collector/dcr/allocation-preview/route.ts` |
| Add-to-DCRR + allocation checks | `src/app/api/collector/dcr/route.ts`, `src/lib/ar/posting.ts` (`addPaymentToDcr`, `validateAllocationLines`, `fetchOpenInstallments`, `computeAutoAllocation`) |
| Final posting | `post_single_dcr_item` (database function, read live) |

## Finding A — CONFIRMED: the moved month is not shown in the DCRR "Allocate payment" pop-up

The pop-up's list of installments comes entirely from one call, and that call filters the
moved month out.

- `allocation-preview/route.ts` line 52 fetches the schedule with
  `.in("status", ["pending", "partial", "overdue"])`. A **"moved"** row does not match, so it
  is never returned.
- `dcr/page.tsx` (`openAllocationModal`, ~line 277) builds the pop-up's rows *only* from that
  response — it adds nothing else.

So for the AN300383 example, the pop-up shows payments 2 through 7. **Payment 1 (Oct 10, the
moved one) is not in the list and cannot be selected.**

## Finding B — the moved month is invisible to the *entire* payment system, not just that pop-up

The same status filter (`pending` / `partial` / `overdue` only) is used in every place that
handles payment application:

| Where | File / line | Effect on the moved month |
|--|--|--|
| DCRR pop-up list | `allocation-preview/route.ts:52` | not shown |
| Auto-split of a payment across installments | `posting.ts` `fetchOpenInstallments:81` (feeds `computeAutoAllocation`) | skipped entirely — a large payment fills 2, 3, 4… and never touches the moved one; anything left over goes "unapplied" |
| Collector "Record payment" form | `RecordPaymentForm.tsx` | has **no installment picker at all** — just amount, date, reference, channel |
| Borrower "Submit payment proof" form | `LoanActivePanel.tsx:377-460` | same — **no installment picker** |

The borrower *can see* the moved month (their loan feed returns every schedule row —
`loan/route.ts:106`, no status filter — and it renders as the cancel-out marker line), but
there is no control anywhere that lets that month be paid.

## Finding C — nothing in the code stops a moved-month allocation; there is just no way to reach it

`validateAllocationLines` (`posting.ts:205`) rejects an allocation only if the target
installment is `"rolled"` or `"paid"`. A `"moved"` row would pass. `post_single_dcr_item`
(database) also does not check status before applying. So the block is entirely at the UI
layer — the moved row is simply never offered as an option. There is no server-side rule that
says "you may not pay a moved installment," and no server-side rule that says "you must."

## Finding D — audit-trail entries actually written for a surcharge payment

| Step | Audit entry written? | Module / action / entity |
|--|--|--|
| Collector records payment (`POST /api/collector/payments`) | **yes** | `collection` / `create` / `payment` |
| Borrower submits proof (`POST /api/borrower/applications/[id]/loan`) | **yes** | `borrower_portal` / `create` / `payment` |
| Collector adds payment to a DCRR (`add_item`) | **no** | — |
| Collector submits the DCRR (`submit`) | **yes** | `collection` / `execute_trigger` / `dcr` |
| Accounting reconciles the item | **yes** | `accounting_ar` / `execute_trigger` / `dcr_item` |

None of these entries reference the Move of Payment, the moved installment, or the surcharge
as anything other than an ordinary payment. There is no audit link between the surcharge
payment and the move it belongs to.

## What this means

1. **The pop-up behaviour you noticed is real and consistent** — the moved month is filtered
   out of the allocation pop-up by design of the status filter, not by accident.
2. For recording the **surcharge** specifically, hiding the moved month is harmless — the
   surcharge is not meant to pay that installment anyway.
3. But it is the same reason **finding #2 in the flow doc holds**: there is no path — pop-up,
   auto-split, collector form, or borrower form — to actually pay the moved installment before
   its deadline. It can only sit "moved" until the deadline passes and it reverts.
4. The surcharge payment lands as a normal payment with **no recorded connection** to the
   Move of Payment.

---

# Audit — check numbers vs. moved payments (2026-09-02)

Check on the report that **when a payment is moved, its check number does not move with it, and
the new month at the end has an empty check number.** Traced to code and the live database.

## How check numbers get onto the ledger

There is no link in the database between a check and an installment. The pairing is purely
positional.

| Step | File / line | What it does |
|--|--|--|
| Read the checks | `.../route.ts` — `pdc_checks` select `sort_order, check_number` | one row per check slot, ordered |
| Build a position map | `build-account-ledger-rows.ts:382-393` `checkNumbersByInstallmentNo` | `check at sort_order 0` → installment #1, `sort_order 1` → #2, and so on (`sort_order + 1`) |
| Attach to each ledger row | `desk-ledger.ts:64` (collector) and `ar/masterlist/[id]/page.tsx:565` (AR) | `checkNo = map.get(row.installment_no) ?? null` |

So a ledger row's check is decided **only by its `installment_no`**, nothing else.

## What happens on a move

`applyMoveOfPayment` (`src/lib/ar/move-of-payment.ts`):

- leaves the moved row's `installment_no` unchanged (still #1 for the earliest payment)
- inserts the new final row with `installment_no = last + 1` (e.g. #7)

Then at render time:

1. The moved row **would** map to check #1 — but it never renders as an installment. It is
   collapsed into the one-line "moved" summary row, and that row is built with
   `checkNo: null` hard-coded (`build-account-ledger-rows.ts:270`). So check #1 is not shown.
2. The new row is `installment_no = 7`. `checkNumbersByInstallmentNo` only has entries for the
   original check slots (0–5 → installments 1–6). `map.get(7)` is `undefined` → `null`. So the
   new month shows no check.
3. Nothing re-points check #1 (the moved payment's check) to `installment_no = 7`.

## Live confirmation — AN300426

`pdc_checks` for this account (6 slots, all filled):

| sort_order | check_number | maps to installment # |
|--|--|--|
| 0 | 667220 | 1 |
| 1 | 861649 | 2 |
| 2 | 825575 | 3 |
| 3 | 723264 | 4 |
| 4 | 884486 | 5 |
| 5 | 631429 | 6 |

Schedule after the move (installment 1 moved, installment 7 appended):

| installment # | due date | status | check shown on ledger |
|--|--|--|--|
| 1 | Sep 28, 2026 | moved | **(blank)** — real map value is 667220, dropped by the summary row |
| 2 | Oct 28, 2026 | pending | 861649 |
| 3 | Nov 28, 2026 | pending | 825575 |
| 4 | Dec 28, 2026 | pending | 723264 |
| 5 | Jan 28, 2027 | pending | 884486 |
| 6 | Feb 28, 2027 | pending | 631429 |
| **7** | **Mar 28, 2027** | pending | **(blank)** — no check slot at position 7 |

Check **667220** is now orphaned: written for a due date that no longer exists in the
schedule, shown on no ledger row.

## What this means

- The behaviour you noticed is exact: the moved month's check vanishes from the ledger, and
  the appended month has no check.
- Both ledger surfaces (collector desk, AR masterlist) do this — same positional mapping.
- The real-world question underneath it: a post-dated check is dated for one specific day, so
  check 667220 (dated Sep 28) cannot simply be deposited on the new Mar 28, 2027 date. The
  branch would normally need a replacement check or a decision to hold/re-present it. **The
  system models none of this** — it does not move the check, replace it, void it, or flag it.

---

# Audit — moved payments and the nightly penalty check (2026-09-02)

Check on whether a "moved" payment is protected from the overdue/penalty logic while it is
moved. It is **not**.

## How the nightly check picks the "overdue" payment

Both the database function `refresh_one_masterlist_aging` and its TypeScript twin
`refreshMasterlistAging` (`src/lib/ar/posting.ts`) find the account's overdue payment with a
filter of **"any status except paid or rolled, with a due date in the past."**

- Database: the `SELECT ... INTO v_overdue` uses `s.status <> 'paid' AND s.status <> 'rolled'
  AND (p_as_of - s.due_date) > 0`.
- TypeScript: the schedule query is `.neq("status", "paid")`, then `.filter(row => row.status
  !== "rolled")` and `daysPastDue(row.due_date) > 0`.

Neither excludes **`moved`**. So a moved payment whose *original* due date is in the past is
treated as the overdue payment.

## Timeline that triggers it

| Date | What the nightly check does |
|--|--|
| Payment due Oct 10 | — |
| Oct 12 (deadline is Oct 15, not passed) | Revert block does nothing (deadline not passed). Overdue block picks up the still-`moved` row because Oct 10 is in the past → sets it to **`overdue`**, adds a **penalty**. |
| Oct 15+ (deadline passed) | Revert block looks for `status = 'moved'` — but the row is now `overdue`, so it is **never reverted**. The extra month at the end is **never deleted**. |

## Live confirmation — AN300383 (simulated, rolled back)

Ran `refresh_one_masterlist_aging(AN300383, '2026-10-12')` inside a transaction and rolled it
back. Result on payment #1:

| Field | Before | After the simulated nightly run |
|--|--|--|
| status | moved | **overdue** |
| penalty_amount | 0.00 | **8,757.83** |
| move_of_payment_deadline | 2026-10-15 | 2026-10-15 (still there) |
| move_of_payment_batch_id | set | set (still there) |
| payment #7 (the extra month) | present | **still present** (revert never ran) |

## What this means

- The feature's core promise — "no penalty while the payment is moved" — does not hold once
  the calendar passes the original due date.
- The account ends up in a state the revert logic cannot recognise or clean up.
- This is not an edge case: it happens on every Move of Payment where the deadline is set
  after the original due date, which is the normal way it would be used.
