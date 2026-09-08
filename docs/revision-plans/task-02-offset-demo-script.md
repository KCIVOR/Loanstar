# Task 2 — Demo & Self-Test Script (full offset closes the target loan)

A short, screen-by-screen walkthrough you can run yourself or show the client.
For every action there is an **Expected** — if what you see matches, that step
passes.

**Scenario:** a borrower already has an existing loan (**AN300454**, a
Quarterly-Special loan with a ₱714,000 balance and a ₱525,000 principal balloon
at the end). We create a new loan for that same borrower, tell the system to use
part of the new loan to **fully settle AN300454** (with a small early-settlement
interest discount), release it, and let Accounting confirm it. AN300454 must end
at **₱0.00 and Closed** — the thing that failed in the Sept-04 demo.

---

## Before you start

1. Open `http://localhost:3000/login`. The **QUICK LOGIN** buttons log you in
   with one click (no password): `CSA`, `CIG`, `Committee`, `LRA`, `AR`, etc.
   Switch roles via the avatar menu → **Log out** → click the next button.

2. Confirm the target loan is in its starting state — run this once in the
   Supabase SQL editor:

   ```sql
   select loan_account_no, account_status, outstanding_balance
   from masterlist where loan_account_no = 'AN300454';
   ```

   **Expected:** `AN300454 · active · 714000.00`.

3. Take a backup so you can undo the demo afterwards:

   ```sql
   drop table if exists _bak_ml_454; drop table if exists _bak_sched_454;
   create table _bak_ml_454 as select * from masterlist where loan_account_no='AN300454';
   create table _bak_sched_454 as
     select s.* from amortization_schedules s join masterlist m on m.id=s.masterlist_id
     where m.loan_account_no='AN300454';
   ```

---

## Part 1 — CSA sets up the offset

| Step | You do | Expected |
|---|---|---|
| 1 | Log in as **CSA**. Start a **New application** for borrower **Rosa Dela Cruz (BN300437)**. | Application workspace opens. |
| 2 | Fill the borrower profile. Set **Monthly income = ₱400,000**. Record the **NCL check** (pass). | Profile saves. |
| 3 | Open the **Computation** panel. Enter: loan type **Multi-Purpose Loan**, amount **1,000,000**, terms **12**, schedule **Monthly**. Click **Compute**. | A result appears (net released, interest, monthly amortization). |
| 4 | Scroll to **"Other deductions"**. In the **LEFT** box, **"Offset — full settlement (closes the loan)"**, open the **Target loan** dropdown and pick **`AN300454 — ₱714,000.00 bal`**. | The amount fills in as **₱714,000.00** and is shown as plain text you **cannot edit smaller**. Helper text: *"Pays the target loan's entire remaining balance so it closes…"* |
| 5 | Click **"Apply early-settlement discount"**. | A modal opens listing **only** installments **1, 3, 5, 7** (interest, ₱47,250 each). Installment **8** (the ₱525,000 principal) is **not** listed. |
| 6 | Tick installments **3** and **5**. Leave 100%. Click **Apply**. | The row now shows: **Balance ₱714,000.00** · **Early-settlement discount −₱47,250.00** · **Final amount ₱666,750.00**. |
| 7 | Click **Compute** again. | "Step 4 — Other deductions" shows **"Offset — full settlement — Closes account AN300454"**, value **₱666,750.00**. Net released drops by ~₱666,750. |

**Part 1 passes if:** the amount was locked to the full balance, the discount
picker never offered the principal balloon (inst 8), and Final amount =
₱714,000 − ₱47,250 = **₱666,750**.

---

## Part 2 — Push the new loan through to release

| Step | You do | Expected |
|---|---|---|
| 8 | Borrower **signs the computation** (claim `autofill.54041@example.local` first if needed). CSA clicks **Endorse to CIG**. | Status → CIG verification. |
| 9 | Log in as **CIG** → complete the verification form → **Submit CI report**. | File goes to Committee. |
| 10 | Log in as **Committee** → cast the vote(s) → **Approve**. | Status → approved. |
| 11 | CSA/Processing **Disclose** → Borrower **accepts / re-signs**. | File in LRA queue. |
| 12 | Log in as **LRA** → open release file → pick **With PDC** → **Generate documents** → complete **witnessed signing** for all docs → Briefer **acknowledges briefing** → LRA uploads **Employment contract** → **Record release** → upload signed scans → **Close file**. | Release status → **released** then **closed**. |

**Checkpoint — the offset is now waiting for Accounting.** Run:

```sql
select transfer_type, status, amount, discount_amount, discounted_installment_nos
from internal_transfers it
join masterlist m on m.id = it.target_masterlist_id
where m.loan_account_no = 'AN300454'
order by created_at desc limit 1;
```

**Expected:** `other_loan · pending · 666750.00 · 47250.00 · {3,5}`.

---

## Part 3 — Accounting confirms → the target loan closes

| Step | You do | Expected |
|---|---|---|
| 13 | Log in as **AR**. Left nav → **Internal transfers**. | One pending row: TARGET **AN300454** ("Current balance ₱714,000.00"), TYPE **Offset (full payoff)**, AMOUNT **₱666,750.00**, DISCOUNT **₱47,250.00 (inst. 3, 5)**. |
| 14 | Click **Confirm**. | Dialog: *"Reduce AN300454's balance by ₱714,000.00 … An early-settlement discount of ₱47,250.00 in interest on installments 3, 5 is forgiven … settling the account's current balance of ₱714,000.00 in full."* |
| 15 | Click **"Yes, post it"**. | Green banner: **"Posted — AN300454 balance updated."** Pending count → **0**. |
| 16 | Go to **Masterlist** (`/ar`), search **AN300454**. | Row shows **OUTSTANDING ₱0.00** · **STATUS `paid`**. |
| 17 | Click **Open** on that row. | **OUTSTANDING BALANCE ₱0.00** · **Installments paid 8/8 (100%)** · chip **`paid`**. In the **Account ledger**, every row is **`paid`**; installment **8** (DUE 525,000.00) has **no discount** and a CREDIT of **525,000.00**. |
| 18 | Go to **Posting history** → **Closed accounts** tab. | **AN300454** is listed — **₱0.00** — **Closed** today. |

**Database proof** (optional, authoritative):

```sql
select account_status, outstanding_balance,
       count(*) filter (where s.status <> 'paid') as not_paid_rows
from masterlist m join amortization_schedules s on s.masterlist_id = m.id
where m.loan_account_no = 'AN300454' group by 1,2;
```

**Expected:** `paid · 0.00 · 0`.

```sql
select installment_no, line_type, amount_due, discount_amount, amount_paid, status
from amortization_schedules s join masterlist m on m.id = s.masterlist_id
where m.loan_account_no = 'AN300454' order by installment_no;
```

**Expected (exact):**

| inst | line_type | amount_due | discount_amount | amount_paid | status |
|---|---|---|---|---|---|
| 1 | interest | 47250.00 | 0 | 47250.00 | paid |
| 2 | principal | 0.00 | 0 | 0.00 | paid |
| 3 | interest | 47250.00 | 0 | 47250.00 | paid  *(first ticked = termination fee, paid in cash)* |
| 4 | principal | 0.00 | 0 | 0.00 | paid |
| 5 | interest | 47250.00 | **47250.00** | 0.00 | paid  *(covered by the discount)* |
| 6 | principal | 0.00 | 0 | 0.00 | paid |
| 7 | interest | 47250.00 | 0 | 47250.00 | paid |
| **8** | **principal** | **525000.00** | **0** | **525000.00** | **paid**  *(balloon — never discounted, paid in full)* |

Cash ₱666,750 + discount ₱47,250 = **₱714,000 = the whole balance** → closed.

**Part 3 passes if:** AN300454 shows **₱0.00 / paid / 8-of-8**, the balloon
(inst 8) got **₱0 discount**, and the total discount applied is exactly
**₱47,250**.

---

## Part 4 — Bonus: show that a short offset is blocked (not half-applied)

1. Run **Part 5 (Undo)** first, then re-check AN300454 is `active / 714000.00`.
2. Seed an offset that's too small:

   ```sql
   insert into internal_transfers
     (source_loan_application_id, target_masterlist_id, transfer_type, amount,
      discount_amount, discounted_installment_nos, status, created_by, created_at)
   select m.loan_application_id, m.id, 'other_loan', 300000.00, 0, array[]::int[],
          'pending', (select id from auth.users where email='ar@loanstar.local'), now()
   from masterlist m where m.loan_account_no = 'AN300454';
   ```

3. As **AR** → **Internal transfers** → **Confirm** the ₱300,000 row → **Yes, post it**.

**Expected:**
- The post **fails** with a message like: *"This offset provides ₱300,000.00 but
  the target loan needs ₱714,000.00 to close … Reject this transfer and ask CSA
  for a recomputed amount."*
- The transfer stays **pending**; **AN300454 is unchanged** (still `active`,
  still `₱714,000.00`).
- Click **Reject** (reason `test`) to clear it.

---

## Part 5 — Undo the demo

```sql
with tgt as (select id from masterlist where loan_account_no = 'AN300454')
delete from internal_transfer_allocations
where internal_transfer_id in (
  select it.id from internal_transfers it, tgt
  where it.target_masterlist_id = tgt.id and it.created_at >= current_date);
with tgt as (select id from masterlist where loan_account_no = 'AN300454')
delete from internal_transfers it using tgt
where it.target_masterlist_id = tgt.id and it.created_at >= current_date;

update amortization_schedules s
set amount_due=b.amount_due, penalty_amount=b.penalty_amount, amount_paid=b.amount_paid,
    status=b.status, paid_at=b.paid_at, discount_amount=b.discount_amount,
    penalty_discount_amount=b.penalty_discount_amount, discount_source=b.discount_source,
    line_type=b.line_type
from _bak_sched_454 b where s.id = b.id;
update masterlist m set outstanding_balance=b.outstanding_balance, account_status=b.account_status
from _bak_ml_454 b where m.id = b.id;

select loan_account_no, account_status, outstanding_balance
from masterlist where loan_account_no='AN300454';   -- Expected: active · 714000.00

drop table if exists _bak_ml_454; drop table if exists _bak_sched_454;
```

The new source-loan application can be left as demo data or cancelled by CSA.

---

## One-line result

| # | What you proved | Pass |
|---|---|---|
| 1 | Full-settlement offset locks to the whole balance; principal balloon is never offered for discount | ☐ |
| 2 | On release, a pending `other_loan` transfer is created (₱666,750 + ₱47,250 discount) | ☐ |
| 3 | AR confirm closes AN300454 → **₱0.00 / paid / 8-of-8**, balloon paid in full, ₱0 discount on principal | ☐ |
| 4 | A short offset is **blocked** with "reject & recompute" — never half-applied | ☐ |
| 5 | Undo restored AN300454 to `active / ₱714,000.00` | ☐ |
