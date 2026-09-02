# Move of Payment — Audit + Phase-by-Phase Implementation Plan

**Status:** Phases 1–7 implemented and live-verified in the browser against real data (2026-09-01). Phase 8 (dedicated test list) was executed incrementally alongside each phase rather than as a separate final pass — see each phase's own "Tests" note. Post-Phase-7, the Collector-facing selection was reworked from auto-target-earliest to full manual pick — see the Addendum at the end of this document. Every finding below was checked directly against the live codebase (`src/`) and the live Supabase database/schema (project `acopcwlhkovssjnrqygk`) at the time it was written — nothing here was carried over from memory or assumed from the requirements doc alone. Full suite: 1488/1488 passing, `tsc --noEmit` clean.

**Requirements source:** [feature-move-of-payment.md](feature-move-of-payment.md) — read that first; this plan does not restate the business rules, only the build steps and the evidence behind them.

---

## Part 1 — Audit

### 1.1 Confirmed: nothing exists today

Repo-wide case-insensitive search for `moveOfPayment`, `move_of_payment`, "Move of Payment" — zero matches anywhere in `src/`. No schema column, no migration, no API route, no UI, no ledger handling.

### 1.2 Critical finding: "security fee" is already a DB column, but means something else

The transcript calls the one-month-interest surcharge a **"security fee"**:
> *"Sa computation, may tinatawag na security fee."*

`computations.security_fee` **already exists** — but it is a completely different, unrelated concept. Confirmed by reading `src/lib/computation/sme.ts:182` and `src/lib/computation/sf.ts:140`: it's a rate-based **origination deduction**, computed once at release alongside `processingFee`/`docStamp`/`notaryFee`/`adminCost`/`chattelFee`, subtracted from loan proceeds up front. It has nothing to do with a later, collection-time, skip-a-month payment.

**This is a naming collision, not a reusable field.** Whoever builds this must not wire the new feature to `computations.security_fee` — that would silently corrupt origination-fee accounting. The new "security fee" (one month's interest, paid during collection) needs its own, differently-named field.

### 1.3 `amortization_schedules` — full live schema

```
id                          uuid, PK
masterlist_id               uuid, NOT NULL
installment_no              integer, NOT NULL
due_date                    date, NOT NULL
amount_due                  numeric, NOT NULL
penalty_amount              numeric, NOT NULL, default 0
amount_paid                 numeric, NOT NULL, default 0
status                      text, NOT NULL, default 'pending'
paid_at                     timestamptz, NULL
rolled_at                   timestamptz, NULL
rolled_into_installment_no  integer, NULL
discount_amount             numeric, NOT NULL, default 0
line_type                   text, NOT NULL, default 'standard'
```

Two CHECK constraints, confirmed via `pg_get_constraintdef`:
```sql
amortization_schedules_status_check:    status IN ('pending','partial','paid','overdue','rolled')
amortization_schedules_line_type_check: line_type IN ('standard','interest','principal')
```

**Neither enum has a concept of "moved" or "deferred."** Adding this feature requires extending one or both CHECK constraints (additive `DROP CONSTRAINT` + `ADD CONSTRAINT`, same low-risk pattern already used for `payment_frequency` and `addon_months` elsewhere in this codebase's history), not repurposing an existing value.

### 1.4 `rolled_at`/`rolled_into_installment_no` is the closest existing precedent — and it must NOT be reused directly

`refreshMasterlistAging` (`src/lib/ar/posting.ts`) already has a mechanism where one installment's unpaid balance folds into the next installment, and the original is marked `'rolled'` with `rolled_into_installment_no` pointing forward. Structurally the closest thing in this codebase to "one installment's obligation moves onto another."

**But the semantics are the opposite of what Move of Payment needs:**
| | 30-day rollover (existing) | Move of Payment (needed) |
|---|---|---|
| Trigger | Automatic, 30+ days delinquent | Voluntary, Collections-initiated, borrower still current |
| Effect on next installment's balance | **Adds** the rolled balance + penalty on top | **No change** — next installment's `amount_due` stays exactly as computed |
| Penalty | Accrues normally | Explicitly avoided — that's the whole point |
| Reversibility | Never reverts | **Must revert** if the shifted installment is missed |

Reusing `rolled_at`/`rolled_into_installment_no` for this feature would make Move-of-Payment rows indistinguishable from real delinquency rollovers everywhere that column is read (aging bucket calculation, penalty engine, `refreshMasterlistAging`'s own queries, the ledger). **This needs its own, separate columns.**

### 1.5 No one-time-use tracking exists

`masterlist` (full schema re-confirmed via `information_schema.columns`, 34 columns) has no flag for "has this account already used its one-time relief." Needs a new column — a masterlist-level boolean or timestamp is the natural fit, since the rule is once-per-loan, not once-per-installment.

### 1.6 RLS — this determines the entire route architecture

Confirmed via `pg_policy` on `amortization_schedules`, `masterlist`, `postings`:

- **`amortization_schedules` and `masterlist` writes are gated to `accounting_ar:edit` (or Super Admin) only.** No `collection`-module write policy exists on either table.
- **`postings` inserts are gated to `accounting_ar:execute_trigger` specifically.**
- Collector's own role permissions on the `collection` module, confirmed via `role_module_permissions`: **`can_view=true, can_edit=true, can_execute_trigger=false`.**

This means a Collector can never directly write to `amortization_schedules`/`masterlist` under RLS.

**Correction from a second, deeper validation pass (2026-09-01):** the first version of this plan claimed `demand-letter/route.ts` proves the full "permission-check → `createServiceClient()` → privileged write" pattern for Collector routes. **That's only half true, and worth being precise about.** Re-reading that file line by line: it calls `requireModulePermission("collection", "edit")` correctly, but then uses the plain `createClient()` (RLS-bound) for everything after — because it only ever writes to document-generation tables and *reads* `masterlist` (which Collector's own RLS already permits for assigned accounts, via `masterlist_ar_select`'s collector-assignment clause). **It never actually escalates to write an AR-gated table**, so it does not, by itself, prove the write-escalation half of the pattern.

The permission-check half (`requireModulePermission("collection", "edit")`) is correctly demonstrated there and elsewhere in `src/app/api/collector/accounts/*`. The `createServiceClient()`-for-a-privileged-write half is proven elsewhere in this codebase instead — e.g. `initializeArAccount` (in `src/lib/ar/masterlist.ts`) and `recordRelease` (in `src/lib/lra/release-service.ts`), which use the identical technique (verify the caller's permission first, then use a service-role client to write tables that caller's own RLS session couldn't touch). *(Correction, post-validation 2026-09-01: an earlier draft placed both functions in `release-service.ts`; only `recordRelease` lives there — `release-service.ts` imports `initializeArAccount` from `@/lib/ar/masterlist`.)* **This plan's Phase 4 combines two separately-proven techniques from two different parts of the codebase — it is still the correct, established way to do this, but no single existing Collector route already does exactly this end-to-end**, so treat Phase 4 as the first Collector route of this specific shape, not a copy-paste of a working precedent.

### 1.7 Ledger display — two independent surfaces, not one

`src/lib/ledger/build-account-ledger-rows.ts` (`buildAccountLedgerRows`/`mapScheduleRowForLedger`) is the shared, single-source-of-truth ledger row builder this session's earlier work consolidated — but grepping every consumer shows **only `src/app/ar/masterlist/[id]/page.tsx` actually calls it.**

The borrower-facing route, `src/app/api/borrower/applications/[id]/loan/route.ts`, imports only the shared **column list** (`AMORTIZATION_SCHEDULE_LEDGER_COLUMNS`) but builds its own separate response shape from the raw rows — it does not call `mapScheduleRowForLedger` or `buildAccountLedgerRows` at all (confirmed: zero matches for either name in that file). **This is a second, independent place that needs to understand a Move-of-Payment row**, or the borrower dashboard line the transcript explicitly requires (§4 of the requirements doc) will never appear.

`AccountLedgerRow.target` (the row type `buildAccountLedgerRows` returns) is **already nullable** — the existing `"opening"` row kind already sets `target: null`, so a "blank target" row is not a new capability of the row type, just a new row *kind* to add. `LedgerSchedule.target` (the per-installment schedule type) is **not** nullable — confirming a Move-of-Payment entry is correctly modeled as its own new row kind (like `"payment"` rows already are), not a mutation of an existing installment row's target.

### 1.8 UI/route precedent to model this after

`src/app/collector/accounts/[id]/record-payment/` (existing UI) is a real precedent for the trigger-a-privileged-action-from-an-account-page UI shape. For the API route, model the **permission check** on `demand-letter/route.ts`'s `requireModulePermission("collection","edit")` line, and model the **service-role write** on `initializeArAccount` (`src/lib/ar/masterlist.ts`) or `recordRelease` (`src/lib/lra/release-service.ts`) — see the correction in 1.6 above for why these are two different files, and why neither is a single end-to-end precedent for the permission-check-plus-escalation shape Phase 4 needs.

### 1.8b New finding: Quarterly/Bi-Monthly/Two-Monthly loans store one payment as TWO separate rows

Confirmed by reading `src/lib/ar/schedule.ts`'s `generateInterestPrincipalSplitSchedule` (used by both Quarterly and Two-Monthly): each real payment date produces **two separate `amortization_schedules` rows** — one `line_type: 'interest'` and one `line_type: 'principal'`, each with its own `installment_no`, sharing the same `due_date`. (Bi-Monthly, by contrast, is a single blended row per payment, same shape as standard Monthly/Salary.)

This was missed in the original audit. The meeting that produced the Move of Payment requirements (2026-08-25) predates Quarterly/Bi-Monthly/Two-Monthly existing in this system at all (see `implementation-tracker-2026-08-25.md` Feature #5, confirmed premise-false at the time), so the transcript's "applies to all loan types" (§6 of the requirements doc) was said without these two in mind — confirmed by re-reading the transcript directly: Quarterly/Two-Monthly are discussed only much later, in an unrelated part of the meeting about schedule computation, never once in the Move of Payment section.

**RESOLVED (2026-09-01): honor "all loan types" literally — Quarterly and Two-Monthly ARE included, not excluded.** Since the actual obstacle is now understood precisely (one payment date = two rows), the correct fix is to make Move of Payment operate on **the group of rows sharing the next open due date**, not on a single row. For Monthly/Salary/Bi-Monthly that group is always size 1 (unchanged behavior); for Quarterly/Two-Monthly it's size 2 (interest + principal, moved and reverted together, always as one unit). See Phase 2/3 below for the exact mechanics.

### 1.9 Audit logging precedent

`writeAuditEvent()` (`src/lib/audit/writer.ts`) is the established, best-effort, service-role audit log used everywhere else in this codebase. This feature should log through it the same way — `moduleSlug: "collection"`, `action: "execute_trigger"`, `entityType: "amortization_schedule"` or `"masterlist"`, before/after snapshots.

---

## Part 2 — Open business questions

Per [feature-move-of-payment.md §7](feature-move-of-payment.md), four things were not resolved by the transcript. A second validation pass (2026-09-01) surfaced one more. **All five are now resolved. Nothing in this plan is open or pending.**

1. **RESOLVED — who records/owns the transaction: Collector.** Not AR. Phase 4 is written as Collector-only; no AR-relocation branch.
2. **RESOLVED — the revert deadline is not a computed/automatic rule.** The Collector **manually sets the due date** for the shifted payment at the moment they set up the Move of Payment — it is an input the Collector provides, not something the system derives from the next installment's own schedule or a fixed day-count. Phase 1 has a dedicated column for it; Phase 2's `applyMoveOfPayment` takes it as a required input; Phase 3's revert check is a direct comparison against that stored value, nothing computed.
3. **RESOLVED — no timing restriction: available every time.** Confirmed directly — this is *not* restricted to early in the loan (that was only ever the transcript's description of typical real-world usage, never a rule). `canApplyMoveOfPayment` (Phase 2) has exactly one usage gate: has this loan ever used it before. No "only in the first N months" check exists or is needed anywhere in this plan.
4. **RESOLVED — no supervisor approval required.** Confirmed directly — the Collector's own action is final; nothing else to design. Phase 4 as scoped (single Collector action, no second sign-off) is correct and complete as written.
5. **RESOLVED — Quarterly/Two-Monthly are included, not excluded.** See 1.8b: the transcript's "applies to all loan types" is honored literally. Move of Payment operates on **every row sharing the next open due date** (a group of 1 for Monthly/Salary/Bi-Monthly, a group of 2 — interest + principal — for Quarterly/Two-Monthly), moved and reverted together as one unit. Only Invoice/Weekly remains excluded (§6 of the requirements doc — a genuine, transcript-confirmed exclusion, unrelated to this row-grouping question).

---

## Part 3 — Implementation Plan

### Phase 1 — Schema (additive only)

**New migration**, `supabase/migrations/<ts>_move_of_payment_schema.sql`:

```sql
-- amortization_schedules: extend the status CHECK constraint additively.
-- line_type is untouched — a moved row keeps its original 'standard' /
-- 'interest' / 'principal' line_type; only status changes to 'moved'. An
-- earlier draft of this plan also extended line_type with a
-- 'move_of_payment' value, but Phase 2 (revised for the batch-grouping fix,
-- Part 2 item 5) never actually sets it — caught during implementation
-- review, removed here rather than shipping an unused enum value.
alter table public.amortization_schedules
  drop constraint amortization_schedules_status_check,
  add constraint amortization_schedules_status_check
    check (status in ('pending','partial','paid','overdue','rolled','moved'));

-- New columns — deliberately separate from rolled_at/rolled_into_installment_no
-- (see Part 1.4 for why those must not be reused).
alter table public.amortization_schedules
  add column moved_at timestamptz,
  add column moved_to_installment_no integer,
  add column move_surcharge_amount numeric,
  -- Collector-entered, not computed (Part 2, item 2) — the date by which the
  -- shifted payment must come in before Phase 3 reverts this row.
  add column move_of_payment_deadline date,
  -- Links rows moved together in the same action (Part 2, item 5 / 1.8b) —
  -- always 1 row for Monthly/Salary/Bi-Monthly, always 2 (interest +
  -- principal) for Quarterly/Two-Monthly. A shared uuid, not a foreign key
  -- to itself, since the group has no natural "parent" row.
  add column move_of_payment_batch_id uuid;

-- One-time-use tracking, masterlist-level (the rule is once per LOAN).
alter table public.masterlist
  add column move_of_payment_used_at timestamptz;
```

**Do not touch:** `rolled_at`, `rolled_into_installment_no`, `discount_amount`, or either constraint's existing values — this migration only adds new allowed values and new columns, nothing existing changes shape or meaning.

**Definition of done:** migration applies cleanly; `select conname, pg_get_constraintdef(oid) ...` confirms both constraints now include the new value; existing rows are completely unaffected (new columns are nullable, no backfill needed). No application code changes in this phase.

---

### Phase 2 — Backend: the "apply" action (pure eligibility + the actual mutation)

**New file**, `src/lib/ar/move-of-payment.ts` (new module — mirrors how `src/lib/ar/paid-off.ts` isolates one pure eligibility function from its caller):

```ts
export type MoveOfPaymentEligibility =
  | { ok: true; groupInstallmentIds: string[]; surchargeAmount: number }
  | { ok: false; reason: string };

export function canApplyMoveOfPayment(input: {
  moveOfPaymentUsedAt: string | null;
  // Every open row sharing the account's next open due date — length 1 for
  // Monthly/Salary/Bi-Monthly, length 2 (interest + principal) for
  // Quarterly/Two-Monthly. See Part 2, item 5 / 1.8b.
  nextDueDateGroup: Array<{ id: string; status: string; lineType: string }>;
  // "Invoice Financing" is not a loan type in this system (confirmed
  // implementation-tracker-2026-08-25.md Fix #10) — it's identified purely
  // by paymentFrequency === "weekly", the same way every other Invoice
  // exclusion in this codebase gates on it (release-service.ts, masterlist.ts).
  // An earlier draft of this plan named this field loanTypeName, which
  // cannot actually detect Invoice — caught and corrected before implementation.
  paymentFrequency: string | null;
  deadlineDate: string; // Collector-supplied — see Part 2, item 2
  asOf?: Date;
}): MoveOfPaymentEligibility { /* ... */ }
```

Rules encoded here, each tied to a specific citation:
- Already used once on this account → reject (§3).
- `paymentFrequency === "weekly"` (Invoice) → reject (§6 — confirmed exclusion. This is the **only** schedule-type exclusion — Quarterly/Two-Monthly are eligible, see Part 2 item 5).
- `nextDueDateGroup` is empty → reject (nothing to move).
- `deadlineDate` is not a real, future calendar date (basic sanity check only — the transcript places no other constraint on what date the Collector may pick, so this function does not second-guess their judgment beyond "it must be a real date after today").

**New function**, `applyMoveOfPayment(supabase, masterlistId, actorId, deadlineDate)` in the same file — `deadlineDate` is a **required parameter, supplied by the Collector through the UI (Phase 5), never computed** (Part 2, item 2):
1. Re-fetch **every open row sharing the account's next open due date** (`select ... where masterlist_id = ? and status in ('pending','partial','overdue') and due_date = (select min(due_date) from ... where status in (...))`) and `move_of_payment_used_at`, inside the same call — never trust a caller-supplied eligibility result, same discipline as `canMarkPaidOff`/`markPaidOff`. This group is 1 row for Monthly/Salary/Bi-Monthly and 2 rows (`line_type: 'interest'` + `line_type: 'principal'`) for Quarterly/Two-Monthly, by construction of how `generateInterestPrincipalSplitSchedule` builds those schedules (1.8b) — nothing here needs to special-case the loan type explicitly, grouping by shared `due_date` handles both shapes uniformly.
2. Re-run `canApplyMoveOfPayment`, including the deadline sanity check; throw if ineligible.
3. Compute the surcharge = one month's interest. **Needs its own real computation, not `computations.security_fee`** (Part 1.2) — the correct source is the same per-installment interest split `discount-units.ts` already computes for origination discounts (reuse `buildDiscountUnits`'s interest-per-unit output, read-only — do not modify `discount-units.ts` itself). **Must be called with the computation's GROSS totalInterest/totalLoan (`computation.grossTotalInterest`, and `principal + grossTotalInterest` for totalLoan), never the net/discounted figures** — the exact gross-vs-net distinction that caused the real, live bug fixed this same week in `docs/ledger-balance-consistency-fix-implementation-plan.md` Phase 1 (F10); reusing `buildDiscountUnits` without this would silently reproduce it for every loan that also has an origination discount. For a size-2 group, the surcharge is simply the interest row's own share — the principal row never carries interest, so nothing extra needs summing.
4. Generate one `move_of_payment_batch_id` (uuid) for this action. For **every row in the group**, set `status = 'moved'`, `moved_at = now()`, `move_of_payment_batch_id = <the generated id>`, `move_of_payment_deadline = <the Collector-supplied date>`, `moved_to_installment_no = <the lowest installment_no in the next open due-date group after this one — informational only, not used by any mechanics>`. Only the interest row (or the single row, for a size-1 group) gets a non-zero `move_surcharge_amount`; the principal row's `move_surcharge_amount` is 0. **`amount_due` is left untouched on every row in the group** — this is the key difference from rollover (Part 1.4): nothing is added to any later installment.
5. Set `masterlist.move_of_payment_used_at = now()`.
6. Call `writeAuditEvent` (Part 1.9) — include `deadlineDate` and the full `groupInstallmentIds` list in the `afterData` snapshot.

**Do not touch:** `computeAutoAllocation`, `postSingleDcrItem`, `recomputeOutstandingBalance`, `refreshMasterlistAging`'s rollover logic, `generateInterestPrincipalSplitSchedule`/`schedule.ts`, or `discount-units.ts` itself (read from it, never modify it in this phase).

**Tests:** pure unit tests for `canApplyMoveOfPayment` (already-used, Invoice exclusion, no-open-group, happy path with a size-1 group, happy path with a size-2 group) — same style as `paid-off.test.mts`. The size-2 case is the one the original version of this plan didn't cover — make sure it's not skipped.

---

### Phase 3 — Backend: the revert path

Unblocked (Part 2, item 2 resolved: the deadline is Collector-entered and stored on the row in Phase 2, not computed). The natural implementation site is still `refreshMasterlistAging` (`src/lib/ar/posting.ts`) — the same nightly/on-access aging pass already walks every open installment. Add one new check: find every distinct `move_of_payment_batch_id` where `status = 'moved' AND move_of_payment_deadline < asOf`, and for **every row sharing that batch id** (Part 2, item 5 — reverting only the interest row and leaving the principal row `'moved'`, or vice versa, would recreate exactly the half-fixed bug 1.8b describes, just in reverse):
1. Sets `status = 'pending'`, then lets the overdue-detection SELECT that runs immediately after (in the same pass, both in the TS function and the SQL twin) re-evaluate real due-date-based status — a reverted row whose original due date is already past is picked up as the overdue installment on that same run and flipped to `'overdue'` with a penalty, so a hardcoded `'pending'` here is corrected before the pass returns. *(As-shipped, verified 2026-09-01: both `src/lib/ar/posting.ts` and the live `refresh_one_masterlist_aging` hardcode `status = 'pending'` in the revert block and rely on this same-pass re-check. An earlier draft of this line said "do not hardcode `'pending'`, recompute the normal way" — the implementation deliberately went the hardcode route because the re-check makes it equivalent and simpler; this text now matches what was built.)*
2. Clears `moved_at`/`moved_to_installment_no`/`move_surcharge_amount`/`move_of_payment_deadline`/`move_of_payment_batch_id`.
3. Lets the existing, untouched penalty logic in the same function naturally accrue a penalty on the now-reverted installment(s) — per the requirements doc, this should not need new penalty logic, only for the row(s) to become visible to the existing penalty check again.

This is a direct date comparison against a stored value, grouped by batch — no day-count arithmetic, no dependency on the next installment's own schedule.

**Constraint, once written:** this must be a new, clearly-separated block inside (or called from) `refreshMasterlistAging`, not interleaved with the existing overdue/penalty/rollover/discount-reversion blocks it already contains — each of those was already independently fixed and tested earlier (see `docs/ledger-balance-consistency-fix-implementation-plan.md`) and must not be touched by this feature.

**Found during implementation, not in the original plan: the TS function is not the only caller.** A real, active `pg_cron` job (`loanstar-aging-daily`, `supabase/migrations/20260717102046_aging_refresh_cron.sql`, runs daily at 17:00 UTC) calls a **SQL-only twin**, `refresh_one_masterlist_aging` → `refresh_all_aging()`, for every active/remedial account — entirely bypassing the TypeScript function above. Without also patching this SQL function, a moved installment would never auto-revert via the nightly job — only if a human happened to trigger the TS path for that specific account. Fixed by adding the identical block (adapted to plpgsql) at the same position in the SQL function, re-fetched live via `pg_get_functiondef` immediately before writing the migration (it had already been modified twice today by an unrelated, earlier plan — never assume a migration file on disk still matches the live function). Live-verified inside a rolled-back transaction against a real row: the revert fired and cleared every field, then the transaction was rolled back, leaving no permanent trace.

---

### Phase 4 — API route (Collector-owned, confirmed)

**New file**, `src/app/api/collector/accounts/[id]/move-of-payment/route.ts`, modeled directly on `demand-letter/route.ts`'s shape:

```ts
const user = await requireModulePermission("collection", "edit"); // already granted, confirmed Part 1.6
// confirm the account is actually assigned to this collector (assignments table),
// same check payments_collector_insert's RLS already encodes for Record Payment
const body = schema.parse(await request.json()); // { deadlineDate: string }
const admin = createServiceClient();
const result = await applyMoveOfPayment(admin, masterlistId, user.id, body.deadlineDate);
```

**Correction from implementation (2026-09-01):** an earlier draft of this sketch also called `writeAuditEvent` here in the route — that's redundant. Phase 2's `applyMoveOfPayment` already writes its own audit event internally (step 6 of that phase); calling it again here would write two audit rows for one action. The route only calls `applyMoveOfPayment` and returns its result.

POST-only (no GET) — Phase 5's "how the UI checks eligibility before rendering the button" is explicitly left open in that phase's own text (a GET here, or eligibility returned alongside the account detail payload); deciding that now would be reaching into Phase 5's scope, not Phase 4's.

Confirmed by the user directly (2026-09-01): this is Collector-owned, not AR — no alternate placement to design around.

**Do not touch:** any existing route under `src/app/api/collector/accounts/[id]/` or `src/app/api/ar/masterlist/[id]/` — this is strictly a new, additional file.

**Live-verified end-to-end (2026-09-01)**, real HTTP requests against the running app, authenticated as the Collector seed account (no Phase 5 UI exists yet, so this was driven directly via `fetch()` from an authenticated browser session, then confirmed against the live database):
- First attempt, against AN300002: **200 OK**, surcharge computed as ₱1,491.99 — hand-verified against the account's real `gross_total_interest` (₱8,951.96) ÷ 6 terms, exact match. Database confirmed: installment #4 correctly `status: 'moved'`, every field set, `amount_due` untouched, `masterlist.move_of_payment_used_at` set, exactly one `audit_events` row written (confirms the earlier double-audit-log fix actually holds).
- Second attempt, same account: correctly rejected — "already been used" — confirming the one-time-use guard works under a real request, not just a mock.
- Test mutation cleaned up afterward (schedule row and `move_of_payment_used_at` reset to their prior state) so the account remains available for Phase 5's live testing later. The `audit_events` row from this test was deliberately left in place — that table is append-only by design (see `writeAuditEvent`'s own doc comment) and recording a real test execution is correct behavior, not something to scrub.

**Found and ruled out during this verification — not a Phase 4 bug:** the first account tried (AN300373) returned a surcharge of ₱34,650,000. Traced directly: that account's `computations` row (`principal: ₱8,250,000`, `gross_total_interest: ₱346,500,000`) is internally inconsistent with its own real, actually-billed schedule (`masterlist.total_loan: ₱2,488,173.83`, real installment amount ₱103,673.91) — a **pre-existing data integrity problem on this one specific seed account**, unrelated to anything this feature touches (nothing else in the live app reads `gross_total_interest` for this account's real schedule the way this new code does, which is why it was never noticed before). Not fixed here — flagging it since `applyMoveOfPayment` is now the first code path that would ever surface it in production, on whichever real account it might affect there.

---

### Phase 5 — Collector UI

**Correction found during implementation: `src/app/collector/accounts/[id]/page.tsx` does not exist.** There is no single "account detail" page at that path — checked directly rather than assumed. The real, already-shipped precedent is a **dedicated page per action**, e.g. `src/app/collector/accounts/[id]/record-payment/page.tsx`, linked from a per-row action button on the accounts list (`src/app/collector/accounts/page.tsx`'s `renderActionButtons`, alongside "Loan File" / "Demand letter" / "Record payment"). Built to match that exact, real pattern instead of the assumed one:

1. **`src/app/api/collector/accounts/[id]/route.ts`** (existing account-detail GET route, already used by Record Payment) — extended its response with a `moveOfPayment` field via a new preview function (added to `move-of-payment.ts` alongside `applyMoveOfPayment`, sharing the same eligibility/surcharge logic via an extracted `loadMoveOfPaymentContext` helper, so preview and submit can never disagree). *(This preview function was first written as `previewMoveOfPayment()` — a single next-due-date candidate — then replaced by `listMoveOfPaymentCandidates()` when manual installment selection was added; see the "Manual installment selection" addendum. As-shipped, `move-of-payment.ts` exports `canApplyMoveOfPayment`, `listMoveOfPaymentCandidates`, and `applyMoveOfPayment`; there is no `previewMoveOfPayment` in the code.)* **Found and fixed while wiring this up:** Collector's own RLS session has zero read access to `computations` at all — confirmed via `pg_policy`, not assumed — so this call had to use `createServiceClient()` (already imported in this file for `fetchPdcChecks`), not the route's regular RLS-bound client, or every preview would have silently failed with "Computation not found."
2. **New page**, `src/app/collector/accounts/[id]/move-of-payment/page.tsx` — self-contained (no shared "desk" component, since this is Collector-only, unlike Record Payment which is shared with Remedial). Shows the eligibility state or, when eligible, the next due date, the real surcharge amount, and a **required native date input the Collector must fill themselves** (Part 2, item 2 — never pre-filled or defaulted) before "Offer Move of Payment" enables. Confirming opens a `ConfirmDialog` restating the surcharge, the chosen deadline, and the one-time-use warning, then POSTs to Phase 4's route.
3. **New link** on the accounts list's existing per-row action bar — "Move of payment," alongside the existing buttons there.

**Do not touch:** the existing Record Payment modal/flow (`RecordPaymentPage.tsx`, `record-payment/page.tsx`) — untouched, confirmed by diff. The accounts list page and the account-detail route were extended additively (new link, new response field) — no existing button, field, or query on either was changed.

**Live-verified in the actual browser (2026-09-01)**, not just via `fetch()` this time: logged in as Collector, opened the new page for AN300002 — confirmed it rendered the correct borrower, next due date, and the exact ₱1,491.99 surcharge from Phase 4's earlier test. Filled in a real deadline via the date input, opened the confirm dialog (verified it showed the right surcharge/deadline/warning text), confirmed, and got the success state with the correct copy. Reloaded the page afterward and confirmed it now correctly shows "Not eligible — ... already been used ..." Test mutation cleaned up afterward, same as Phase 4.

---

### Phase 6 — Ledger display (both surfaces — Part 1.7)

1. **`src/lib/ledger/build-account-ledger-rows.ts`**: add a new row kind (e.g. `"move_of_payment"`) to `AccountLedgerRowKind`, and a new input type carrying the moved due date's `moved_at`/`move_surcharge_amount`/`move_of_payment_batch_id`. **One ledger row per batch, not per underlying database row** — a size-2 Quarterly/Two-Monthly group (Part 2, item 5) still shows as a single line on the ledger, since it represents one payment date from the borrower's point of view, even though it's two rows underneath. The new row renders with `target: null` (already-supported, Part 1.7), `debit = credit = move_surcharge_amount` (the interest row's amount — nets to zero against balance, per requirements §2.3), inserted at the position the moved due date would have occupied.
2. **`src/app/ar/masterlist/[id]/page.tsx`**: pass the new data through to `buildAccountLedgerRows` — no other change to this page's existing rendering of opening/installment/payment/totals rows.
3. **Correction found during implementation: Part 1.7's premise about the borrower route was wrong.** `src/app/api/borrower/applications/[id]/loan/route.ts` itself does no row-shaping at all — it just returns the joined `masterlist` row (with its nested `amortization_schedules`, already selected via `AMORTIZATION_SCHEDULE_LEDGER_COLUMNS`) straight through. The actual rendering happens in `src/components/borrower/LoanActivePanel.tsx`, which — checked directly, not assumed — **already imports and calls `buildAccountLedgerRows`/`mapScheduleRowForLedger`, the same shared builder the AR page uses.** There is no second, independent ledger implementation to patch. Item 1's fix to the shared builder, plus adding the three new fields to this component's local `ScheduleRow` type (for type-completeness — the values already flow through at runtime either way, since TS types don't affect the real JSON payload), is the entire change needed here. The "this route already duplicates the AR page's row logic" premise from the original audit did not hold up — flagging that the original Part 1.7 finding should be corrected, not carried forward as fact.

**Do not touch:** `mapScheduleRowForLedger`'s existing fields, `netTarget`, `discountOrNull`, or any existing row kind's shape.

**Live-verified in the actual AR ledger (2026-09-01)**, real browser, real data: set a real installment to `'moved'` with a ₱1,491.99 surcharge (the same value from Phases 4/5's tests) on an account that also had a genuine prior partial payment on that same row. The ledger correctly showed **both** the original partial payment (untouched, still visible) **and** a new "moved" row with Target `—`, Debit/Credit both ₱1,491.99, unchanged Balance. Confirmed the Report Total still reconciles exactly against the real account balance (₱65,182.85 − ₱35,182.83 = ₱30,000.02) precisely *because* the new row's credit is deliberately excluded from the running total/balance accumulator (it's rendered directly, not via the same `pushCredit` path real payments use) — this was a real design decision proven correct by the live numbers actually balancing, not just asserted. Borrower-side view not separately logged into (the test account belongs to a real user, not a generic seed login) — relied on the confirmed code-level fact that it calls the identical shared functions already proven correct above. Test data cleaned up afterward.

---

### Phase 7 — One-time-use + eligibility surfacing

Surface `masterlist.move_of_payment_used_at` (already written in Phase 2) on the AR/Collector account detail views as a simple "Move of Payment already used on [date]" note when set — read-only display, no new logic beyond what Phase 2 already wrote.

**Implemented as:**
1. **`src/app/ar/masterlist/[id]/page.tsx`** — this page's API route already selects `masterlist.*`, so the column was already in the response; added a note in the Outstanding Balance card, right below the Principal/Monthly/Terms/Net Released row.
2. **`src/app/api/collector/accounts/[id]/route.ts`** — added `move_of_payment_used_at` to the masterlist select and exposed it as `account.moveOfPaymentUsedAt` (not previously in this route's response at all).
3. **`src/app/collector/accounts/[id]/move-of-payment/page.tsx`** — shows the explicit date alongside the existing (dateless) ineligibility reason from Phase 5, so a Collector sees *when* it was used, not just *that* it was used.

**Live-verified on both surfaces (2026-09-01)**, real browser: set a real `move_of_payment_used_at` timestamp, confirmed the AR masterlist page showed "Move of Payment already used on Aug 15, 2026" and the Collector page showed "Move of Payment already used on August 15, 2026" alongside its existing "Not eligible" message. Cleaned up afterward.

---

### Phase 8 — Tests

- Phase 2's pure eligibility tests (already listed there).
- Integration-style tests for `applyMoveOfPayment` using the same hand-rolled Supabase-stub pattern established throughout `src/lib/ar/__tests__/` this session (`posting.test.mts`'s stub style) — happy path (size-1 group), happy path (size-2 Quarterly/Two-Monthly group, both rows get the same `move_of_payment_batch_id` and only the interest row gets a non-zero surcharge), already-used rejection, Invoice exclusion, surcharge computed from the real per-installment interest split (not a hardcoded/flat number).
- Phase 3's revert logic: a stability/idempotency test in the same style as `aging-parity.test.mts`'s existing repeat-run tests, proving a revert only ever fires once and doesn't re-trigger on subsequent aging passes; a test confirming a `'moved'` row with a still-future `move_of_payment_deadline` is left untouched; and a test proving a size-2 batch always reverts **both** rows together, never just one.
- Full suite (`npm test`) and `tsc --noEmit` clean after every phase, per this repo's standing convention.

---

## Part 4 — Cross-phase constraints (apply throughout)

1. **Never write to `computations.security_fee`** for this feature (Part 1.2) — it is a different, existing concept. If a UI label is needed for the new surcharge concept, do not call it "Security Fee" in code/variable names even though the transcript uses that Tagalog-context term informally; name it for what it is (`moveSurchargeAmount`, `securityFeeAmount` as a distinct, feature-scoped identifier — never the shared `computations.security_fee` field).
2. **Never write to `rolled_at`/`rolled_into_installment_no`** for this feature (Part 1.4) — dedicated new columns exist for exactly this reason.
3. **Never modify `refreshMasterlistAging`'s existing overdue/penalty/30-day-rollover/discount-reversion blocks** — Phase 3 adds a new, separate block; it does not touch what's already there (all of which was independently fixed and tested earlier this same week — see `docs/ledger-balance-consistency-fix-implementation-plan.md`).
4. **Never modify `discount-units.ts`** — Phase 2 reads from it, never edits it.
5. **The revert deadline is always Collector-entered, never computed.** Do not add logic anywhere (Phase 2, 3, or the UI) that silently derives or defaults `move_of_payment_deadline` from the next installment's schedule, a fixed day-count, or anything else — the resolved answer (Part 2, item 2) is that this is a discretionary human input, every time.
5b. **Move and revert always operate on the whole `move_of_payment_batch_id` group, never a single row within it** (Part 2, item 5). A Quarterly/Two-Monthly payment is two rows sharing one due date; treating them independently anywhere (moving only one, reverting only one, showing only one on the ledger) recreates the exact half-fixed bug this plan exists to prevent. Every place that reads or writes `status = 'moved'` must query/act by `move_of_payment_batch_id`, not by a single `id`.
6. **`postings.amount`'s undifferentiated-column gap (tracked separately as Feature #9, "Separate Penalty vs. Amortization tracking")** is a related but distinct, pre-existing gap — do not fold a fix for it into this feature's scope.
7. Every migration in Phase 1 is additive (`ADD COLUMN`, constraint `DROP`+`ADD` with a strictly wider allowed-value list) — never a destructive change to an existing column or constraint value.
8. Run `npm test` and `tsc --noEmit` before and after every phase; a phase that leaves either red is not done.

---

## Addendum — Manual installment selection (2026-09-01, post-Phase-7)

**Requested by the user after live-testing Phases 1–7:** instead of the system always auto-targeting the earliest open installment, the Collector should see the account's open schedule and manually pick which installment to move. Confirmed explicitly: *"i want to do the manual"* — the full manual-pick version, not a "show the schedule for visibility only, still auto-target the earliest" compromise.

**What changed, surgically, on top of the already-shipped Phases 1–7:**

- `src/lib/ar/move-of-payment.ts`:
  - `loadMoveOfPaymentContext` gained an optional `targetDueDate` parameter. When given, it targets that due-date group instead of always defaulting to `rows[0]` (the earliest open one). `canApplyMoveOfPayment`'s own logic was untouched — it already only ever validated whatever group it was handed.
  - `previewMoveOfPayment` (single-candidate preview) was replaced by `listMoveOfPaymentCandidates`, which returns every open due-date group on the account with its own real surcharge, computed via the same `loadMoveOfPaymentContext`/`buildDiscountUnits` path `applyMoveOfPayment` itself uses — so the picker can never show a number that disagrees with what actually gets charged.
  - `applyMoveOfPayment` gained a required `dueDate` parameter (the Collector's pick). It is re-validated server-side against the account's real open installments via `loadMoveOfPaymentContext` — never trusted as an opaque pass-through from the client.
- `src/app/api/collector/accounts/[id]/route.ts` — `moveOfPayment` field now comes from `listMoveOfPaymentCandidates` instead of `previewMoveOfPayment`.
- `src/app/api/collector/accounts/[id]/move-of-payment/route.ts` — POST body schema gained a required `dueDate` (YYYY-MM-DD), passed straight through to `applyMoveOfPayment`.
- `src/app/collector/accounts/[id]/move-of-payment/page.tsx` — replaced the "next payment due" static display with a selectable table of every open due date and its surcharge (radio-select rows); the Offer/Confirm flow now names the specific selected due date and is disabled until both a row and a deadline date are chosen.

**Constraints from Part 4 that still hold, unchanged:** #5b (move/revert always act on the whole `move_of_payment_batch_id` group — a manually-selected due date can still be a Quarterly/Two-Monthly 2-row group, and the group-by-due-date grouping logic itself was not touched) and #5 (the deadline is still always Collector-entered, never computed — only *which installment* became manual, not the deadline mechanic). Phase 3's revert logic (`posting.ts` / `refresh_one_masterlist_aging`) needed no change — it already reverts by `move_of_payment_batch_id` and deadline, independent of how the batch was originally selected.

**Live-verified (2026-09-01)** against real data: account AN300002 (Rovick M Romasanta), which had 3 open installments (Jan 10, Feb 10, Mar 10 2027). The Collector manually selected the **middle** one (Feb 10, 2027, not the earliest) and confirmed. Direct database check afterward confirmed only installment #5 (Feb 10) was marked `moved` with the correct surcharge (₱1,491.99) and batch id — installments #4 (Jan 10) and #6 (Mar 10) were untouched, proving the selection is real and not silently defaulting to the earliest row. Test mutation reverted afterward (audit event left in place, per this session's standing practice).

**Tests:** `src/lib/ar/__tests__/move-of-payment.test.mts` — replaced the 3 `previewMoveOfPayment` tests with `listMoveOfPaymentCandidates` equivalents, and added a new test proving `applyMoveOfPayment` with a manually-picked later due date moves only that group, leaving the earlier one alone. Full suite: 1488/1488 passing, `tsc --noEmit` clean (pre-existing unrelated failures in other modules — `vitest` import errors, a few stale test fixtures in `cig`/`lra`/`account` — were present before this change and are out of scope).

---

## Addendum 2 — Two things this build never actually did (found 2026-09-01, post-launch)

Live-testing after Phases 1–7 shipped surfaced two real gaps against the confirmed requirements — not new feature requests, both are already promised by [feature-move-of-payment.md](feature-move-of-payment.md), just never built:

1. **The schedule never actually extends.** §2.2 of the requirements ("*lahat ng month sa ilalim... magmove... yes, mag-extend siya ng isang buwan*" — transcript 2:16:24) and §2.4/§5's "*mag-e-end babalik ng January, hindi February*" (2:22:14) both confirm a successful move should push the loan's final due date out by one payment cycle, by appending one brand-new installment row at the end. **Nothing in Phase 2 does this.** `applyMoveOfPayment` only ever touches the moved row itself (see line 202 of this doc: *"`amount_due` is left untouched on every row in the group"*) — no row is ever inserted anywhere. The moved installment's own amount currently has no row anywhere in the schedule once it's moved; it silently vanishes from the visible obligation instead of landing on a new final installment.
2. **The surcharge is not a real payment.** Confirmed directly by the user (2026-09-01): *"the actual payment from borrower and collection is a must, not just UI."* Today, `applyMoveOfPayment` never inserts into `payments` — the debit/credit line the ledger shows is computed on the fly at render time (`build-account-ledger-rows.ts`'s `"move_of_payment"` row kind), not backed by any real, reconcilable record. This was flagged as unresolved in the original requirements (§7.1 — "who records this, Collection or ER?") and the build shipped without resolving it. It is now resolved: **the surcharge must be a real payment.**
3. **`computations.terms` would go stale once Gap 1 ships.** Checked directly (2026-09-01): AR's masterlist page (`src/app/ar/masterlist/[id]/page.tsx`, the `{terms} mo` span around line 803) shows a static **"Terms: {terms} mo"** label sourced straight from `computations.terms` — the term count fixed at loan origination, never touched by anything in this feature. Once a new installment row is appended, this label would silently keep showing the old, now-wrong count (e.g. "Terms: 6 mo" on a loan that now has 7 installments), contradicting the "Installments paid X/Y" line elsewhere on the same page (`page.tsx:778`, in a different card ~25 lines up — checked, this part is fine: it already derives from the live row count, `trackedCount || terms`, not from raw `terms`). Every other surface checked (Remedial's account page, Collector's queue/detail pages, the Borrower dashboard's `LoanActivePanel`) has no equivalent static term/maturity label — only AR's page has this specific display.

### Why these can't just be patched inline

**Gap 1 (schedule extension)** needs a real new `amortization_schedules` row: a due date one payment cycle past the current last installment, `installment_no` one past the current max, `amount_due` equal to the moved installment's original amount, `status: 'pending'`. **Verified reusable, not hand-rolled:** `addCalendarMonths(anchor, months, day?)` and `advanceSemiMonthly(anchorDate, index)` (both exported from `src/lib/computation/release-date.ts`) are genuinely standalone, single-call date-increment functions — confirmed by reading `schedule.ts` directly, they're the same functions `generateAmortizationSchedule`/`generateBiMonthlySchedule`/`generateInterestPrincipalSplitSchedule` already call internally, not logic embedded only inside a whole-schedule generator. Whoever implements this must call these directly rather than hand-rolling a second date-math implementation that could disagree with them for edge-case frequencies.

**Found during validation, not in the first draft of this addendum:** Quarterly and Two-Monthly loans store one payment date as **two** `amortization_schedules` rows sharing a `due_date` (`line_type: 'interest'` + `line_type: 'principal'` — confirmed via `move-of-payment.ts:79-82,200`, the same grouping Part 2 item 5 / 1.8b already handles for the *moved* side). **The appended row must match this shape** — for a size-2 group, insert two new rows (interest + principal) at the new due date, not one, or a Quarterly/Two-Monthly loan ends up with every other due date carrying 2 rows and the new final one carrying only 1, breaking any `line_type`-aware consumer of that schedule. For Monthly/Salary/Bi-Monthly (size-1 groups), a single new row is correct, unchanged from the original description above.

**Gap 2 (real payment) initially looked like it conflicted with the existing DCR/AR pipeline — it doesn't. The pipeline already has the exact escape hatch needed, just never used.**

- A normal Collector-recorded payment (`POST /api/collector/payments`) inserts into `payments` with `status: 'confirmed'`, then must be submitted in a DCR, reconciled, and only *then* — via `postSingleDcrItem`/`computeAutoAllocation` in `src/lib/ar/posting.ts` — does it actually apply against the borrower's open installments and affect the ledger balance. `computeAutoAllocation` allocates oldest-open-installment-first by default, which would incorrectly reduce a real installment's balance if the surcharge went through it unmodified — breaking *"hindi siya mag-a-affect dito sa remaining balance"* (2:18:13).
- **Found the fix, already built into `postSingleDcrItem` (line ~870-890 of `posting.ts`):** before falling back to `computeAutoAllocation`, it checks a table called `dcr_item_allocations` for that DCR item — if explicit allocation lines already exist there, it uses those instead. One allocation line's `amortization_schedule_id` is nullable — a `null` line means "apply this amount to nothing," i.e. an unapplied credit, the exact mechanism this system already uses for overpayments. `recomputeOutstandingBalance` only ever sums real `amortization_schedules` rows, so an unapplied credit is mathematically invisible to the balance — no new posting logic needed to guarantee "never affects balance," it falls out of the existing formula for free.
- **Correction (2026-09-01): an earlier version of this addendum claimed `dcr_item_allocations` is "read but never written anywhere in this codebase."** That was checked wrong the first time — re-traced and it's false. `addPaymentToDcr` (`src/lib/ar/posting.ts:1278-1370`) already writes to it whenever its caller supplies explicit `allocations`, and the Collector's real DCR screen (`src/app/collector/dcr/page.tsx:340-364`) already calls it with manually-built allocation lines today — this is how a Collector currently splits one payment across specific installments before adding it to a DCR draft. **This table is not dormant; it's a live, working feature.** `validateAllocationLines` (`posting.ts:167-211`) confirms a single `{ amortizationScheduleId: null, amount }` line is valid on its own — it only checks the lines sum to the payment amount, and skips schedule-ownership checks entirely when there are zero non-null schedule ids.
- **Net effect, corrected: Gap 2 doesn't need any new insert logic at all — it can call the existing `addPaymentToDcr` function directly.** `applyMoveOfPayment` creates the `payments` row for the surcharge (`status: 'confirmed'`), then calls `addPaymentToDcr(admin, dcrId, paymentId, collectorUserId, [{ amortizationScheduleId: null, amount: surchargeAmount }])` — the exact same function and code path the Collector's own DCR screen already exercises for manual splits, just invoked with a single unapplied line instead of a UI-built one. This needs a `dcrId`: either the Collector's current open draft DCR (reuse if one exists) or a new one created via the existing `createDcrDraft` in the same call. Everything downstream of that — `postSingleDcrItem`, the `post_single_dcr_item` RPC, balance recompute — runs completely unmodified.

### Open decisions — RESOLVED (2026-09-01, by the user)

1. **Does the new final installment (Gap 1) appear immediately, or only once the surcharge is paid?**
   - **RESOLVED: immediate.** The new final installment row(s) are appended in the same `applyMoveOfPayment` call that marks the moved group, regardless of whether the surcharge has been collected. Consistent with how the moved-row status behaves in Phases 1–7.
2. **When/how is the surcharge (one month's interest) collected?**
   - **RESOLVED: later, separately — via the normal Record Payment flow.** `applyMoveOfPayment` does **not** create a `payments` row or touch any DCR. It only moves the installment(s), appends the extension row(s), and stamps `used_at`. The surcharge amount is stored on the moved row (`move_surcharge_amount`) and shown on the picker / ledger / UI so the Collector knows what to collect, but recording it is a separate action through `/collector/accounts/[id]/record-payment` like any other payment. *(An earlier build of A2-Phase 2/4 auto-created the surcharge payment + DCR item at offer time and made the offer button require payment details; the user rejected that — "why can't I set a deadline / move payment first before I pay" — and it was reverted.)*
3. **If the borrower misses the deadline and the move reverts (Phase 3), what happens to a surcharge that was already recorded?**
   - **RESOLVED: keep as credit.** Phase 3 only reverts the schedule — moved rows back to `'pending'`, and the appended final installment row(s) deleted. Any surcharge payment the Collector recorded separately is a normal payment on the account and is left untouched (becomes a standalone unapplied credit once AR posts it).

### Validation pass (2026-09-01) — found and fixed a real defect in this addendum before any code was written

The first draft of this addendum said to reuse `move_of_payment_batch_id` on the new appended installment row "so revert can find and delete it by batch." **That's wrong, and would have shipped two real bugs.** Traced every consumer of `move_of_payment_batch_id`/`moveOfPaymentBatchId` across `src/` (10 files) before writing the fix below:

1. **The new row would silently vanish from every ledger.** `build-account-ledger-rows.ts:255` — `if (schedule.moveOfPaymentBatchId) { ...; continue; }` — routes *any* row carrying this field into the "part of a moved batch" rendering path, never the plain-installment path. Since the batch is already rendered once (for the original moved row, at line 262's `renderedBatchIds` de-dupe), the new row would hit that `continue` and never render — directly contradicting this doc's earlier claim that "no other ledger surface needs any change for Gap 1."
2. **The new row would never be deleted on revert.** The actual revert query, both in `src/lib/ar/posting.ts:507-511` and its SQL twin (`refresh_one_masterlist_aging`, `supabase/migrations/20260901020000_move_of_payment_revert_sql_twin.sql:73-83`), filters `WHERE status = 'moved' AND move_of_payment_deadline < asOf`. The new row's status is `'pending'`, not `'moved'` — it would never match this query no matter what batch id it carries, so it would survive every revert as a permanent phantom installment.

**Root cause:** `move_of_payment_batch_id` already has one specific, load-bearing meaning ("this row was itself moved away") that multiple pieces of code depend on. Reusing it for a second, different meaning ("this row was created because of that move") breaks both of those dependents. Same category of mistake as Phase 1's own note about not reusing `rolled_at`/`rolled_into_installment_no` (Part 1.4) — this addendum almost repeated it with a different column.

**Corrected design — a new, separate column, never a second meaning on the existing one:**

```sql
alter table public.amortization_schedules
  add column deferred_from_move_of_payment_batch_id uuid;
```

Set **only** on the newly-appended installment row, at creation. Never set on the originally-moved row (that row keeps using `move_of_payment_batch_id` exactly as it already does, completely unchanged). Because `build-account-ledger-rows.ts` never reads this new field, the appended row falls straight through to the ordinary "installment, no credits yet" branch (`build-account-ledger-rows.ts:287-304`) and renders as a completely normal pending row — which was the actual intent all along.

### Build phases (Addendum 2)

Numbered so status is trackable, mirroring the main plan's Phase 1–8 structure:

- **A2-Phase 1 — Schema: ✅ DONE (2026-09-01).** `supabase/migrations/20260901030000_move_of_payment_deferred_column.sql` — adds `amortization_schedules.deferred_from_move_of_payment_batch_id uuid` (nullable) + column comment. Applied live via Supabase MCP `apply_migration` and verified: column present, nullable, comment set; `move_of_payment_batch_id` untouched. No generated-types file in this repo, so no type regen. No app code in this phase.
- **A2-Phase 2 — Backend apply: ✅ DONE (2026-09-01).** `src/lib/ar/move-of-payment.ts`:
  - `loadMoveOfPaymentContext` now selects `amount_due` on the open-rows query and runs one extra query for the schedule's last installment (`installment_no`, `due_date`); its eligible result carries `paymentFrequency`, `dueDay`, `lastInstallmentNo`, `lastDueDate`.
  - New helper `nextScheduleExtensionDueDate(lastDueDate, paymentFrequency)` — one payment cycle past the last row, via `addCalendarMonths` (monthly +1 / quarterly +3 / two_monthly +2), `advanceSemiMonthly(…, 1)` (salary), or +15 days (bi-monthly). Throws for `weekly`/`daily`/unknown. **The increment is anchored on the last installment's own day-of-month, NOT `computation.due_day`** — a 2026-09-01 live test on AN300426 caught the first cut passing `due_day` (a stale origination default of 10) into the math, landing the appended row on Mar 10 instead of Mar 28 where the rest of that schedule sits. `generateAmortizationSchedule`'s monthly branch anchors the same way (no explicit day).
  - `applyMoveOfPayment(supabase, masterlistId, actorId, deadlineDate, dueDate)` — unchanged signature (no surcharge-payment arg). In order: (1) marks the moved group; (2) `insert`s the appended `'pending'` installment row(s) tagged `deferred_from_move_of_payment_batch_id` — 1 for size-1 groups, 2 (interest+principal) for Quarterly/Two-Monthly; (3) stamps `move_of_payment_used_at`; (4) one audit event. Return type gained `extensionInstallmentNos` and `extensionDueDate`. **Does not touch `payments` or any DCR** — the surcharge is collected separately (decision 2 above).
- **A2-Phase 3 — Revert: ✅ DONE (2026-09-01).**
  - `src/lib/ar/posting.ts` `refreshMasterlistAging`: the revert block now also collects each expired batch's `move_of_payment_batch_id` and, after the status revert, `delete()`s `amortization_schedules` rows where `deferred_from_move_of_payment_batch_id` is in that set and `amount_paid = 0`. The surcharge `payments` row is deliberately left as-is (becomes a standalone unapplied credit once AR posts it).
  - `supabase/migrations/20260901040000_move_of_payment_extension_revert_sql_twin.sql`: `CREATE OR REPLACE` of `refresh_one_masterlist_aging` — the current live body (re-fetched via `pg_get_functiondef`) plus one new `DELETE` immediately before the status-revert `UPDATE` (so lapsed batches are still identifiable by `move_of_payment_batch_id`). Applied live via MCP and verified: DELETE block present, status-revert + 30-day-rollover blocks intact.
- **A2-Phase 4 — Route + UI: ✅ DONE (2026-09-01).**
  - `src/app/api/collector/accounts/[id]/move-of-payment/route.ts`: `bodySchema` is unchanged (`deadlineDate` + `dueDate` only).
  - `src/app/collector/accounts/[id]/move-of-payment/page.tsx`: `canOffer` requires only a selected installment row + a valid future deadline. A small info note shows the surcharge amount the borrower owes and says to collect it separately via Record payment. Confirm/success copy updated to match. *(The "Surcharge payment" fieldset from the earlier build was removed per decision 2.)*
- **A2-Phase 5 — Gap 3: ✅ DONE (2026-09-01).** `src/app/ar/masterlist/[id]/page.tsx`: the "Terms" value is now `{trackedCount || terms} mo` (was raw `{terms}`), matching the "Installments paid X/Y" denominator on the same page — so an appended installment shows. (Pre-existing caveat, unchanged by this feature: `trackedCount` counts interest+principal rows separately for Quarterly/Two-Monthly, same as the sibling line at `page.tsx:778`.)
- **A2-Phase 6 — Tests: ✅ DONE (2026-09-01).**
  - `src/lib/ar/__tests__/move-of-payment.test.mts`: stub covers the last-row query and the extension `insert`; fixtures carry `amount_due`. Coverage: size-1 move + one appended installment; size-2 Quarterly move + two appended rows (shared batch id, interest-only surcharge on the moved row); manual non-earliest pick; `listMoveOfPaymentCandidates` writes nothing. No `payments`/DCR stubbing (the action doesn't touch them).
  - `src/lib/ar/__tests__/refresh-masterlist-aging-move-of-payment.test.mts`: stub handles the new `delete()` chain; fixtures carry `move_of_payment_batch_id`. New coverage: lapsed batch deletes its extension by batch id; future-deadline batch deletes nothing; size-2 batch deletes once for the shared id.
  - Full suite: **1489/1489 passing** (was 1488). `tsc --noEmit` clean for every touched file; `eslint` clean except one pre-existing `react-hooks/set-state-in-effect` on the page's fetch-on-mount `useEffect` (present before this work, standard pattern across the app).

### What actually shipped (as-built)

- **Schema:** one new column, `amortization_schedules.deferred_from_move_of_payment_batch_id` (additive, nullable) — separate from `move_of_payment_batch_id` (see validation pass above). Migration `20260901030000`.
- **`src/lib/ar/move-of-payment.ts`** (`applyMoveOfPayment`): after marking the moved group, `insert` the new final installment row(s) with `deferred_from_move_of_payment_batch_id: batchId` (never `move_of_payment_batch_id`) — 1 row for size-1 groups, 2 for Quarterly/Two-Monthly. **No `payments` / DCR interaction** — the surcharge is recorded later through the normal Record Payment flow (decision 2).
- **`src/lib/ar/posting.ts`** + `20260901040000_move_of_payment_extension_revert_sql_twin.sql`: the revert block, after reverting every `status = 'moved'` row for an expired batch (unchanged query), adds `DELETE FROM amortization_schedules WHERE deferred_from_move_of_payment_batch_id IN (<expired batch ids>) AND amount_paid = 0` — a plain separate query against the new column. Same addition in the SQL twin, placed before the status-revert `UPDATE` so batch ids are still readable.
- **UI (`move-of-payment/page.tsx`)**: "Offer Move of Payment" needs only a selected installment + a valid future deadline. An info note shows the surcharge the borrower owes and directs the Collector to Record payment for it.
- **`src/app/ar/masterlist/[id]/page.tsx` (the `{terms} mo` span, ~line 803)** (Gap 3): "Terms" value changed from raw `terms` to `trackedCount || terms`, matching `page.tsx:778`.
- **No other ledger surface needs any change for Gap 1** — the appended row uses the separate column and falls through `build-account-ledger-rows.ts` as an ordinary pending installment.

**Status: A2-Phases 1–6 all shipped 2026-09-01.** Migrations `20260901030000` + `20260901040000` applied live; full suite 1489/1489; `tsc` clean for all touched files. Not yet browser-verified end-to-end as a Collector — a live click-through (offer a Move of Payment on a real seed account, confirm the appended installment appears, record the surcharge via Record payment, then simulate the deadline lapsing and confirm the extension row is deleted) is the remaining check.
