# Ledger / Outstanding-Balance Consistency — Fix Implementation Plan

**Date:** 2026-08-31
**Source audit:** [docs/ledger-balance-consistency-deep-audit.md](ledger-balance-consistency-deep-audit.md)
(findings F1–F10)
**Status:** Not started. This is a plan only.

## How to read this plan

Phases are ordered by **dependency first, urgency second** — a phase never
assumes something a later phase builds. Each phase lists the *exact* files
and functions it touches, the *exact* files and functions it must **not**
touch, and what "done" means for that phase specifically. Do not start a
phase until the previous one is merged, tested, and (where marked) live-verified.

**Ground rules that apply to every phase, no exceptions:**

1. Run `npm test` before starting a phase (confirm the baseline is green) and
   again before calling the phase done. A phase that leaves the suite red is
   not done.
2. `npx tsc --noEmit` clean on every file the phase touches.
3. Every new behavior gets a test that fails without the fix and passes with
   it — not just a test that happens to pass.
4. Any SQL migration is additive (`CREATE OR REPLACE FUNCTION`, `ALTER TABLE
   ... ADD COLUMN`) — never edit a previously-applied migration file.
5. Live-verify in the browser + a direct DB query for any phase marked
   **Live-verify required** below — a green test suite is necessary, not
   sufficient, for those.
6. If a phase's own investigation turns up a fact that contradicts something
   assumed in this plan (as happened once already while preparing this
   document — see Phase 3), stop, re-verify against the live database, and
   correct the plan before writing code. Do not paper over a surprise.

---

## Phase 1 — F10: align PDC/BLRI schedule generation to the gross basis

**Why first:** independent of every other phase (touches schedule
*generation*, not balance accounting), and it's the one regression that's
entirely mine from today — it affects physical bank check amounts, which is
about as close to "cannot be wrong" as this system gets.

**Root cause recap:** `initializeArAccount` (ar/masterlist.ts) was fixed
earlier today to build schedules from `computation.grossTotalInterest` /
a derived `grossTotalLoan` / `grossMonthlyAmortization`. Three other
generators still build from the pre-existing **net** fields
(`computation.totalInterest` / `.totalLoan` / `.monthlyAmortization`), so
they now disagree with what `initializeArAccount` actually bills.

**Touches:**
- `src/lib/lra/release-service.ts` — `buildExpectedPdcSchedule()` and the
  inline `monthlyAmortization`/`totalLoan` reads inside `savePdcChecks()`
  (the salary and monthly/MPL/Seafarer branches, ~lines 365–403).
- `src/app/lra/applications/[id]/page.tsx` — the client-side PDC pre-fill
  (~lines 95–165), which independently re-derives the same numbers for
  display before the borrower/CSA ever submits them.
- `src/lib/lra/blri-data.ts` — the `pdcSchedule` fallback branch
  (~lines 109–118), used only when no real `pdc_checks` exist yet.

**Exact change, all three:** wherever `computation.totalInterest` /
`.totalLoan` / `.monthlyAmortization` currently feed a schedule generator or
a per-row amount calculation, replace with the gross equivalents, computed
the same way `masterlist.ts` already does:

```ts
const grossTotalInterest = computation.grossTotalInterest;
const grossTotalLoan = halfUp(computation.principal + grossTotalInterest);
const grossMonthlyAmortization = halfUp(grossTotalLoan / computation.terms);
```

`computation.grossTotalInterest` already exists on every computation
(backfilled today) — no new schema work in this phase.

**Do not touch in this phase:**
- `src/lib/ar/masterlist.ts` — already correct and already live-verified;
  this phase makes the other three generators match it, not the reverse.
- Weekly/Daily branches anywhere — confirmed unaffected (Invoice builds its
  own real schedule from principal alone; Daily is a single payment).
- The PDC validation *structure* (the `if (row.amount !== expectedAmount)
  throw` shape, the count checks, the date checks) — only the *values* fed
  into it change, not the control flow.
- `computation.totalInterest` / `.totalLoan` / `.monthlyAmortization`
  themselves — these stay net; that's correct, it's what AR discloses as the
  loan's real total. Only *this phase's three call sites* switch to reading
  the gross fields instead.

**New test:** a parity test asserting `buildExpectedPdcSchedule` and
`initializeArAccount`'s schedule produce **identical** per-row amounts for
the same discounted computation, across every affected schedule type
(monthly, salary/semi-monthly, bi-monthly, quarterly, two-monthly). Model it
on today's `masterlist-discount-basis.test.mts`.

**Definition of done:** the new parity test passes; `npm test` green; for a
freshly-created discounted test loan, live-verify that the PDC amount shown
on the LRA page during check encoding matches the AR ledger's row amount
exactly, for at least one non-Invoice schedule type. **Live-verify required.**

---

## Phase 2 — F1 / F3: give zero-due installments a settlement path

**Why second:** independent of Phase 1 and everything after it. Time-boxed —
must land before **2026-09-07**, when AN300435's first orphaned installment
reaches its due date and the (correct) reversion rule would resurrect
₱913.00 of debt on an already-fully-paid account.

**Root cause recap:** the only two code paths that ever set a row to
`"paid"` both require an actual posting (`postSingleDcrItem`) or an actual
remaining balance to write off (`writeOffRoundingDifference`). A row whose
net due is ₱0.00 the moment it's created (100% origination discount) never
receives either, so it stays `"pending"` forever — which then makes it a
match for the discount-reversion rule's `WHERE status <> 'paid'`.

**Touches:**
- `src/lib/ar/masterlist.ts` — `initializeArAccount`, specifically the
  `schedule.map(...)` block that builds the `amortization_schedules` insert
  payload (currently ends with `status: "pending"` unconditionally for
  every row).

**Exact change:** for each row being inserted, compute its net due the same
way `netInstallmentDue()` does (amount_due − discount_amount; no penalty or
amount_paid exist yet at creation time) and insert with:

```ts
const netDue = halfUp(row.amountDue - discountAmount);
const settledByDiscount = netDue <= 0;
return {
  masterlist_id: masterlist.id,
  installment_no: row.installmentNo,
  due_date: row.dueDate,
  amount_due: row.amountDue,
  discount_amount: discountAmount,
  amount_paid: 0,
  status: settledByDiscount ? "paid" : "pending",
  paid_at: settledByDiscount ? releaseDate : null,
  line_type: row.lineType ?? "standard",
};
```

This closes both F1 (the row correctly shows `paid`) and F3 (a row already
`paid` at creation can never match the reversion rule's `status <> 'paid'`
filter — the discount is never at risk of being clawed back on a row that
was 100% waived from day one).

**Why this only needs to run at creation, not on every posting/aging pass:**
a row's net due can only reach ≤0 two ways — (a) it was already ≤0 the
moment the discount was fixed at release (handled here), or (b) enough cash
was posted to satisfy it (already correctly handled by the existing
`postSingleDcrItem` `newPaid >= totalDue` check, which already flips status
to `paid` on that path). There is no third route by which a row's net due
silently reaches zero without either event firing — origination discount
amounts are fixed at release and only ever move via reversion (which
*increases* net due, never decreases it).

**Do not touch in this phase:**
- `computeAutoAllocation`'s zero-due skip in `src/lib/ar/posting.ts` — it is
  correct; it's what exposed this gap, not the cause of it.
- The discount-reversion rule (TS or SQL) — correct as-is; it will simply no
  longer match rows that are genuinely settled.
- `postSingleDcrItem`, `writeOffRoundingDifference` — untouched; this phase
  closes the gap upstream of both instead of adding a third "paid" path.

**New test:** in a masterlist-creation-level test (or a focused unit test on
the row-building logic if it's extracted for testability), assert a row with
`amountDue === discountAmount` is inserted with `status: "paid"`, and a row
with a partial discount is still inserted `"pending"`.

**Definition of done:** new test passes; `npm test` green; **does not**
require live verification of a *new* release (Phase 5's data repair is what
proves this against real historical data) — but do create one fresh test
loan with a 100%-discounted installment through CSA→release and confirm its
row is born `"paid"`, matching the ledger. **Live-verify required.**

---

## Phase 3 — Build the derived-balance function (foundation only, not wired in yet)

**Why third, as its own phase:** F2, F5, F6's balance half, F7, and F9 all
stem from the same defect — `outstanding_balance` is a running subtraction
maintained independently at multiple sites instead of being computed from
the rows. Fixing each site with its own hand-rolled correction (as the
now-superseded audit language originally implied) means five chances to get
the arithmetic wrong instead of one. Building one correct, tested function
*before* wiring it anywhere lets Phase 4 be a pure call-site swap with
nothing new to get wrong.

**Correction to the source audit, found while preparing this plan:** F2's
example account (AN300420) was **not** an origination-discount case —
`computations.origination_discounts` is `null` for it. It was settled via
an **Internal Transfer / "Other Loan"** full settlement, posted by the
Postgres function `post_internal_transfer` (not by `postSingleDcrItem`).
That function correctly reduces the *rows* by the transfer's early-settlement
discount, but reduces `outstanding_balance` by only `v_transfer.amount` (the
cash-equivalent portion) — never by the discount portion. Verified exactly:
₱116,523.00 (original) − ₱99,670.50 (`v_transfer.amount`) = ₱16,852.50,
matching the stuck balance to the centavo. **This is a fifth accumulation
site, not covered by the original F2 description**, and it lives in SQL, not
TypeScript.

**Touches (new code only, nothing wired in yet):**
- New function `recomputeOutstandingBalance(supabase, masterlistId)` in
  `src/lib/ar/posting.ts` (co-locate with the other balance logic it will
  replace call-by-call in Phase 4).

**Exact definition:**

```ts
/** The account's true outstanding balance, derived fresh from the rows —
 * never accumulated. Sum of net-still-owed (amount_due − discount_amount +
 * penalty_amount − amount_paid, floored at 0) across every installment not
 * already 'paid' or 'rolled'. Penalty is included — see the F7 decision
 * note in docs/ledger-balance-consistency-fix-implementation-plan.md
 * Phase 3 before changing this. */
export async function recomputeOutstandingBalance(
  supabase: SupabaseClient,
  masterlistId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from("amortization_schedules")
    .select("amount_due, discount_amount, penalty_amount, amount_paid, status")
    .eq("masterlist_id", masterlistId)
    .not("status", "in", "(paid,rolled)");
  if (error) throw new Error(error.message);

  return halfUp(
    (data ?? []).reduce(
      (sum, row) =>
        sum +
        netInstallmentDue({
          amountDue: Number(row.amount_due),
          discountAmount: row.discount_amount,
          penaltyAmount: row.penalty_amount,
          amountPaid: row.amount_paid,
        }),
      0,
    ),
  );
}
```

**F7 decision point — resolve before writing this function, not after:**
whether penalty counts toward the official `outstanding_balance` is a
business decision, not an implementation detail (per the audit's own
constraint). The definition above **includes** penalty because that matches
what the row ledger has always shown as "still owed," and because excluding
it would mean the derived balance still disagrees with the ledger the
borrower sees — but this is a recommendation, not something to silently
lock in. **Get explicit confirmation of this choice before merging Phase 3**,
since Phase 4 and the SQL twin both depend on whichever definition is chosen
here.

**SQL twin:** `post_internal_transfer` needs the identical derivation
available in Postgres (it cannot call back into TypeScript). Add a SQL
function `public.recompute_outstanding_balance(p_masterlist_id uuid)
RETURNS numeric` via a new migration, mirroring the exact same formula
(`GREATEST(0, amount_due - COALESCE(discount_amount,0) +
COALESCE(penalty_amount,0) - COALESCE(amount_paid,0))`, summed over rows
`WHERE status NOT IN ('paid','rolled')`) — same pairing discipline as every
other TS/SQL twin fixed today (new migration, not an edit to an existing one).

**Do not touch in this phase:**
- Nothing calls this function yet. Zero behavior change. This phase is
  additive-only — if `npm test` shows any diff in behavior after this phase,
  something leaked into a live call site by mistake.
- Do not yet touch `post_internal_transfer`, `postSingleDcrItem`, or any of
  the four existing read-modify-write sites — that's Phase 4.

**New tests:** direct unit tests of `recomputeOutstandingBalance` against a
mocked Supabase client (mirroring the stub pattern already used in
`posting.test.mts`) covering: no open rows (→ 0), a mix of pending/partial/
overdue rows, rows with discount, rows with penalty, and confirming
`paid`/`rolled` rows are excluded regardless of their stored amounts.

**Definition of done:** new tests pass; function exists and is exported;
SQL twin exists and is directly callable via `execute_sql` for a manual
sanity check against a known account (e.g. confirm it returns ₱0.00 for
AN300434 today). Not live-verified through the UI yet — nothing reads this
function's output until Phase 4.

---

## Phase 4 — Wire the derived balance into every mutation path

**Why fourth:** depends entirely on Phase 3's function existing and being
correct. This phase is a **pure replacement** of five independent
hand-rolled calculations with five calls to the same tested function — no
new arithmetic is introduced here, which is deliberately what makes this
phase low-risk despite touching five call sites.

**Touches:**
1. `src/lib/ar/posting.ts` — `postSingleDcrItem` (the balance update inside
   the per-item loop).
2. `src/lib/ar/posting.ts` — `writeOffRoundingDifference`'s balance update.
3. `src/lib/ar/posting.ts` — `writeOffAccountRoundingDifference`'s balance
   update.
4. `src/lib/ar/posting.ts` — `refreshMasterlistAging`'s reversion-balance
   addition (the block added earlier today).
5. The SQL function `post_internal_transfer` — replace
   `v_new_balance := greatest(0, round(v_ml.outstanding_balance -
   v_transfer.amount, 2));` with a call to
   `public.recompute_outstanding_balance(v_transfer.target_masterlist_id)`,
   evaluated **after** the installment-status updates above it in the same
   function (ordering matters — the rows must already reflect the transfer's
   discount and `amount_paid` before recomputing from them).
6. The SQL function `refresh_one_masterlist_aging` — same replacement for
   its `total_loan`/`outstanding_balance` update at the end, using the SQL
   twin.

**Exact change pattern (TypeScript sites):** replace
```ts
const newBalance = Math.max(0, halfUp(Number(ml?.outstanding_balance ?? 0) - X));
await supabase.from("masterlist").update({ outstanding_balance: newBalance, ... })...
```
with
```ts
const newBalance = await recomputeOutstandingBalance(supabase, masterlistId);
await supabase.from("masterlist").update({ outstanding_balance: newBalance, ... })...
```
— keep every other field in that same `.update()` call exactly as it is
today (`account_status`, `aging_bucket`, etc.) — only the balance's *source*
changes, not the surrounding update shape.

**Note on `total_loan`:** today's reversion-balance fix (Phase 4 site above)
currently adds the reverted discount to **both** `total_loan` and
`outstanding_balance`. `total_loan` is a separate, intentionally-static
field (the originally disclosed obligation) and is **out of scope for this
derived-balance replacement** — only touch the `outstanding_balance` half of
that update in this phase. Confirm this distinction explicitly in the diff;
do not let `total_loan` accidentally become derived too.

**Do not touch in this phase:**
- Any non-balance field in the same `.update()` statements — `status`,
  `paid_at`, `account_status` assignment logic, `aging_bucket`, etc. stay
  exactly as they are.
- `computeAutoAllocation`, `validateAllocationLines`, the reversion `WHERE`
  clause, or anything upstream of "now write the new balance."
- The internal-transfer discount-redistribution logic in
  `post_internal_transfer` (the `v_per_row` loop) — unrelated to the balance
  bug; leave it exactly as-is.

**New tests:** for each of the 4 TypeScript call sites, extend the existing
stub-based tests (in `posting.test.mts` and `aging-parity.test.mts`) to
assert the balance now matches an independently-computed expected value
that includes discount and penalty — not just "decreased by the posted
amount," which was true both before and after this phase and wouldn't catch
a regression. For `post_internal_transfer`, add a case to
`internal-transfers.test.mts` reproducing AN300420's exact numbers and
asserting the resulting balance is ₱0.00, not ₱16,852.50.

**Definition of done:** all new and existing tests pass; `npm test` green.
**Live-verify required:** post a real internal transfer with a discount on a
fresh test loan and confirm the resulting `outstanding_balance` is ₱0.00,
not the discount amount.

---

## Phase 5 — Make posting atomic (F6, the non-balance half)

**Why fifth:** depends on Phase 4 (touches the same functions) but is a
distinct concern — Phase 4 fixed *what number* gets written; this phase
fixes *the fact that the write sequence isn't all-or-nothing*.

**Root cause recap:** `postSingleDcrItem` performs, sequentially, with no
transaction: insert posting → update schedule → update payment status →
recompute + update masterlist balance. A crash partway leaves a durable
inconsistent state. Worse, the idempotency guard
(`if (payment.status === "posted") return;`) checks a flag that is only set
in the *last* step, so a retry after a mid-sequence failure re-runs
everything from the top — including re-inserting the posting row and
double-decrementing the (now-derived, per Phase 4) balance.

**Touches:**
- `src/lib/ar/posting.ts` — `postSingleDcrItem` only.

**Exact change:** move the entire sequence (posting insert, schedule
update, payment update, balance recompute+update) into a single Postgres
function (`CREATE OR REPLACE FUNCTION post_single_dcr_item(...)`, new
migration), called via one `supabase.rpc(...)` from `postSingleDcrItem`
instead of four sequential JS-side calls. Postgres wraps a single function
body in one transaction by default, so this alone gives atomicity without
hand-written transaction control. Keep the existing idempotency guard, but
move the check to be the function's **first** statement (checking
`payments.status <> 'posted'` before any write), so a retry after any
failure — including one that already completed writes but failed to update
the flag — is a guaranteed no-op rather than a partial re-run.

**Do not touch in this phase:**
- `reconcileDcrItem`, `reconcileAndPostDcr`, `addPaymentToDcr` — these call
  `postSingleDcrItem`; their own logic is unaffected, only what they call
  into changes shape (same inputs/outputs, now atomic underneath).
- Phase 4's balance-derivation logic itself — this phase relocates it into
  the new SQL function unchanged, it does not re-derive it differently.

**New tests:** a test simulating a failure injected between two of the
former sequential steps (e.g. mock the RPC call to reject) confirming no
partial writes occurred; a retry-after-failure test confirming no duplicate
posting row and no double-decremented balance.

**Definition of done:** new tests pass; `npm test` green. **Live-verify
required:** post a real payment end-to-end through the UI exactly as today's
AN300431/AN300433 live tests did, confirming identical visible behavior
(this phase must be invisible to a user doing a normal, non-failing post).

---

## Phase 6 — Reconcile the two "is this account done?" systems (F8)

**Why sixth:** depends on Phases 2 and 4 — needs both the row-level status
(now trustworthy per Phase 2) and the account-level balance (now trustworthy
per Phase 4) before it's safe to make them agree.

**Root cause recap:** `account_status` is set purely from
`newBalance <= 0`, independent of whether every row is actually `paid`/
`rolled`. The "installments paid X/Y" counter is a third, independent
tally. All three can disagree (as seen live: `account_status: "paid"` with
4 rows `"pending"`).

**Touches:**
- Wherever `account_status` is currently set to `"paid"`/`"active"` from
  balance alone (the same sites touched in Phase 4) — add a row-level check
  alongside the balance check: `account_status = (newBalance <= 0 AND every
  row is paid/rolled) ? "paid" : "active"`.
- The "installments paid X/Y" counter's source (client-side calculation in
  the AR masterlist page and the Collector/Remedial desk pages, wherever it
  currently counts `status === "paid"` rows) — confirm it already derives
  purely from row status (it should, per the audit's own description of the
  counter behaving correctly once rows are correctly marked) and needs no
  change beyond what Phases 2 and 4 already fix upstream of it.

**Do not touch in this phase:**
- `canMarkPaidOff` / the "Mark as paid off" button logic — it already
  correctly requires all rows paid/rolled; once Phases 2 and 4 land, it
  should already behave correctly with no change needed here. Verify, don't
  "fix," unless testing proves otherwise.
- The balance-recompute logic itself (Phase 4) — this phase only adds an
  *additional* condition to the status assignment, it doesn't change how the
  balance number is derived.

**New tests:** a case where the balance is ₱0.00 but a row is still
`"pending"` (simulating a not-yet-fixed edge case or a future regression)
asserting `account_status` stays `"active"`, not `"paid"`.

**Definition of done:** new tests pass; `npm test` green. **Live-verify
required:** confirm on a real account that `account_status`, the ledger's
row statuses, and the "Mark as paid off" button state all agree.

---

## Phase 7 — Data repair

**Do not start until Phases 1–4 are merged and live-verified.** Repairing
data before the code that produced the drift is fixed means the repair
re-drifts on the next posting/aging run.

**7a. Settle the 23 orphaned rows (F1/F3 backdata).**
For AN300435 (4 rows), AN300431 (7 rows), AN300430 (12 rows — see 7c first):
a migration setting `status = 'paid'`, `paid_at = <a reasonable timestamp,
e.g. release date or now>` for every row where
`amount_due - discount_amount <= 0 AND status NOT IN ('paid','rolled')`.
After Phase 4, also re-run `recomputeOutstandingBalance` for each affected
account and update `outstanding_balance` (should be a no-op for accounts
where it was already correct, e.g. AN300435 — confirms the repair doesn't
silently change a balance that wasn't broken).

**7b. Clear AN300420's phantom debt (F2 backdata).**
After Phase 4 is live, simply re-run `recomputeOutstandingBalance` for this
one account and update — expected result ₱0.00, confirmed against every row
already being `paid`.

**7c. AN300430 — human decision required before any data change.**
Its stored `origination_discounts: [1,2,3]` predates the per-payment
refactor and now reads as "3 weeks" when the rows on file reflect "3
months = 12 weeks" (₱67,003.20 waived) under the old meaning. **Do not
silently pick an interpretation.** Options to present to the business owner:
(a) honor what the rows already show (12 weeks, ₱67,003.20) — no data
change needed, just document that this is the honored figure; (b) honor
what the current `origination_discounts` value implies under today's
meaning (3 weeks, ₱9,136.80) — requires recomputing and rewriting every
row's `discount_amount` and the account's `total_loan`/`outstanding_balance`
downward, a real change to a live, uncompleted loan's terms. This decision
gates 7a for this specific account only — the other two accounts' repairs
are independent and can proceed without waiting on it.

**Do not touch in this phase:**
- Any account not named above.
- Nothing in this phase touches code — migrations only.

**Definition of done:** for 7a/7b, live-verify each named account's ledger,
balance, and "installments paid" counter in the browser after the
migration. For 7c, a documented decision (dated, attributed) exists before
any row in that account is modified.

---

## Cross-phase constraints (apply throughout, not just within one phase)

1. **Never fix a later phase's problem early.** If while implementing
   Phase 2 you notice something Phase 4 will need, note it in this document
   (as was done for Phase 3's internal-transfer discovery) rather than
   reaching ahead and touching Phase 4's files.
2. **Every SQL change is a new migration.** Never edit
   `20260831040000_...`, `20260831050000_...`, `20260831060000_...`,
   `20260831070000_...`, or any other already-applied migration file.
3. **The ledger display layer stays untouched throughout.**
   `build-account-ledger-rows.ts`, `mapScheduleRowForLedger`,
   `AMORTIZATION_SCHEDULE_LEDGER_COLUMNS` — fixed and verified earlier
   today, out of scope for every phase above.
4. **`computeAutoAllocation`'s zero-due skip is never reverted.** Multiple
   phases above depend on it staying exactly as-is; it is correct.
5. **Penalty-in-or-out (Phase 3) and AN300430's interpretation (Phase 7c)
   are the only two business decisions in this plan.** Everything else is
   a mechanical fix with a single correct answer verifiable by test and by
   live data — do not treat any other item as requiring a judgment call
   that would justify skipping its test coverage.
6. **Run the full phase order start-to-finish once before declaring the
   audit closed.** A phase passing in isolation does not guarantee the
   sequence as a whole is drift-free — Phase 7's live-verification step is
   also the final end-to-end proof that Phases 1–6 compose correctly.
