# Task 2 — Validation Journey: "A full offset must close the target loan"

**For:** an automated UI agent (Antigravity) or a human tester.

**Goal:** prove that when a new loan is released with a **full-settlement offset**
against one of the borrower's existing loans, that existing loan is **paid off to
exactly ₱0.00 and marked Closed** — including on Quarterly-Special /
Two-Monthly-Special / weekly schedules whose last installment is a large
principal "balloon". A **shortfall** must be blocked, not half-applied.

This is the scenario that failed in the September-04 client demo (a
balloon-schedule loan kept a leftover balance after a "full" offset).

**Rules for the tester**
- Do the steps in order. Verify every **EXPECTED** before moving on.
- On steps marked **★ TASK-2 CHECK**, type the values **exactly** as written and
  check the exact text/numbers. On the other (ordinary loan-setup) steps, use
  the sensible values given — their exact amounts do not matter to this test.
- This is a shared demo database. **Part D reverts everything this test touches.**

---

## 0. Environment & login

- **App URL:** `http://localhost:3000` (or whatever the dev server prints).
- **Login:** open `http://localhost:3000/login`. Under **"QUICK LOGIN (SEED
  ACCOUNTS)"** there is one button per role. **Click the button for the role
  you need — it signs you in immediately, no password.**
  Buttons: `Super Admin` · `Agent` · `CSA` · `CIG` · `Committee` · `LRA` ·
  `AR` · `Collector` · `Briefer` · `Remedial` · `Borrower`.
  Manual fallback: `csa@loanstar.local`, `cig@loanstar.local`,
  `committee@loanstar.local`, `lra@loanstar.local`, `ar@loanstar.local`,
  `collector@loanstar.local` — password `Loanstar2026`.
- **Switch role:** avatar menu (top-right) → **Log out** → `/login` → click the
  next role's button.

---

## 1. Test data & preconditions

### 1.1 The offset TARGET loan (must end up closed)

| Field | Value |
|---|---|
| Borrower | **Rosa Dela Cruz** |
| Borrower no. | **BN300437** |
| Borrower email (used only if you need the borrower to claim/sign) | `autofill.54041@example.local` |
| Existing loan account | **AN300454** |
| Schedule type | **Quarterly Special** — 8 installments; 1/3/5/7 are **interest** rows (₱47,250 each), installment **8 is a ₱525,000 principal balloon** |
| Current outstanding balance | **₱714,000.00** |
| Account status now | `active` |

**Run this check first** (Supabase SQL editor / `psql`):

```sql
select m.loan_account_no, m.account_status, m.outstanding_balance,
       count(*) filter (where s.status <> 'paid') as open_rows
from masterlist m
join amortization_schedules s on s.masterlist_id = m.id
where m.loan_account_no = 'AN300454'
group by 1,2,3;
```

**EXPECTED:** `account_status = active`, `outstanding_balance = 714000.00`,
`open_rows = 5` (installments 1, 3, 5, 7, and 8 = balloon).

If the numbers differ, this account has already been used. Pick another borrower
who has **exactly one `active` loan** of a `quarterly_special` /
`two_monthly_special` / `weekly` schedule, and substitute their borrower no.,
email, account no. and balance everywhere below.

### 1.2 Snapshot for revert — run BEFORE you start

```sql
drop table if exists _bak_ml_an300454;
drop table if exists _bak_sched_an300454;
create table _bak_ml_an300454 as
  select * from masterlist where loan_account_no = 'AN300454';
create table _bak_sched_an300454 as
  select s.* from amortization_schedules s
  join masterlist m on m.id = s.masterlist_id
  where m.loan_account_no = 'AN300454';
```

---

## PART A — Full end-to-end (CSA → CIG → Committee → LRA → AR)

### A1 — (optional) Agent creates a lead

1. Log in as **Agent**. Create a lead: name **Rosa Dela Cruz**, email
   `autofill.54041@example.local`.

**EXPECTED:** lead saved, visible to the Agent.
*(Skip A1 if the build lets CSA start "New application" without a lead.)*

### A2 — CSA creates the application

1. Log in as **CSA** (`csa@loanstar.local`).
2. Either **convert the A1 lead**, or click **New application** and select
   borrower **Rosa Dela Cruz** (`BN300437`).
3. Open the application workspace.

**EXPECTED:** application created and linked to **BN300437**; workspace shows
checklist + computation + endorse panels.

### A3 — CSA fills borrower details

1. Fill the required profile fields (agency / employment / contacts).
2. Set **Monthly income = ₱400,000** (high enough that the coverage check won't
   block the endorse for a ₱1,000,000 loan).
3. Record the **NCL check** (pass).

**EXPECTED:** profile saves; NCL badge shows.

### A4 — CSA computes the NEW (source) loan

1. Open the **Computation** panel and enter:
   - **Loan type:** `Multi-Purpose Loan` (or any non-collateral type)
   - **Input mode:** principal
   - **Amount / principal:** `1,000,000`
   - **Terms:** `12`
   - **Payment schedule:** `Monthly`
2. Click **Compute / Recalculate**.

**EXPECTED:** a computation result appears (net released, total interest, total
loan, monthly amortization). The new loan's proceeds (~₱1M) are more than enough
to cover the ₱714,000 offset — important for Part A. (Part B tests the opposite.)

### A5 — ★ TASK-2 CHECK 1: set up the full-settlement offset

In the Computation panel, scroll to **"Other deductions (optional)"**. There are
**two** side-by-side tools:

| LEFT tool | RIGHT tool |
|---|---|
| **"Offset — full settlement (closes the loan)"** | **"Other loan — partial payment (by months)"** |

**Use the LEFT tool.**

1. In the LEFT tool, open the **Target loan** dropdown and select
   **`AN300454 — ₱714,000.00 bal`**.

   **EXPECTED immediately:**
   - The amount for that row **auto-fills to `714,000.00`** and is shown as a
     **read-only value** (plain text, not an editable box) because a real
     account is linked — you **cannot** type a smaller number.
   - Helper text: *"Pays the target loan's entire remaining balance so it
     closes. Amount auto-fills from the balance. Optional early-settlement
     discount waives interest on the months you choose."*

2. Click **"Apply early-settlement discount"** on that row.

   **EXPECTED — the "Early-settlement discount" modal opens:**
   - It lists **only future, not-yet-due interest installments** of AN300454:
     rows for installments **1, 3, 5, 7** (₱47,250 interest each), each with a
     checkbox and a percent field defaulting to **100**.
   - Installment **8** (the ₱525,000 principal balloon) is **NOT** listed —
     principal is never discountable.
   - Already-paid placeholder rows (2, 4, 6) are **NOT** listed.

3. Tick installments **3** and **5** only. Leave percent = **100** on each.

   **EXPECTED:**
   - A running **"Interest discount total: ₱…"** figure appears.
   - After you **Apply / Save** and the modal closes, the row shows a small
     breakdown:
     - **Balance** `₱714,000.00`
     - **Early-settlement discount** `−₱47,250.00`  *(gross interest of the two
       ticked months minus one month's interest kept as the standard
       termination fee)*
     - **Final amount** `₱666,750.00`
   - Links **"Edit discount"** and **"Remove discount"** are shown.
   - The row's amount value is **`₱666,750.00`**, still read-only.

   > Call the discount figure **D = ₱47,250.00** and the final amount
   > **F = ₱666,750.00** for the rest of this document.

4. Click **Compute / Recalculate**.

   **EXPECTED:**
   - "Step 4 — Other deductions" shows a line **"Offset — full settlement"**,
     formula text like *"Closes account AN300454 (whole balance less discount)"*,
     value **`₱666,750.00`**.
   - **Net released** is ~₱666,750 lower than with no offset.

   **FAIL A5 if:** the amount field is editable; installment 8 is offered for
   discount; paid/past installments are offered; or "Final amount" ≠
   `balance − discount`.

### A6 — Endorse; borrower signs

1. The borrower must sign the computation. If **Rosa Dela Cruz** is not claimed
   yet: log out → `/register` → register with `autofill.54041@example.local` →
   open the confirmation link → set a password → log in as that borrower.
2. As the **Borrower**, open the application → **sign the computation**.
3. Log in as **CSA** → open **"Endorse to CIG"** → confirm coverage line is
   green → click **Endorse to CIG**.

**EXPECTED:** status → CIG verification; CSA loses edit rights.

### A7 — CIG verification

1. Log in as **CIG**. Open the file → complete the verification form + required
   CIG checks → **Submit / complete the CI report**.

**EXPECTED:** file becomes visible to Committee.

### A8 — Committee approval

1. Log in as **Committee**. Cast the required vote(s), then take the final
   **Approve** action.

**EXPECTED:** status → approved; file available for disclosure / negotiation.

> Seed DB has one `committee` user. If the UI insists on 3 votes: add two more
> users with the `committee` role (Super Admin → Admin → Users), or use the
> committee **pre-decision override** if enabled. How it gets approved does not
> affect what Task 2 tests — you just need it approved.

### A9 — Disclose → re-sign → LRA queue

1. As **CSA / Processing** → **Disclose** the approved amount/terms.
2. As **Borrower** → **accept terms / sign** again if prompted.

**EXPECTED:** signed computation sits in the LRA queue.

### A10 — LRA release

1. Log in as **LRA**. Open the file → **Start / open release file**.
2. Choose a path (e.g. **With PDC**; set number of checks; confirm any shortfall
   dialog) → **Generate documents**.
3. Complete the **witnessed signing** for every generated document.
4. As **Briefer / Collection Head** → acknowledge the briefing.
5. Back as **LRA**: upload the **Employment contract** if the release is blocked
   on it → **Record release** → confirm.
6. Upload the required signed scans on the release checklist → **Close file**.

**EXPECTED:**
- Release status → **released**, then **closed**.
- **★ TASK-2 CHECK 2 — the pending offset transfer is created on release:**

```sql
select it.transfer_type, it.status, it.amount, it.discount_amount,
       it.discounted_installment_nos, m.loan_account_no as target
from internal_transfers it
join masterlist m on m.id = it.target_masterlist_id
where m.loan_account_no = 'AN300454'
order by it.created_at desc
limit 1;
```

**EXPECTED row:** `transfer_type = other_loan`, `status = pending`,
`amount = 666750.00`, `discount_amount = 47250.00`,
`discounted_installment_nos = {3,5}`, `target = AN300454`.

### A11 — ★ TASK-2 CHECK 3 (the main event): AR confirms

1. Log in as **AR** (`ar@loanstar.local`).
2. Left nav → **Internal transfers** (`/ar/internal-transfers`).

**EXPECTED — the pending row:**
| Column | Value |
|---|---|
| SOURCE LOAN | the new MPL application's account no. |
| TARGET ACCOUNT | **AN300454** — subtitle **"Current balance ₱714,000.00"** |
| TYPE | **Offset (full payoff)** |
| AMOUNT | **₱666,750.00** |
| DISCOUNT | **₱47,250.00** — "inst. 3, 5" |
| Buttons | **Confirm** · **Reject** |

3. Click **Confirm**.

**EXPECTED — dialog "Confirm internal transfer?":**
> "Reduce **AN300454**'s balance by **₱714,000.00**, using proceeds from …. This
> cannot be undone."
> "An early-settlement discount of **₱47,250.00** in interest on installments
> 3, 5 is forgiven as part of this transfer. … settling the account's current
> balance of **₱714,000.00** in full."

4. Click **"Yes, post it"**. Wait for it to finish.

**EXPECTED:**
- Green banner: **"Posted — AN300454 balance updated."**
- **PENDING TRANSFERS** count → **0**; the row disappears.

### A12 — ★ TASK-2 CHECK 4: verify the target loan is fully closed

**In the UI:**

1. AR → **Masterlist** (`/ar`) → search **`AN300454`**.
   **EXPECTED:** one row — Rosa Dela Cruz — **OUTSTANDING `₱0.00`**, **STATUS
   `paid`**.
2. Open it (**Open** button).
   **EXPECTED on the detail page:**
   - **OUTSTANDING BALANCE `₱0.00`**
   - **"Installments paid 8/8"**, progress bar **100%**, status chip **`paid`**
   - In the **Account ledger**, every row's STATUS is **`paid`**. Installment
     **8** (DUE `525,000.00`) shows **NO discount** and a CREDIT of
     `525,000.00` — the balloon principal was paid **in full**.
3. AR → **Posting history** (`/ar/history`) → tab **"Closed accounts"**.
   **EXPECTED:** **AN300454** is listed — **OUTSTANDING `₱0.00`**,
   **CLOSED ON** today's date.

**In the database (authoritative):**

```sql
select m.account_status, m.outstanding_balance,
       count(*) filter (where s.status <> 'paid') as not_paid_rows
from masterlist m
join amortization_schedules s on s.masterlist_id = m.id
where m.loan_account_no = 'AN300454'
group by 1,2;

select s.installment_no, s.line_type, s.amount_due, s.discount_amount,
       s.amount_paid, s.status
from amortization_schedules s
join masterlist m on m.id = s.masterlist_id
where m.loan_account_no = 'AN300454'
order by s.installment_no;
```

**EXPECTED — query 1:** `account_status = paid`,
`outstanding_balance = 0.00`, `not_paid_rows = 0`.

**EXPECTED — query 2 (this is the fix's core behaviour):**
| inst | line_type | amount_due | discount_amount | amount_paid | status |
|---|---|---|---|---|---|
| 1 | interest | 47,250 | `0` | `47,250.00` | paid — not ticked, paid in cash |
| 2 | principal | 0 | `0` | `0` | paid (₱0 placeholder) |
| 3 | interest | 47,250 | `0` | `47,250.00` | paid — **first ticked = termination fee, no discount, paid in cash** |
| 4 | principal | 0 | `0` | `0` | paid |
| 5 | interest | 47,250 | **`47,250.00`** | `0.00` | paid — **fully covered by the discount** |
| 6 | principal | 0 | `0` | `0` | paid |
| 7 | interest | 47,250 | `0` | `47,250.00` | paid — not ticked, paid in cash |
| **8** | **principal** | **525,000** | **`0`** | **`525,000.00`** | paid — **balloon principal NEVER discounted, paid in full** |

- **Total `discount_amount` applied by this offset = ₱47,250.00 = D exactly.**
  No discount is "wasted" on a row that can't absorb it.
- Cash applied = 47,250 × 3 + 525,000 = **₱666,750.00 = F**.
- `F (cash) + D (discount) = ₱714,000.00 = the whole balance` → account closes.

**PASS = every EXPECTED in A12 matches.**
**FAIL if:** `outstanding_balance` ≠ `0.00`; `account_status` ≠ `paid`; any row
left `pending`/`partial`; installment 8 has a non-zero `discount_amount`; or the
total discount applied is less than D.

---

## PART B — Negative test: offset can't cover → must BLOCK

Proves the client-agreed rule: *if the offset amount cannot settle the target's
live balance, the post is stopped and AR is told to reject & recompute — the
loan is never left half-paid.*

1. **Revert AN300454 first** (run Part D), then re-check it is
   `active` / `714000.00`.
2. Seed a pending offset whose amount is deliberately too small:

```sql
insert into internal_transfers
  (source_loan_application_id, target_masterlist_id, transfer_type, amount,
   discount_amount, discounted_installment_nos, status, created_by, created_at)
select m.loan_application_id, m.id, 'other_loan',
       300000.00,          -- << far below the 714,000 balance
       0, array[]::int[], 'pending',
       (select id from auth.users where email='ar@loanstar.local'), now()
from masterlist m where m.loan_account_no = 'AN300454';
```

3. Log in as **AR** → **Internal transfers**. The new row shows AMOUNT
   **₱300,000.00**, TARGET **AN300454** (balance **₱714,000.00**).
4. Click **Confirm** → **"Yes, post it"**.

**EXPECTED:**
- The post **fails**. An error alert appears, wording like:
  > "This offset provides ₱300,000.00 but the target loan needs ₱714,000.00 to
  > close (live balance ₱714,000.00 less an applicable discount of ₱0). Reject
  > this transfer and ask CSA for a recomputed amount."
- The transfer stays **`pending`** (NOT posted).
- **AN300454 is completely unchanged.** Verify:

```sql
select account_status, outstanding_balance from masterlist
where loan_account_no = 'AN300454';        -- EXPECTED: active, 714000.00

select status from internal_transfers
where target_masterlist_id = (select id from masterlist where loan_account_no='AN300454')
order by created_at desc limit 1;           -- EXPECTED: pending
```

5. Click **Reject** on that row, reason `test`.
   **EXPECTED:** row leaves the pending list; the target account is still
   untouched.

---

## PART C — Regression: other tools / flows must be unaffected

| # | Do this | EXPECTED |
|---|---|---|
| C1 | In a CSA computation, use the **RIGHT** tool **"Other loan — partial payment (by months)"** → **"Select loan & months"** → pick AN300454 → tick **2** months → Apply | Amount = `monthly amortization × 2` (capped at balance). Helper text says it does **not** close the loan and has no discount. Behaviour unchanged. |
| C2 | Post a **partial** `'offset'` transfer for AN300454 and Confirm in AR — e.g. seed one: `transfer_type='offset'`, `amount=100000`, `discount_amount=0`, `discounted_installment_nos='{}'` | ₱100,000 applied to the **oldest** open installment(s); target **not** closed; status stays `active`; no discount rows; no "force-paid" behaviour. Same as before Task 2. Then reject it / revert. |
| C3 | AR → **DCRR queue** → reconcile / post any existing DCRR | Works exactly as before; report totals and balances unchanged. |
| C4 | Open a normal **monthly** account's detail page | Balances, ledger, aging render normally — Task 2 didn't touch monthly-schedule display. |
| C5 | `cd loanstar && npm test` | **All tests pass** (≈ 1619+). |
| C6 | `cd loanstar && npx tsc --noEmit` then `npm run build` | No new TypeScript errors; build **compiles successfully**. |

---

## PART D — Cleanup / revert (run at the end, and between Part A and Part B)

```sql
-- remove test internal transfers created today for AN300454
with tgt as (select id from masterlist where loan_account_no = 'AN300454')
delete from internal_transfer_allocations
where internal_transfer_id in (
  select it.id from internal_transfers it, tgt
  where it.target_masterlist_id = tgt.id and it.created_at >= current_date
);
with tgt as (select id from masterlist where loan_account_no = 'AN300454')
delete from internal_transfers it using tgt
where it.target_masterlist_id = tgt.id and it.created_at >= current_date;

-- restore schedule + masterlist from the 1.2 snapshot
update amortization_schedules s
set amount_due = b.amount_due, penalty_amount = b.penalty_amount,
    amount_paid = b.amount_paid, status = b.status, paid_at = b.paid_at,
    discount_amount = b.discount_amount,
    penalty_discount_amount = b.penalty_discount_amount,
    discount_source = b.discount_source, line_type = b.line_type
from _bak_sched_an300454 b where s.id = b.id;

update masterlist m
set outstanding_balance = b.outstanding_balance, account_status = b.account_status
from _bak_ml_an300454 b where m.id = b.id;

-- confirm
select loan_account_no, account_status, outstanding_balance
from masterlist where loan_account_no = 'AN300454';   -- EXPECTED: active, 714000.00
```

Only drop the backup tables once **all** parts are done and verified:

```sql
drop table if exists _bak_ml_an300454;
drop table if exists _bak_sched_an300454;
```

The new source-loan application from Part A can be left as demo data or
cancelled by CSA / an admin.

---

## Pass / Fail summary

| # | Check | Where | PASS condition |
|---|---|---|---|
| 1 | Offset amount = whole balance, locked | A5.1 | Auto-fills `714,000.00`, read-only |
| 2 | Discount picker = future interest rows only | A5.2 | Lists inst. 1, 3, 5, 7; **never** inst. 8 (principal); no paid rows |
| 3 | Final amount = balance − discount | A5.3 | Row shows `₱666,750.00` (= 714,000 − 47,250) |
| 4 | Pending transfer created on release | A10 | `other_loan` / `pending` / amount `666,750` / discount `47,250` / `{3,5}` |
| 5 | **AR confirm closes the target loan** | A11–A12 | `outstanding_balance = 0.00`, `account_status = paid`, `8/8 paid` |
| 6 | **Balloon principal never discounted** | A12 q2 | inst. 8 `discount_amount = 0`, `amount_paid = 525,000`, `paid` |
| 7 | No discount wasted | A12 q2 | Σ applied `discount_amount` = `47,250.00` |
| 8 | Cash + discount = whole balance | A12 | `666,750 + 47,250 = 714,000` |
| 9 | Shortfall is blocked, not half-applied | Part B | Post fails with the "reject and recompute" message; target untouched; transfer stays `pending` |
| 10 | Partial "Other loan" tool unchanged | C1–C2 | `monthly × months`, no discount, does not close |
| 11 | Unrelated flows unchanged | C3–C6 | DCRR / monthly accounts / unit tests / build all normal |

**The feature is correct only if every row above is PASS.**

---

## Fast path (skip Part A's pipeline; validate the fix directly)

If you only need to re-check the fix, not the whole CSA→AR journey:

1. Do **1.1** and **1.2** (check + snapshot).
2. Seed the pending offset directly:

```sql
insert into internal_transfers
  (source_loan_application_id, target_masterlist_id, transfer_type, amount,
   discount_amount, discounted_installment_nos, status, created_by, created_at)
select m.loan_application_id, m.id, 'other_loan',
       666750.00,                 -- = 714,000 balance − 47,250 discount
       47250.00, array[3,5], 'pending',
       (select id from auth.users where email='ar@loanstar.local'), now()
from masterlist m where m.loan_account_no = 'AN300454';
```

3. Do **A11** and **A12** (AR confirm + verify closed).
4. Do **Part B** (shortfall block).
5. Do **Part D** (revert).

Expected results are identical to the full journey.
