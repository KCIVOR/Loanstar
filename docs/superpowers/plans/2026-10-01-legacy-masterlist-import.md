# Legacy Masterlist Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A super admin uploads a validated Seafarer, SME, or Individual workbook. Each loan becomes a standalone AR Masterlist account with the correct opening schedule, balance, PDCs, and optional read-only legacy payment references; it never appears in LRA, and its borrower can be invited to the portal later.

**Root cause:** The existing `/admin/legacy-import` is dry-run only. Its validate route performs only SELECTs (`src/app/api/admin/legacy-import/validate/route.ts:31-35`), it covers two segments (`src/lib/legacy-import/schemas.ts:5`, `src/lib/legacy-import/fields.ts:13`), and its rows have no schedule or balance data. The only code that creates a Masterlist account is `initializeArAccount` (`src/lib/ar/masterlist.ts:120`). That function regenerates a fresh schedule from the computation with `amount_paid: 0`, so it cannot represent a loan that is part-way through repayment.

**Architecture:** Add one migration with import-tracking and legacy-payment-reference tables plus an atomic `SECURITY DEFINER` RPC bound to `auth.uid()` (no actor parameter). The opening installment schedule—not copied payment transactions—is the servicing ledger. Make a surgical, opt-in patch to the two late-fee functions so they respect that opening position. Add pure workbook and ledger validation, a confirmed commit route, and an invite route. Native release, payment posting, DCR, and LRA code stay untouched, and native schedule rows keep identical late-fee behaviour.

**Tech stack:** Next.js 16.2 App Router, React 19, TypeScript, Zod 4 (`zod ^4.4.3`), ExcelJS 4, Supabase Postgres + RLS, `node --import tsx --test` (package.json `test` script).

**Source:** Design spec `docs/superpowers/specs/2026-10-01-legacy-masterlist-import-design.md` (commit `f33ca99`), revision tracker Item 14. Expected result, quoted from the spec: "Import historical Seafarer, SME, and Individual loans as accurate, released accounts in AR Masterlist, while allowing a borrower portal account to be connected later."

## Decisions (user, 2026-10-01)

| # | Question | Decision |
| --- | --- | --- |
| Q1 | What does the late-fee (penalty) data in the workbook mean, and do fees accrue after the cut-off? | **Settled by the system audit (Audit findings 12–13).** The workbook follows the system's own ledger convention: **Penalty Charged** is the cumulative fee charged, before waivers. **Penalty Waived** and **Penalty Paid** are separate columns. **Amount Paid** is principal and interest money only. Months after the cut-off accrue under the normal system rule (5% a month, compounding). Both late-fee engines are taught to start from the opening position instead of recalculating history. |
| Q2 | Can a workbook carry a discount on a late, unpaid installment? | **Yes, carry all discounts.** Imported discounts are tagged `discount_source = 'legacy'`, and the nightly job's discount reversal skips them (migration patch, Phase 1). |
| Q3 | Do blank fee and rate columns default to 0? | **Yes.** |
| Q4 | Are fully paid loans in scope? | **Both open and paid loans.** A paid account is imported as `account_status 'paid'` with its application `paid_off` (Audit finding 14). |
| Q5 | How are old payment receipts stored? | **As optional legacy references only.** The opening installment schedule determines the live balance. The import never creates normal `payments`, `postings`, DCRs, or DCR items, because those are LoanStar's official cash ledger. A separate read-only legacy-history table retains old receipt date, amount, channel, and reference number without changing collections, reports, or balances. |

## Open questions (resolve before implementing)

None. The audit evidence settled Q1, and the user decided Q2–Q4.

---

## Live database/system validation: 2026-10-05

Read-only queries against project `acopcwlhkovssjnrqygk`; no data was changed.

**Tables and required columns.** `*` means NOT NULL with no default.
- `borrowers`: `email*`, `first_name*`, `last_name*`. `borrower_no` defaults to `generate_borrower_no()`, and `user_id` is nullable. Unique indexes exist on `borrower_no`, `user_id`, and `lower(email)` (`borrowers_email_key`).
- `loan_applications`: `borrower_id*`. `application_no` defaults to `generate_application_no()` and is unique. `status` (text, default `documents_pending`, no CHECK) has `loan_active` among its live values. `segment` defaults to `seafarer`.
- `loan_applications` CHECKs:
  - segment ∈ {seafarer, sme, individual}
  - SME requires `entity_type`
  - `schedule_type = 'monthly'` unless the segment is SME
  - Seafarer requires `payment_schedule = 'monthly'`
  - `individual_loan_type` ∈ {mpl, salary} or NULL
- `computations` required columns: `loan_application_id`, `input_mode`, `input_amount`, `terms`, `pf_rate`, `interest_rate`, `security_fee_rate`, `principal`, `processing_fee`, `admin_cost`, `doc_stamp`, `notary_fee`, `security_fee`, `total_deductions`, `net_released`, `total_interest`, `total_loan`, `monthly_amortization`. Defaults: `addon_months` 2, `due_day` 10, `payment_frequency` `monthly`, `is_active` true.
  - Live `input_mode` values: `PRINCIPAL`, `NET_SARADO`, `NET_LESS_SECURITY`.
  - Live `payment_frequency` values: `monthly`, `semi_monthly`, `bi_monthly`, `daily`, `weekly`, `quarterly`, `quarterly_special`, `two_monthly`, `two_monthly_special`.
- `release_files`: `loan_application_id*` (unique) and `computation_id*`. Status CHECK ∈ {awaiting_path, pdc_encoding, ready_generate, awaiting_signatures, awaiting_briefing, ready_release, released, closed}. Live accounts with a Masterlist row: 19 `released/loan_active`, 37 `closed/loan_active`, 29 `closed/paid_off`.
- `masterlist`: `loan_application_id*` (unique), `borrower_id*`, `borrower_no*`, `borrower_name*`, `loan_amount*`, `principal*`, `total_loan*`, `net_released*`, `monthly_amortization*`, `terms*`, `outstanding_balance*`.
  - `account_status` CHECK ∈ {active, paid, default, remedial}.
  - **`loan_account_no` is nullable and NOT unique.** The only unique indexes are `id` and `loan_application_id`.
  - 86 rows live.
- `amortization_schedules`: `masterlist_id*`, `installment_no*`, `due_date*`, `amount_due*`. Unique on (`masterlist_id`, `installment_no`). Status CHECK ∈ {pending, partial, paid, overdue, rolled, moved}. Live `line_type` values: `standard`, `principal`, `interest`.
- `payments`: `masterlist_id*`, `loan_application_id*`, `borrower_id*`, `payment_date*`, `amount*`, `channel*`, `uploaded_by*`. Status CHECK ∈ {pending_verification, confirmed, rejected, posted}. Live channels: `bank_deposit` 171, `check` 46, `pos_cash` 26.
- `postings`: `dcr_id*`, `payment_id*`, `masterlist_id*`, `amount*`, `posted_by*`. A posting cannot exist without a DCR.
- Live integrity snapshot: 243 payments, 354 postings, and **zero** `payments.status = 'posted'` rows without a posting. The import must preserve that invariant.
- `pdc_checks`: `release_file_id*`, `amount*`, `check_date*`, `bank_name*`. Status CHECK ∈ {active, held, replaced}.
- `penalties`: `masterlist_id*`, `amount*`, `rate_applied*`.
- `assignments`: `masterlist_id*`, and every other column is nullable.
- `legacy_import_runs`: **segment CHECK ∈ {seafarer, sme} only**. `status` is text with default `validated` and no CHECK. `created_by` defaults to `auth.uid()`.
- `audit_events`: `module_slug*`, `action*`.

**Functions** (signatures from `pg_get_function_arguments`):
- `is_super_admin(p_user_id uuid DEFAULT auth.uid())`, SECURITY DEFINER.
- `has_module_permission(p_module_slug, p_permission, p_user_id DEFAULT auth.uid())`, SECURITY DEFINER.
- `recompute_outstanding_balance(p_masterlist_id)` sums `netInstallmentDue` over rows whose status is not in (paid, rolled, moved). Its TypeScript twin is `src/lib/ar/posting.ts:204`, and the shared formula is `src/lib/computation/money.ts:39`.
- `refresh_one_masterlist_aging(p_masterlist_id, p_as_of)` and `refresh_all_aging()` are SECURITY DEFINER.
- `penalty_rate_for_segment(p_segment)`.
- `generate_borrower_no()` and `generate_application_no()`.

**Triggers.**
- `loan_applications`: `guard_draft_status_transition`, which runs on UPDATE only and fires only when the old status is `draft`. Also `guard_application_agent_column` and `guard_application_borrower_column`.
- `masterlist`: `masterlist_stamp_closed_at`.
- `auth.users`: `on_auth_user_created` → `handle_new_user`, which inserts **only** `profiles`, never `borrowers` or roles.

**Cron.** `loanstar-aging-daily` (`0 17 * * *`) runs `refresh_all_aging()`. For each overdue unpaid row it:
- (a) compounds a monthly fee from `penalty_periods_applied + 1` up to the months overdue, inserting `penalties` rows;
- (b) zeroes `discount_amount` on unpaid rows with `due_date <= as_of`;
- (c) recomputes `aging_bucket`, `remedial_flag`, and `account_status = 'remedial'` at 91+ days past due.

**RLS (every policy on every target table, summarised):**
- Writes are allowed only for these roles:

  | Table | Who can write |
  | --- | --- |
  | `masterlist`, `amortization_schedules`, `assignments` | `is_super_admin() OR accounting_ar:edit` (ALL) |
  | `release_files`, `pdc_checks` | `is_super_admin() OR release_lra:edit` (ALL) |
  | `computations` | `is_super_admin() OR computation:create` with an application-status condition (INSERT) |
  | `loan_applications` | super admin, or borrower self-insert (INSERT) |
  | `borrowers` | `is_super_admin() OR user_id = auth.uid() OR borrower_portal:create OR …` (INSERT) |
  | `legacy_import_runs` | `is_super_admin()` only (ALL) |

- `borrowers_update`: `is_super_admin() OR user_id = auth.uid() OR intake:edit`, with no column restriction. **Pre-existing gap:** staff with `intake:edit` can write `borrowers.user_id` on any borrower directly. Nothing in this plan widens that gap. It is noted under Out of scope.
- `masterlist_ar_select` already includes `EXISTS (borrowers b WHERE b.id = masterlist.borrower_id AND b.user_id = auth.uid())`. The `release_files_select`, `pdc_checks_select`, and `applications_select` policies have the same borrower branch. **Setting `borrowers.user_id` is therefore exactly what grants portal visibility**, so the invite is a privilege grant and must stay super-admin-only.
- `payments_select` and `amortization_select` are staff-module based. UNVERIFIED: whether the borrower portal reads them through the user client or the service client. Check that in Phase 5's acceptance test.

**Migration versions.** The latest live versions are `20261001004434` and `20261001002630`. The latest local files are `20261002090000`, `20261002091000`, and `20261002092000`, which were applied live under different version numbers through Supabase MCP. The original plan's file name `20261001170000_…` would sort **before** existing local files, so this plan uses `20261002100000_legacy_masterlist_import.sql`.

## Audit findings

1. **Native writer to mirror.** `initializeArAccount` (`src/lib/ar/masterlist.ts:120-375`):
   - sets `loan_account_no = application_no` (line 199), `borrower_no` from the borrower, `segment`, `outstanding_balance = totalLoan`, `aging_bucket 'current'`, and `account_status 'active'`;
   - inserts schedule rows;
   - inserts an empty `assignments` row (line 353);
   - updates `ar_queue`;
   - appends `loan_active` to `status_history` through `appendStatusHistory` (`src/lib/applications/status.ts:84`, entry shape `{status, at, actorId, note}`);
   - calls `notifyWorkflowEvent("loan_active")`.

   The import must reproduce the account fields, assignment row, and status history entry. It must **not** touch `ar_queue` or `release_queue`, and must not call notifications, because legacy borrowers have no portal user.
2. **Two numbers must stay equal.** Native code treats `masterlist.loan_account_no` and `loan_applications.application_no` as the same value. Set both to the normalized legacy loan number (trimmed, uppercased). Uniqueness must be checked against **both** columns, because `loan_account_no` has no unique index.
3. **LRA visibility.** The LRA queue comes only from `release_queue` (`src/lib/lra/queue.ts:384`). LRA "Released loans" history lists `release_files` with status `closed` (`src/lib/lra/history.ts:242-248`). An imported release file with status `released` and no `release_queue` row therefore stays out of both. That is consistent with the 19 live `released/loan_active` accounts.
4. **Schedule state is maintained by the aging cron, not by the import.** The workbook's aging bucket and account status are overwritten nightly (see the live validation above). The RPC therefore does not accept them as inputs. For open accounts only, it calls `refresh_one_masterlist_aging(masterlist_id, current_date)`, then immediately sets `masterlist.outstanding_balance = recompute_outstanding_balance(masterlist_id)`. The extra balance update is required because the live aging function only refreshes the stored balance when it reverses a discount; a newly accrued penalty alone otherwise leaves the Masterlist balance stale. This applies post-cut-off fees while preserving legacy discounts (Q1–Q2).
5. **Historical payment references are not LoanStar payments.** A normal posted payment requires a DCR and a posting. The production snapshot has no posted payment without one, and reports deliberately use `postings` for money received while the Collection KPI counts `payments.status = 'posted'`. Inserting old receipts into `payments` would therefore create an invalid ledger and conflicting reports.

   The `Payments` worksheet is optional. Its rows are stored only in `legacy_import_payment_history`, linked to the imported-account tracker and clearly labelled as legacy references. They do not update schedules, create a DCR, appear in normal payment history, affect duplicate-DCR checks, or change reports. The schedule rows and `opening_fee_paid` remain the sole opening-balance and historical-fee inputs.
6. **Penalties.** The `penalties` table backs reports (`src/lib/reports/aggregates.ts:180`). For each installment with an opening penalty, insert one `penalties` row with the note `Legacy opening penalty at <balance_as_of>` and `rate_applied = penalty_rate_for_segment(segment)`, so the late-fee breakdown matches the schedule.
7. **The balance formula in the original plan was wrong.** It subtracted `amount_paid` only from principal and counted rolled or moved rows. The system formula is `netInstallmentDue` (`src/lib/computation/money.ts:39`), summed over rows not in (paid, rolled, moved). Validation must import and reuse that function, not re-implement it.
8. **Authorization design in the original plan was unsafe.** A `SECURITY DEFINER` function taking `p_actor_id uuid` and executable by `authenticated` lets any logged-in user pass a super admin's UUID and bypass the check. Fix: no actor parameter. The RPC uses `auth.uid()` and `is_super_admin()` and is called through the **user-scoped** server client (`createClient` from `src/lib/supabase/server`, as `validate/route.ts:40` already does). `EXECUTE` is revoked from `public` and `anon`.
9. **Marker storage.** The original plan added `import_source` columns to `loan_applications` and `masterlist`. AR staff (`masterlist_ar_write`) could flip that marker, and the invite route would trust it. Instead, use a dedicated `legacy_imported_accounts` table that only the RPC writes: SELECT policy only, no write policy, and the definer RPC inserts. It is the single source of truth for "is legacy".
10. **Invite path.**
    - The existing user creation is `POST /api/admin/users` (`src/app/api/admin/users/route.ts:36-90`, `auth_admin:create`, service `createUser` + `user_roles`).
    - Borrower self-registration assigns the `borrower` role by `roles.slug = 'borrower'` (`src/app/api/borrower/register/route.ts:180-192`).
    - No `inviteUserByEmail` exists anywhere in `src/`.
    - `handle_new_user` creates only a `profiles` row, so linking the legacy borrower cannot collide with an auto-created borrower row.
    - If the email already exists in `auth.users`, `inviteUserByEmail` fails. The route must look up the existing auth user and reject with "Email already has a portal account — use CSA Connect". The existing Connect flow is `src/app/api/csa/applications/[id]/connect-borrower/route.ts`.
11. **Existing dry-run.** These files belong to the old row-mapper dry run, stay as they are, and are reused only where stated:
    - `src/lib/legacy-import/{csv,fields,fixes,normalize,parse-file,schemas,server,suggest,validate}.ts`
    - `src/app/api/admin/legacy-import/{validate,runs,mappings}/route.ts`
    - `src/app/admin/legacy-import/page.tsx` (905 lines; CSV template buttons at lines 476-479)

    `requireSuperAdmin` (`src/lib/legacy-import/server.ts:8`) fails closed.

12. **Late-fee ledger convention (system audit for Q1).**
    - `netInstallmentDue` (`src/lib/computation/money.ts:52-57`) is `amount_due − discount + penalty − penalty_discount − amount_paid`. So `penalty_amount` is the **cumulative fee charged** (it is not reduced when a fee is paid), and `amount_paid` includes fee money.
    - The fee part of a payment is known **only** from `postings.penalty_amount`. Both engines read it as `fee_paid` and exclude it from principal: `GREATEST(0, amount_paid − fee_paid)`. This comes from migration `20260909045310_penalty_fee_paid_protection.sql` (decision 2026-09-09).
    - A charged fee is a floor that never drops (`20260909233531_penalty_charged_fee_is_a_floor.sql`, client transcript 2026-09-09).
    - Legacy rows cannot have postings, because `postings.dcr_id` is NOT NULL. Without a patch, every fee a borrower already paid would be read as principal paid. That would make the late-fee base too small and could mark rows `partial` or `paid` wrongly.
13. **Two late-fee engines, and one recalculates history.**
    - (a) The nightly `refresh_one_masterlist_aging` charges only months after `penalty_periods_applied`. It works incrementally, so setting the periods counter at the cut-off is enough.
    - (b) `recompute_account_penalties` runs on **every** DCR post. It is called from `post_single_dcr_item`, latest in `20261002090000_dcr_items_discount_lines.sql:131`, and it **rebuilds the fee from the original due date** (`v_running := 0; FOR v_p IN 1 .. v_target_periods`). It keeps the result only if it is higher than the current fee.
    - So the first collection posted on a legacy account would re-price all of its pre-cut-off months under LoanStar's rule. That would raise any fee the old book charged lower or waived informally.
    - Fix: new columns `opening_penalty_amount`, `opening_penalty_periods`, and `opening_fee_paid` on `amortization_schedules`, plus a surgical patch to both functions: start compounding from the opening position and add `opening_fee_paid` to `fee_paid`.
    - Native rows have NULL or 0 in these columns, so their behaviour is byte-for-byte unchanged.
    - The TypeScript twin `refreshMasterlistAging` (`src/lib/ar/posting.ts:661`) is orphaned (comment at `posting.ts:851-859`; only the SQL path runs). It is left unchanged.
14. **Paid-off accounts (Q4).**
    - Native payoff goes through `markPaidOff`: masterlist `account_status = 'paid'`, then status history `paid_off` (`src/lib/ar/masterlist.ts:521-536`). Eligibility requires every row `paid` and a balance ≤ 0 (`src/lib/ar/paid-off.ts`).
    - `closed_at` is stamped only by a BEFORE **UPDATE** trigger (`20260811162810_ar_masterlist_closed_at.sql`), so an INSERT must set `closed_at` itself.
    - The nightly job only loops over `account_status IN ('active','remedial')` (live `refresh_all_aging` source), so paid imports are never aged.
    - The release file stays `released`, not `closed`, to keep paid imports out of LRA released history (finding 3).
15. **Discount reversal (Q2).**
    - `refresh_one_masterlist_aging` zeroes `discount_amount` on unpaid rows whose due date has passed and adds it back to `total_loan`.
    - `discount_source` CHECK is currently ∈ {origination, offset, collector} (live).
    - The patch adds `legacy` and excludes `discount_source = 'legacy'` from both the reversal SUM and the UPDATE.
    - `post_internal_transfer` also zeroes discounts, but only on the installments a staff member picks for a full settlement. That is a deliberate action, so it stays unchanged.
    - AR staff can already write any schedule column (`amortization_ar_write`), including `discount_source` and the new `opening_*` columns. That is no wider than their existing direct write access to `penalty_amount` and `discount_amount`, so it adds no new privilege.

**Per-variant support:**

| Variant | Constraint to satisfy | Change needed |
| --- | --- | --- |
| Seafarer | `payment_schedule = 'monthly'`, `schedule_type = 'monthly'`, `payment_frequency = 'monthly'` | Validation rule |
| SME | `entity_type` NOT NULL; any live `payment_frequency`; `schedule_type` is one of monthly, weekly, bi-monthly, quarterly, two-monthly, or daily | Validation rule |
| Individual | `schedule_type = 'monthly'`; `individual_loan_type` ∈ {mpl, salary} or blank; frequency ∈ live Individual values (`monthly`, `semi_monthly`, `bi_monthly`, `daily`, `quarterly_special`, `two_monthly_special`) | New segment end to end, including the `legacy_import_runs` CHECK |

**Prior decisions honoured:**
- Only `super_admin` runs the import, and columns stay remappable for the old dry run (memory, 2026-10-01).
- The client uses our template (meeting minutes, 2026-09-11).
- Never recalculate source money values (design spec).
- Work on `main` (user, 2026-09-11).
- Migrations are applied through Supabase MCP, not `db push` (memory, document-template p8).
- Only `*.mts` tests run (`package.json:10`).

---

## Scope and constraints

### In scope
- Three XLSX templates (Seafarer, SME, Individual) with the sheets `Accounts`, `Installments`, optional `Payments` (reference history only), `PDC Checks`, and `Instructions`.
- Browser-side workbook reading and joining, plus pure ledger validation shared by the browser and the server.
- A read-only account dry-run endpoint, a confirmed commit endpoint, and an atomic per-account RPC.
- `legacy_imported_accounts` and `legacy_import_payment_history` tables, and `individual` added to the `legacy_import_runs` segment CHECK.
- A super-admin-only portal invite for imported borrowers.

### Out of scope: do not change
- `initializeArAccount`, normal payments, postings, DCR, DCR-item, cron schedule, and LRA queue/history code.
- The aging and penalty functions, except for the opt-in edits listed in Phase 1 Task 1.2. Behaviour must not change for any row where `opening_penalty_periods IS NULL` and `discount_source IS DISTINCT FROM 'legacy'`.
- The orphaned TypeScript twin `refreshMasterlistAging`.
- The old row-mapper dry run (`validate`, `mappings`, `runs` routes and `validate.ts`). Only its UI template buttons change.
- Historical DCRs, postings, committee/CI history, original staff assignments, and LRA documents.
- The pre-existing `borrowers_update` gap that lets `intake:edit` write `user_id`. Flag it as a separate fix.

### Non-negotiable safety constraints
- The RPC takes no actor ID. It uses `auth.uid()`, raises `insufficient_privilege` unless `is_super_admin()`, and `EXECUTE` is revoked from `public` and `anon`.
- The tracker table has no INSERT, UPDATE, or DELETE policy. Only the definer RPC writes it.
- Each account commits or rolls back as one unit. Any failure raises, and nothing partial remains.
- The RPC re-checks duplicates and the balance itself and never trusts browser totals.
- No notifications, `ar_queue` rows, or `release_queue` rows for imported accounts.
- Old receipt rows are inserted only into `legacy_import_payment_history`, never into the normal `payments` table.
- The invite requires `requireSuperAdmin()` **and** `requireModulePermission("auth_admin","create")`.

### Contract

**`POST /api/admin/legacy-import/account-validate`** with body `{ segment, accounts: LegacyAccount[] }` (at most 200 accounts). Response: `{ results: [{ legacyLoanNo, errors[], warnings[], computedOutstanding, borrowerId?, reusedBorrower, hasPortalUser }] }`. SELECTs only.

**`POST /api/admin/legacy-import/account-import`** with body `{ runId: uuid, segment, confirmed: true, accounts: LegacyAccount[] }` (at most 200 accounts).
- The server rejects the request unless:
  - the run exists, `created_by = user.id`, `status = 'validated'`, and its segment matches;
  - `confirmed === true`;
  - every account passes server-side `validateLegacyAccount`.
- On success it calls the RPC once per account and returns `{ imported: [{legacyLoanNo, masterlistId, borrowerId, hasPortalUser}], failed: [{legacyLoanNo, error}] }`.
- It then sets the run's `status` to `imported` (no failures) or `partially_imported`.

**`POST /api/admin/legacy-import/borrowers/[id]/invite`** with an empty body. Response: `{ userId }`.

| Case | Actor | Input | Required outcome |
| --- | --- | --- | --- |
| Happy path, each segment | super admin | Balanced workbook | One Masterlist account per row, `released` release file, no `release_queue` or `ar_queue` row, tracker row written |
| Balance mismatch | super admin | Declared balance ≠ Σ netInstallmentDue | Dry-run error. If forced to commit, RPC raises `Outstanding balance mismatch` and nothing is written |
| Duplicate number | super admin | Number already in `masterlist.loan_account_no` or `loan_applications.application_no`, or repeated in the file | Dry-run error; RPC raises `Duplicate loan number` |
| Existing borrower email | super admin | Email matches `lower(borrowers.email)` and supplied normalized name/DOB agree | Reuse that borrower profile without changing it; create only the additional loan records; no Auth user is created |
| Conflicting borrower identity | super admin | Email matches an existing borrower but supplied normalized name or a supplied DOB differs | Dry-run error; RPC raises `Email belongs to a different borrower profile` and writes nothing |
| Orphan child row | super admin | An Installment, legacy Payment reference, or PDC row with an unknown loan number | Workbook reader error naming the sheet and row |
| Discount on past-due unpaid row | super admin | `discount > 0`, status ≠ paid, due date ≤ today | Imported with `discount_source 'legacy'`; still present after the nightly run |
| Paid-off account | super admin | Every installment `paid`, balance 0 | Masterlist `paid` with `closed_at` = last paid date, application `paid_off`, no aging call, absent from collector lists |
| Paid account with an unpaid row | super admin | Balance 0 but a row is not `paid`, or balance > 0 with status Paid | Error |
| Fee already paid | super admin | Row with Penalty Charged 500, Penalty Paid 500 | `opening_fee_paid = 500`; the next DCR post does not count the 500 as principal |
| First DCR post on a legacy account | collector/AR | Payment on an overdue legacy row | `recompute_account_penalties` compounds from the opening position only; pre-cut-off months are not re-priced |
| Optional payment references | super admin | Payments sheet present | Stored as read-only legacy reference rows; no `payments`, `postings`, DCR, or balance rows are created |
| Segment rule broken | super admin | Seafarer with non-monthly frequency, or SME without entity type | Error |
| Missing confirmation | super admin | `confirmed` absent or false | 400 |
| Stale or foreign run | super admin | `runId` not owned by the user or not `validated` | 400 |
| Non-admin route call | AR or CSA staff | Any | 403 from `requireSuperAdmin` |
| **Direct RPC call** | AR staff through the Supabase JS client | `rpc('import_legacy_masterlist_account', …)` | Raises `insufficient_privilege` |
| **Direct tracker write** | AR staff | `insert` into `legacy_imported_accounts` | Denied by RLS (no write policy) |
| Re-import | super admin | Same file committed twice | Second run: every account is a duplicate, nothing written |
| Invite | super admin with `auth_admin:create` | Imported borrower with no `user_id` | Auth user invited, `borrower` role assigned, `borrowers.user_id` set, audit event written |
| Invite a non-legacy borrower | super admin | Borrower with no tracker row | 400 "Not a legacy-imported borrower" |
| Invite an already-linked borrower | super admin | `user_id` already set | 409 "Already linked" |
| Invite when the email already has an auth user | super admin | Existing auth email | 409 "Email already has a portal account — use CSA Connect" |
| Invite without `auth_admin:create` | super admin role lacking the permission | Any | 403 |
| Nightly aging after import | cron | Overdue imported row | Charges only months after the cut-off; legacy discount kept |
| Native account regression | cron + DCR | Any native row | Late fee, status, and discount results identical to before the patch |

## Files

| File | Change | Responsibility |
| --- | --- | --- |
| `supabase/migrations/20261002100000_legacy_masterlist_import.sql` | Create | Segment CHECK, `opening_*` columns + `legacy` discount source, opt-in patch to the two late-fee functions, import-tracker and legacy-payment-reference tables + RLS, RPC + grants |
| `src/lib/legacy-import/account-contract.ts` | Create | Zod `legacyAccountSchema`, `accountValidateRequestSchema`, `accountImportRequestSchema`, `legacyAccountSegmentSchema` |
| `src/lib/legacy-import/account-validation.ts` | Create | Pure `validateLegacyAccount`, `penaltyPeriodsAt` |
| `src/lib/legacy-import/workbook.ts` | Create | Template column definitions, `readLegacyWorkbook` (grid → accounts), `buildTemplateWorkbook` |
| `src/lib/legacy-import/import-state.ts` | Create | Pure `canConfirmImport`, `assertInvitableBorrower` |
| `src/lib/legacy-import/invite-auth.ts` | Create | Paginated, case-insensitive Auth-user lookup for an invite |
| `src/lib/legacy-import/__tests__/account-contract.test.mts` | Create | Contract tests |
| `src/lib/legacy-import/__tests__/account-validation.test.mts` | Create | Ledger tests |
| `src/lib/legacy-import/__tests__/workbook.test.mts` | Create | Reader tests |
| `src/lib/legacy-import/__tests__/import-state.test.mts` | Create | UI-gate and invite-guard tests |
| `src/lib/legacy-import/__tests__/invite-auth.test.mts` | Create | Auth-user lookup pagination tests |
| `src/lib/legacy-import/__tests__/fixtures/legacy-account.ts` | Create | Fake test accounts (not `.mts`, so not run as a suite) |
| `src/app/api/admin/legacy-import/account-validate/route.ts` | Create | Read-only dry run |
| `src/app/api/admin/legacy-import/account-import/route.ts` | Create | Confirmed commit |
| `src/app/api/admin/legacy-import/borrowers/[id]/invite/route.ts` | Create | Portal invite + link |
| `src/lib/legacy-import/schemas.ts` | Modify | `runSchema.segment` accepts `individual` (old `segmentSchema` unchanged) |
| `src/app/admin/legacy-import/page.tsx` | Modify | Add an "Account import" mode, XLSX template downloads, review, confirm dialog, result, and invite button |

## Phase 0: Failing tests first

All tests use `node:test` + `node:assert/strict`, following the harness in `src/lib/legacy-import/__tests__/fixes.test.mts:1-8`. The test script (`package.json:10`) always runs every `src/lib/**/__tests__/*.mts` file, so a run lists all suites. Read the result for the named suite.

### Task 0.1: Contract
**File:** `src/lib/legacy-import/__tests__/account-contract.test.mts`
- [ ] Write the tests:
```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { accountImportRequestSchema, legacyAccountSchema, legacyAccountSegmentSchema } from "../account-contract";
import { validAccount } from "./fixtures/legacy-account";

describe("legacy account contract", () => {
  it("accepts a complete account", () => {
    assert.equal(legacyAccountSchema.safeParse(validAccount).success, true);
  });
  it("accepts individual as a segment", () => {
    assert.equal(legacyAccountSegmentSchema.safeParse("individual").success, true);
  });
  it("requires confirmed: true", () => {
    const base = { runId: "00000000-0000-4000-8000-000000000000", segment: "seafarer", accounts: [validAccount] };
    assert.equal(accountImportRequestSchema.safeParse(base).success, false);
    assert.equal(accountImportRequestSchema.safeParse({ ...base, confirmed: true }).success, true);
  });
  it("rejects more than 200 accounts", () => {
    const accounts = Array.from({ length: 201 }, () => validAccount);
    assert.equal(accountImportRequestSchema.safeParse({ runId: "00000000-0000-4000-8000-000000000000", segment: "seafarer", confirmed: true, accounts }).success, false);
  });
});
```
- [ ] Create `src/lib/legacy-import/__tests__/fixtures/legacy-account.ts`. It is **not** `.mts`, so the runner imports it without running it. It holds a fake Seafarer account with `paymentFrequency`, `paymentSchedule`, and `scheduleType` all `monthly`: 12 monthly installments of 10,000.00, rows 1–3 `paid`, row 4 `partial` with 4,000.00 paid, `outstandingBalance` 86,000.00, borrower `juan.test@example.com`. It also exports `validAccountWithPartial`, `validSmeAccount`, and `validIndividualAccount`, each with valid explicit schedule fields.
- [ ] Run: `npm test` → Expected: FAIL with "Cannot find module '../account-contract'".

### Task 0.2: Ledger validation
**File:** `src/lib/legacy-import/__tests__/account-validation.test.mts`
- [ ] Tests, each asserting on `validateLegacyAccount(x, { today: "2026-10-01" }).errors`:
  - valid fixture → `[]`;
  - `outstandingBalance: 5000` → an error matching `/outstanding balance/i`;
  - a row with Penalty Charged 500, Waived 100, Paid 200 and Amount Paid 10,000 on Amount Due 10,000 leaves 200 outstanding (through `netInstallmentDue`);
  - `rolled` and `moved` rows are excluded from the balance;
  - Seafarer with `paymentFrequency: "weekly"` → an error matching `/seafarer.*monthly/i`;
  - SME with no `entityType` → an error matching `/entity type/i`;
   - a discount on an unpaid row with `dueDate <= today` → no error and the input account is unchanged; the RPC, not this pure validator, writes `discount_source = 'legacy'`;
  - `penaltyPaid > penaltyCharged − penaltyWaived` → an error matching `/penalty paid/i`;
   - a legacy payment reference whose date is after `balanceAsOf` → an error matching `/payment.*date/i`;
   - a positive, dated legacy payment reference that does not equal the schedule's historical `amountPaid` → no error, because it is optional reference data rather than the live ledger;
  - a paid account (`accountStatus: "paid"`, every row `paid`, balance 0) → `[]`;
  - `accountStatus: "paid"` with any row not `paid` → an error matching `/paid account/i`;
   - a row marked `paid` with a positive `netInstallmentDue` → an error matching `/paid.*outstanding/i`;
   - an unpaid (`pending`, `partial`, or `overdue`) row with `netInstallmentDue` 0 → an error matching `/status.*paid/i`;
  - `accountStatus: "active"` with balance 0 → an error matching `/use status paid/i`;
  - an Individual or SME account missing `paymentSchedule` → an error, because `loan_applications.payment_schedule` is required;
  - a non-SME account with a non-monthly `scheduleType` → an error;
  - `totalDeductions !== principal - netReleased` → an error.
   - `totalDeductions` that does not equal `processingFee + adminCost + docStamp + notaryFee + securityFee + otherDeductionsTotal` → an error;
   - `totalLoan !== principal + totalInterest` → an error;
   - `validateLegacyAccountBatch([validAccount, { ...validAccount, segment: "individual" }], { today: "2026-10-01", segment: "seafarer" })` returns a segment error on the second result;
   - `validateLegacyAccountBatch` returns duplicate errors on both rows for repeated `upper(trim(legacyLoanNo))`, but permits two distinct loan numbers with the same normalized borrower email when their normalized name and DOB match.
- [ ] Test `penaltyPeriodsAt("2026-06-10", "2026-09-30") === 3`. This must match Postgres `age()` months.
- [ ] Run: `npm test` → Expected: FAIL, module missing.

### Task 0.3: Workbook reader
**File:** `src/lib/legacy-import/__tests__/workbook.test.mts`
- [ ] Tests on plain grids (`Record<sheetName, CellValue[][]>`, header row 1):
  - a missing `Installments` sheet throws `/Installments/`;
  - an installment joins to its account by normalized number (`" ab-1 "` matches `"AB-1"`);
  - an orphan Payment row is an error naming `Payments` and the row number;
  - a duplicate account number is an error;
  - a repeated `installmentNo` within one account is an error;
  - an empty `PDC Checks` sheet is allowed;
  - the `Instructions` sheet is ignored;
  - `buildTemplateWorkbook("individual")` has no `Entity Type` column.
- [ ] Run: `npm test` → Expected: FAIL.

### Task 0.4: UI gate and invite guard
**File:** `src/lib/legacy-import/__tests__/import-state.test.mts`
- [ ] Tests:
  - `canConfirmImport({ validated: true, valid: 1, error: 1, confirmationChecked: true }) === false`;
  - it returns `true` only when `validated && error === 0 && valid > 0 && confirmationChecked`;
  - `assertInvitableBorrower({ userId: "u", isLegacy: true })` throws `/already linked/i`;
  - `assertInvitableBorrower({ userId: null, isLegacy: false })` throws `/not a legacy/i`.
- [ ] Run: `npm test` → Expected: FAIL.

### Task 0.5: Invite Auth lookup
**File:** `src/lib/legacy-import/__tests__/invite-auth.test.mts`
- [ ] Write tests for `findAuthUserByEmail` with a fake `auth.admin.listUsers` implementation: it returns `null` when no normalized email matches; finds a case-insensitive match on page 2; and stops when `nextPage` is null rather than assuming all users fit on the first page.
- [ ] Run: `npm test` → Expected: FAIL with "Cannot find module '../invite-auth'".

## Phase 1: Migration

### Task 1.1: Write and apply the migration
**File:** `supabase/migrations/20261002100000_legacy_masterlist_import.sql`
- [ ] Write the forward SQL:
```sql
-- 1. Individual runs
ALTER TABLE public.legacy_import_runs DROP CONSTRAINT IF EXISTS legacy_import_runs_segment_check;
ALTER TABLE public.legacy_import_runs
  ADD CONSTRAINT legacy_import_runs_segment_check CHECK (segment IN ('seafarer','sme','individual'));

-- 1b. Opening late-fee position + legacy discount tag (NULL/0 on every native row)
ALTER TABLE public.amortization_schedules
  ADD COLUMN opening_penalty_amount numeric,
  ADD COLUMN opening_penalty_periods int,
  ADD COLUMN opening_fee_paid numeric NOT NULL DEFAULT 0;
ALTER TABLE public.amortization_schedules
  ADD CONSTRAINT amortization_schedules_opening_penalty_amount_nonnegative
    CHECK (opening_penalty_amount IS NULL OR opening_penalty_amount >= 0),
  ADD CONSTRAINT amortization_schedules_opening_penalty_periods_nonnegative
    CHECK (opening_penalty_periods IS NULL OR opening_penalty_periods >= 0),
  ADD CONSTRAINT amortization_schedules_opening_fee_paid_nonnegative
    CHECK (opening_fee_paid >= 0);
ALTER TABLE public.amortization_schedules DROP CONSTRAINT amortization_schedules_discount_source_check;
ALTER TABLE public.amortization_schedules ADD CONSTRAINT amortization_schedules_discount_source_check
  CHECK (discount_source IN ('origination','offset','collector','legacy'));

-- 2. Single source of truth for "this account was legacy-imported"
CREATE TABLE public.legacy_imported_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_loan_no text NOT NULL UNIQUE,
  run_id uuid NOT NULL REFERENCES public.legacy_import_runs(id),
  borrower_id uuid NOT NULL REFERENCES public.borrowers(id),
  loan_application_id uuid NOT NULL UNIQUE REFERENCES public.loan_applications(id),
  masterlist_id uuid NOT NULL UNIQUE REFERENCES public.masterlist(id),
  balance_as_of date NOT NULL,
  imported_by uuid NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT legacy_imported_accounts_legacy_loan_no_canonical
    CHECK (legacy_loan_no = upper(btrim(legacy_loan_no)) AND legacy_loan_no <> '')
);
ALTER TABLE public.legacy_imported_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY legacy_imported_accounts_select ON public.legacy_imported_accounts
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR public.has_module_permission('accounting_ar','view'));
-- No INSERT/UPDATE/DELETE policy: only the SECURITY DEFINER RPC writes.

-- 2b. Optional old receipts, deliberately outside LoanStar's live cash ledger.
CREATE TABLE public.legacy_import_payment_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_imported_account_id uuid NOT NULL
    REFERENCES public.legacy_imported_accounts(id) ON DELETE CASCADE,
  payment_date date NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  channel text NOT NULL CHECK (channel IN ('bank_deposit','check','pos_cash')),
  reference_no text,
  source_row_no integer CHECK (source_row_no IS NULL OR source_row_no >= 2),
  imported_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX legacy_import_payment_history_account_date_idx
  ON public.legacy_import_payment_history (legacy_imported_account_id, payment_date);
ALTER TABLE public.legacy_import_payment_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY legacy_import_payment_history_select ON public.legacy_import_payment_history
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR public.has_module_permission('accounting_ar','view'));
-- No INSERT/UPDATE/DELETE policy: only the SECURITY DEFINER RPC writes.

-- 3. Atomic per-account import
CREATE OR REPLACE FUNCTION public.import_legacy_masterlist_account(p_run_id uuid, p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_no text := upper(btrim(p_payload->>'legacyLoanNo'));
  v_email text := lower(btrim(p_payload#>>'{borrower,email}'));
  v_segment text := p_payload->>'segment';
  v_borrower_id uuid; v_borrower_user_id uuid; v_app_id uuid; v_comp_id uuid; v_rf_id uuid; v_ml_id uuid;
  v_legacy_account_id uuid;
  v_borrower_no text; v_declared numeric := (p_payload->>'outstandingBalance')::numeric;
  v_actual numeric; v_rate numeric;
BEGIN
  IF v_actor IS NULL OR NOT public.is_super_admin(v_actor) THEN
    RAISE EXCEPTION 'Super admin only' USING errcode = 'insufficient_privilege';
  END IF;
  PERFORM 1 FROM public.legacy_import_runs
   WHERE id = p_run_id AND created_by = v_actor AND status = 'validated' AND segment = v_segment;
  IF NOT FOUND THEN RAISE EXCEPTION 'Import run is not a validated run for this segment'; END IF;
  IF v_no IS NULL OR v_no = '' THEN RAISE EXCEPTION 'Legacy loan number is required'; END IF;
  IF EXISTS (SELECT 1 FROM public.masterlist WHERE upper(btrim(loan_account_no)) = v_no)
     OR EXISTS (SELECT 1 FROM public.loan_applications WHERE upper(btrim(application_no)) = v_no)
     OR EXISTS (SELECT 1 FROM public.legacy_imported_accounts WHERE legacy_loan_no = v_no) THEN
    RAISE EXCEPTION 'Duplicate loan number %', v_no USING errcode = 'unique_violation';
  END IF;
  IF v_segment NOT IN ('seafarer', 'sme', 'individual') THEN
    RAISE EXCEPTION 'Unsupported segment';
  END IF;
  IF p_payload->>'accountStatus' NOT IN ('active', 'paid') THEN
    RAISE EXCEPTION 'Invalid account status';
  END IF;
  IF p_payload->>'paymentFrequency' IS NULL
     OR p_payload->>'paymentFrequency' NOT IN ('monthly', 'semi_monthly', 'bi_monthly', 'daily', 'weekly', 'quarterly', 'quarterly_special', 'two_monthly', 'two_monthly_special') THEN
    RAISE EXCEPTION 'Invalid payment frequency';
  END IF;
  IF p_payload->>'paymentSchedule' IS NULL
     OR p_payload->>'paymentSchedule' NOT IN ('mpl', 'salary', 'monthly', 'weekly', 'bi_monthly', 'quarterly', 'two_monthly', 'daily', 'quarterly_special', 'two_monthly_special') THEN
    RAISE EXCEPTION 'Invalid payment schedule';
  END IF;
  IF p_payload->>'scheduleType' IS NULL
     OR p_payload->>'scheduleType' NOT IN ('monthly', 'weekly', 'bi_monthly', 'quarterly', 'two_monthly', 'daily') THEN
    RAISE EXCEPTION 'Invalid schedule type';
  END IF;
  IF (v_segment = 'seafarer' AND (p_payload->>'paymentFrequency' <> 'monthly' OR p_payload->>'paymentSchedule' <> 'monthly' OR p_payload->>'scheduleType' <> 'monthly'))
     OR (v_segment <> 'sme' AND p_payload->>'scheduleType' <> 'monthly') THEN
    RAISE EXCEPTION 'Segment does not allow this payment or schedule type';
  END IF;
  IF v_segment = 'sme' AND COALESCE(NULLIF(btrim(p_payload#>>'{borrower,entityType}'), ''), '') NOT IN ('individual', 'corporate') THEN
    RAISE EXCEPTION 'SME entity type is required';
  END IF;
  IF NULLIF(btrim(p_payload->>'individualLoanType'), '') IS NOT NULL
     AND NULLIF(btrim(p_payload->>'individualLoanType'), '') NOT IN ('mpl', 'salary') THEN
    RAISE EXCEPTION 'Invalid individual loan type';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(p_payload->'payments', '[]'::jsonb)) AS payment_ref(row)
    WHERE COALESCE((payment_ref.row->>'paymentDate')::date > (p_payload->>'balanceAsOf')::date, true)
       OR COALESCE((payment_ref.row->>'amount')::numeric <= 0, true)
       OR COALESCE(payment_ref.row->>'channel' NOT IN ('bank_deposit', 'check', 'pos_cash'), true)
  ) THEN
    RAISE EXCEPTION 'Invalid legacy payment reference';
  END IF;
  -- Reuse an email-matched borrower; never overwrite that profile from a workbook.
  SELECT id, borrower_no, user_id INTO v_borrower_id, v_borrower_no, v_borrower_user_id
    FROM public.borrowers WHERE lower(email) = v_email FOR UPDATE;
  IF FOUND THEN
    IF lower(btrim(first_name)) <> lower(btrim(p_payload#>>'{borrower,firstName}'))
       OR lower(btrim(COALESCE(middle_name,''))) <> lower(btrim(COALESCE(p_payload#>>'{borrower,middleName}','')))
       OR lower(btrim(last_name)) <> lower(btrim(p_payload#>>'{borrower,lastName}'))
       OR lower(btrim(COALESCE(suffix,''))) <> lower(btrim(COALESCE(p_payload#>>'{borrower,suffix}','')))
       OR ((p_payload#>>'{borrower,dateOfBirth}') IS NOT NULL AND date_of_birth IS DISTINCT FROM (p_payload#>>'{borrower,dateOfBirth}')::date) THEN
      RAISE EXCEPTION 'Email belongs to a different borrower profile' USING errcode = 'unique_violation';
    END IF;
  ELSE
    -- Insert only when the borrower email is absent. ON CONFLICT closes a concurrent-import race;
    -- if another transaction won, fetch and apply the same identity check before continuing.
    INSERT INTO public.borrowers (email, first_name, middle_name, last_name, suffix, date_of_birth,
        mobile_phone, present_address, manning_agency, pic_work, business_info, profile_data)
    VALUES (
      v_email,
      btrim(p_payload#>>'{borrower,firstName}'),
      NULLIF(btrim(p_payload#>>'{borrower,middleName}'), ''),
      btrim(p_payload#>>'{borrower,lastName}'),
      NULLIF(btrim(p_payload#>>'{borrower,suffix}'), ''),
      NULLIF(btrim(p_payload#>>'{borrower,dateOfBirth}'), '')::date,
      NULLIF(btrim(p_payload#>>'{borrower,mobilePhone}'), ''),
      jsonb_build_object('street', NULLIF(btrim(p_payload#>>'{borrower,presentAddress}'), '')),
      CASE WHEN v_segment = 'seafarer' THEN jsonb_build_object('name', NULLIF(btrim(p_payload#>>'{borrower,manningAgency}'), '')) ELSE '{}'::jsonb END,
      CASE WHEN v_segment = 'seafarer' THEN jsonb_build_object('vessel', NULLIF(btrim(p_payload#>>'{borrower,vessel}'), '')) ELSE '{}'::jsonb END,
      CASE WHEN v_segment = 'sme' THEN jsonb_build_object('companyName', NULLIF(btrim(p_payload#>>'{borrower,businessName}'), ''), 'entityType', NULLIF(btrim(p_payload#>>'{borrower,entityType}'), '')) ELSE '{}'::jsonb END,
      jsonb_build_object('legacyImported', true)
    )
    ON CONFLICT DO NOTHING
    RETURNING id, borrower_no, user_id INTO v_borrower_id, v_borrower_no, v_borrower_user_id;
    IF v_borrower_id IS NULL THEN
      SELECT id, borrower_no, user_id INTO v_borrower_id, v_borrower_no, v_borrower_user_id
        FROM public.borrowers WHERE lower(email) = v_email FOR UPDATE;
      IF NOT FOUND OR lower(btrim(first_name)) <> lower(btrim(p_payload#>>'{borrower,firstName}'))
         OR lower(btrim(COALESCE(middle_name,''))) <> lower(btrim(COALESCE(p_payload#>>'{borrower,middleName}','')))
         OR lower(btrim(last_name)) <> lower(btrim(p_payload#>>'{borrower,lastName}'))
         OR lower(btrim(COALESCE(suffix,''))) <> lower(btrim(COALESCE(p_payload#>>'{borrower,suffix}','')))
         OR ((p_payload#>>'{borrower,dateOfBirth}') IS NOT NULL AND date_of_birth IS DISTINCT FROM (p_payload#>>'{borrower,dateOfBirth}')::date) THEN
        RAISE EXCEPTION 'Email belongs to a different borrower profile' USING errcode = 'unique_violation';
      END IF;
    END IF;
  END IF;

  INSERT INTO public.loan_applications (borrower_id, application_no, status, status_history, segment,
      entity_type, individual_loan_type, schedule_type, payment_schedule, collateral_type)
  VALUES (
      v_borrower_id, v_no, 'loan_active',
      jsonb_build_array(jsonb_build_object('status','loan_active','at',now(),'actorId',v_actor,
        'note','Legacy import — opening balance as of ' || (p_payload->>'balanceAsOf'))),
      v_segment,
      CASE WHEN v_segment = 'sme' THEN NULLIF(btrim(p_payload#>>'{borrower,entityType}'), '') ELSE NULL END,
      CASE WHEN v_segment = 'individual' THEN NULLIF(btrim(p_payload->>'individualLoanType'), '') ELSE NULL END,
      p_payload->>'scheduleType', p_payload->>'paymentSchedule', 'none'
  )
  RETURNING id INTO v_app_id;

  INSERT INTO public.computations (loan_application_id, input_mode, input_amount, terms, addon_months,
      pf_rate, interest_rate, security_fee_rate, principal, processing_fee, admin_cost, doc_stamp,
      notary_fee, security_fee, other_deductions_total, total_deductions, net_released,
      total_interest, gross_total_interest, total_loan, monthly_amortization, release_date,
      first_payment_date, due_day, payment_frequency, loan_type_name, computed_by, is_active)
  VALUES (
      v_app_id, 'PRINCIPAL', (p_payload->>'principal')::numeric, (p_payload->>'terms')::integer, 2,
      (p_payload->>'pfRate')::numeric, (p_payload->>'interestRate')::numeric,
      (p_payload->>'securityFeeRate')::numeric, (p_payload->>'principal')::numeric,
      (p_payload->>'processingFee')::numeric, (p_payload->>'adminCost')::numeric,
      (p_payload->>'docStamp')::numeric, (p_payload->>'notaryFee')::numeric,
      (p_payload->>'securityFee')::numeric, (p_payload->>'otherDeductionsTotal')::numeric,
      (p_payload->>'totalDeductions')::numeric, (p_payload->>'netReleased')::numeric,
      (p_payload->>'totalInterest')::numeric, (p_payload->>'totalInterest')::numeric,
      (p_payload->>'totalLoan')::numeric, (p_payload->>'monthlyAmortization')::numeric,
      (p_payload->>'releaseDate')::date, (p_payload->>'firstPaymentDate')::date,
      (p_payload->>'dueDay')::integer, p_payload->>'paymentFrequency',
      NULLIF(btrim(p_payload->>'loanTypeName'), ''), v_actor, true
  )
  RETURNING id INTO v_comp_id;

  INSERT INTO public.release_files (loan_application_id, computation_id, status)
  VALUES (v_app_id, v_comp_id, 'released') RETURNING id INTO v_rf_id;

  INSERT INTO public.masterlist (loan_application_id, borrower_id, release_file_id, computation_id,
      loan_account_no, borrower_no, borrower_name, segment, loan_amount, principal, total_loan,
      net_released, monthly_amortization, terms, first_payment_date, release_date, loan_type_name,
      manning_agency, vessel_name, outstanding_balance, aging_bucket, account_status, closed_at)
  VALUES (
      v_app_id, v_borrower_id, v_rf_id, v_comp_id, v_no, v_borrower_no,
      concat_ws(' ', NULLIF(btrim(p_payload#>>'{borrower,firstName}'), ''), NULLIF(btrim(p_payload#>>'{borrower,middleName}'), ''), NULLIF(btrim(p_payload#>>'{borrower,lastName}'), ''), NULLIF(btrim(p_payload#>>'{borrower,suffix}'), '')),
      v_segment, (p_payload->>'principal')::numeric, (p_payload->>'principal')::numeric,
      (p_payload->>'totalLoan')::numeric, (p_payload->>'netReleased')::numeric,
      (p_payload->>'monthlyAmortization')::numeric, (p_payload->>'terms')::integer,
      (p_payload->>'firstPaymentDate')::date, (p_payload->>'releaseDate')::date,
      NULLIF(btrim(p_payload->>'loanTypeName'), ''),
      CASE WHEN v_segment = 'seafarer' THEN NULLIF(btrim(p_payload#>>'{borrower,manningAgency}'), '') WHEN v_segment = 'sme' THEN NULLIF(btrim(p_payload#>>'{borrower,businessName}'), '') ELSE NULL END,
      CASE WHEN v_segment = 'seafarer' THEN NULLIF(btrim(p_payload#>>'{borrower,vessel}'), '') ELSE NULL END,
      v_declared, 'current', CASE WHEN p_payload->>'accountStatus' = 'paid' THEN 'paid' ELSE 'active' END,
      CASE WHEN p_payload->>'accountStatus' = 'paid' THEN (p_payload->>'closedAt')::timestamptz ELSE NULL END
  )
  RETURNING id INTO v_ml_id;

  -- System ledger convention (Audit finding 12): amount_paid includes fee money,
  -- penalty_amount is the cumulative fee charged.
  INSERT INTO public.amortization_schedules (masterlist_id, installment_no, due_date, amount_due,
      amount_paid, discount_amount, discount_source, penalty_amount, penalty_discount_amount,
      penalty_periods_applied, opening_penalty_amount, opening_penalty_periods, opening_fee_paid,
      line_type, status, paid_at)
  SELECT v_ml_id, (r->>'installmentNo')::int, (r->>'dueDate')::date, (r->>'amountDue')::numeric,
         COALESCE((r->>'amountPaid')::numeric,0) + COALESCE((r->>'penaltyPaid')::numeric,0),
         COALESCE((r->>'discountAmount')::numeric,0),
         CASE WHEN COALESCE((r->>'discountAmount')::numeric,0) > 0 THEN 'legacy' END,
         COALESCE((r->>'penaltyCharged')::numeric,0), COALESCE((r->>'penaltyWaived')::numeric,0),
         COALESCE((r->>'penaltyPeriods')::int,0),
         COALESCE((r->>'penaltyCharged')::numeric,0), COALESCE((r->>'penaltyPeriods')::int,0),
         COALESCE((r->>'penaltyPaid')::numeric,0),
         COALESCE(r->>'lineType','standard'), r->>'status', (r->>'paidAt')::timestamptz
  FROM jsonb_array_elements(p_payload->'installments') r;

  v_rate := public.penalty_rate_for_segment(v_segment);
  INSERT INTO public.penalties (masterlist_id, amortization_schedule_id, amount, rate_applied, notes)
  SELECT v_ml_id, s.id, s.penalty_amount, v_rate, 'Legacy opening penalty at ' || (p_payload->>'balanceAsOf')
  FROM public.amortization_schedules s WHERE s.masterlist_id = v_ml_id AND s.penalty_amount > 0;

  v_actual := public.recompute_outstanding_balance(v_ml_id);
  IF abs(v_actual - v_declared) > 0.005 THEN
    RAISE EXCEPTION 'Outstanding balance mismatch: declared %, schedule %', v_declared, v_actual;
  END IF;

  INSERT INTO public.assignments (masterlist_id) VALUES (v_ml_id);

  INSERT INTO public.pdc_checks (release_file_id, check_number, amount, check_date, bank_name, ref_account, sort_order, status)
  SELECT v_rf_id, r->>'checkNumber', (r->>'amount')::numeric, (r->>'checkDate')::date, r->>'bankName',
         r->>'refAccount', ord::int, 'active'
  FROM jsonb_array_elements(COALESCE(p_payload->'pdcChecks','[]'::jsonb)) WITH ORDINALITY AS t(r, ord);

  INSERT INTO public.legacy_imported_accounts (legacy_loan_no, run_id, borrower_id, loan_application_id,
      masterlist_id, balance_as_of, imported_by)
  VALUES (v_no, p_run_id, v_borrower_id, v_app_id, v_ml_id, (p_payload->>'balanceAsOf')::date, v_actor)
  RETURNING id INTO v_legacy_account_id;

  -- These are immutable legacy references. Never insert them into public.payments,
  -- public.postings, public.dcr, public.dcr_items, or an amortization schedule.
  INSERT INTO public.legacy_import_payment_history (
      legacy_imported_account_id, payment_date, amount, channel, reference_no, source_row_no)
  SELECT v_legacy_account_id, (r->>'paymentDate')::date, (r->>'amount')::numeric,
         r->>'channel', NULLIF(btrim(r->>'referenceNo'), ''),
         NULLIF(r->>'sourceRowNo', '')::integer
  FROM jsonb_array_elements(COALESCE(p_payload->'payments','[]'::jsonb)) r;

  IF p_payload->>'accountStatus' = 'paid' THEN
    IF v_declared <> 0 OR EXISTS (SELECT 1 FROM public.amortization_schedules
                                  WHERE masterlist_id = v_ml_id AND status <> 'paid') THEN
      RAISE EXCEPTION 'Paid account must have zero balance and every installment paid';
    END IF;
    -- account_status/closed_at were set on the masterlist INSERT: an UPDATE to 'paid' would fire
    -- masterlist_stamp_closed_at and overwrite closed_at with now().
    UPDATE public.loan_applications
       SET status = 'paid_off',
           status_history = status_history || jsonb_build_array(jsonb_build_object(
             'status','paid_off','at',now(),'actorId',v_actor,'note','Legacy import — paid off before import'))
     WHERE id = v_app_id;
  ELSE
    PERFORM public.refresh_one_masterlist_aging(v_ml_id, current_date);
    UPDATE public.masterlist
    SET outstanding_balance = public.recompute_outstanding_balance(v_ml_id)
    WHERE id = v_ml_id;
  END IF;

  RETURN jsonb_build_object('masterlistId', v_ml_id, 'borrowerId', v_borrower_id, 'loanApplicationId', v_app_id,
    'hasPortalUser', v_borrower_user_id IS NOT NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.import_legacy_masterlist_account(uuid, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.import_legacy_masterlist_account(uuid, jsonb) TO authenticated;
```
  Before applying, compare the implemented SQL against these literal mappings; the migration must contain no placeholders:

  | Target | Literal value from `p_payload` |
  | --- | --- |
  | New `borrowers` row only | Insert `email = v_email`, trimmed nullable name parts, `(p_payload#>>'{borrower,dateOfBirth}')::date`, and trimmed nullable phone only when the locked email lookup found no borrower. Never update a reused borrower from a workbook. |
  | `borrowers.present_address` | `jsonb_build_object('street', NULLIF(btrim(p_payload#>>'{borrower,presentAddress}'), ''))` |
  | `borrowers.manning_agency`, `pic_work`, `business_info`, `profile_data` | Respectively `jsonb_build_object('name', NULLIF(btrim(p_payload#>>'{borrower,manningAgency}'), ''))`, `jsonb_build_object('vessel', NULLIF(btrim(p_payload#>>'{borrower,vessel}'), ''))`, `jsonb_build_object('companyName', NULLIF(btrim(p_payload#>>'{borrower,businessName}'), ''), 'entityType', NULLIF(btrim(p_payload#>>'{borrower,entityType}'), ''))`, and `jsonb_build_object('legacyImported', true)`; use `{}` for non-applicable segment JSON fields. |
  | `loan_applications` | `application_no = v_no`, `status = 'loan_active'`, `segment = v_segment`, `entity_type = NULLIF(btrim(p_payload#>>'{borrower,entityType}'),'')` for SME and `NULL` otherwise, `individual_loan_type = NULLIF(p_payload->>'individualLoanType','')`, `schedule_type = p_payload->>'scheduleType'`, `payment_schedule = p_payload->>'paymentSchedule'`, and `collateral_type = 'none'`. The RPC independently rejects non-SME `schedule_type <> 'monthly'`, any Seafarer field not monthly, an SME without an entity type, and values outside the live CHECK lists. |
  | `computations` | `input_mode = 'PRINCIPAL'`, `input_amount = principal`, every named fee/rate and total from the same-named payload field, `other_deductions = '{}'::jsonb`, `gross_total_interest = totalInterest`, `release_date`, `first_payment_date`, `due_day`, `payment_frequency`, `loan_type_name`, `computed_by = v_actor`, `is_active = true`. |
  | `masterlist` | The same number, borrower, computation, and loan values as their source rows; `borrower_name = concat_ws(' ', firstName, middleName, lastName, suffix)`; for Seafarer, `manning_agency`/`vessel_name` are the trimmed workbook values; for SME, they are `businessName` and `NULLIF(entityType, '')`; for Individual, both are `NULL`. |

  The RPC is the final trust boundary. Before it creates the tracker and optional reference-history rows, it must re-check all of the following with SQL and `RAISE EXCEPTION` on any failure, so a direct RPC call cannot bypass the route validator:
  - every required payload money field is present, numeric, and non-negative; `totalDeductions`, `netReleased`, and `totalLoan` satisfy the four source-money equations in Task 2.2 within `0.005`;
  - `paymentFrequency`, `paymentSchedule`, `scheduleType`, `entityType`, and `individualLoanType` satisfy the precise live application constraints described in Task 2.2 before the application INSERT;
  - the derived balance is checked with `recompute_outstanding_balance`, which correctly excludes `paid`, `rolled`, and `moved` rows rather than comparing raw schedule totals to `totalLoan`; it must not reconcile the optional reference rows to the schedule because they are not the live ledger;
  - every optional reference row has a non-future payment date no later than `balanceAsOf`, a positive amount, an allowed channel, and no effect on `public.payments`, `public.postings`, `public.dcr`, `public.dcr_items`, or schedule amounts;
  - a `paid` schedule row has `paid_at IS NOT NULL` and `GREATEST(0, amount_due - discount_amount + penalty_amount - penalty_discount_amount - amount_paid) <= 0.005`; a `pending`, `partial`, or `overdue` row has `paid_at IS NULL` and that same expression is greater than `0.005`;
  - `rolled` and `moved` rows are not permitted for an `accountStatus = 'paid'` import; a paid import has every row paid, a derived balance of zero, and a non-null `closedAt`; an active import has a derived balance greater than zero.
  These checks use the same `0.005` tolerance as `recompute_outstanding_balance`; they do not alter any native row or any existing writer.
- [ ] Apply through Supabase MCP `apply_migration`, with name `legacy_masterlist_import` and the same SQL. This project applies migrations through MCP, not `db push`.
- [ ] Verify (read-only):
  - `select pg_get_constraintdef(oid) from pg_constraint where conname='legacy_import_runs_segment_check'` → includes `individual`.
  - `select policyname, cmd from pg_policies where tablename='legacy_imported_accounts'` → exactly one row, `SELECT`.
  - `select policyname, cmd from pg_policies where tablename='legacy_import_payment_history'` → exactly one row, `SELECT`.
  - `select has_function_privilege('anon','public.import_legacy_masterlist_account(uuid,jsonb)','execute')` → `false`.
- [ ] Deployment order: apply the migration **before** deploying Phase 4 code. Older code never calls the RPC, so applying the migration first is safe.

### Task 1.2: Opt-in patch to both late-fee functions (same migration file, placed before the RPC)
Copy each function's **current live body** with `select prosrc from pg_proc where proname = '<fn>'`. Do not copy an older migration. Re-create the function with `CREATE OR REPLACE`, keeping its signature, `SECURITY DEFINER`, and `search_path` exactly as they are live. Apply only these edits:

**`refresh_one_masterlist_aging(uuid, date)`**
- [ ] E1. In the accrual cursor, change the `fee_paid` expression to `COALESCE((SELECT SUM(po.penalty_amount) FROM public.postings po WHERE po.amortization_schedule_id = s.id), 0) + COALESCE(s.opening_fee_paid, 0) AS fee_paid`.
- [ ] E2. In both the discount-reversal `SELECT COALESCE(SUM(discount_amount), 0)` and the following `UPDATE ... SET discount_amount = 0`, add `AND discount_source IS DISTINCT FROM 'legacy'` to the WHERE clause.
- Nothing else changes. Accrual is already incremental from `penalty_periods_applied`, which the RPC sets to the opening periods.

**`recompute_account_penalties(uuid)`**
- [ ] E3. Add `s.opening_penalty_amount` and `s.opening_penalty_periods` to the cursor SELECT. In the row filter, also allow `COALESCE(s.opening_penalty_periods,0) > 0`.
- [ ] E4. After the `v_fee_paid` SELECT, add `v_fee_paid := v_fee_paid + COALESCE((SELECT opening_fee_paid FROM public.amortization_schedules WHERE id = v_row.id), 0);`.
- [ ] E5. Declare `v_start int;`. Then, in the late-payment ELSE branch, replace `v_running := 0; FOR v_p IN 1 .. v_target_periods LOOP` with:
```sql
      IF v_row.opening_penalty_periods IS NOT NULL THEN
        v_running := COALESCE(v_row.opening_penalty_amount, 0);
        v_start := v_row.opening_penalty_periods + 1;   -- months already priced by the legacy book
      ELSE
        v_running := 0;
        v_start := 1;
      END IF;
      FOR v_p IN v_start .. v_target_periods LOOP
```
  The compounding body, the floor `GREATEST(v_target, v_fee_paid, penalty − waiver)`, the on-time rule, the status CASE, and the penalties reversal/insert all stay verbatim.
- [ ] Verify after applying (read-only): `select prosrc ilike '%opening_fee_paid%' from pg_proc where proname in ('refresh_one_masterlist_aging','recompute_account_penalties')` → both `true`.
- [ ] Native regression check, in a Supabase branch (see Phase 6 data checks): native penalty, status, and discount snapshots are identical before and after.

**Phase constraints:** existing policies and triggers are unchanged. The two functions change only by E1–E5. Behaviour is unchanged for rows where `opening_penalty_periods IS NULL`, `opening_fee_paid = 0`, and `discount_source <> 'legacy'`, which is every native row.

## Phase 2: Contract and ledger validation

### Task 2.1: `account-contract.ts`
- [ ] Define `legacyAccountSegmentSchema = z.enum(["seafarer","sme","individual"])`. The account shape is:
  - `legacyLoanNo`, `segment`, and `borrower` (`firstName`, `middleName?`, `lastName`, `suffix?`, `email`, `mobilePhone?`, `dateOfBirth?`, `presentAddress?` as a single free-form address string stored in `present_address.street`, plus segment fields: `manningAgency?` and `vessel?` for Seafarer; `businessName?` and required `entityType` for SME);
  - loan fields: `releaseDate`, `firstPaymentDate`, `terms`, `paymentFrequency` (the nine computation values), `paymentSchedule` (required, one of `mpl`, `salary`, `monthly`, `weekly`, `bi_monthly`, `quarterly`, `two_monthly`, `daily`, `quarterly_special`, `two_monthly_special`), `scheduleType` (required, one of `monthly`, `weekly`, `bi_monthly`, `quarterly`, `two_monthly`, `daily`), `dueDay` (1–31), `loanTypeName?`, `individualLoanType?` (`mpl` or `salary` when supplied);
  - money fields: `principal`, `totalInterest`, `totalLoan`, `netReleased`, `monthlyAmortization`, `processingFee`, `adminCost`, `docStamp`, `notaryFee`, `securityFee`, `otherDeductionsTotal`, `totalDeductions`, `pfRate`, `interestRate`, `securityFeeRate` (non-negative; defaults to 0 per Q3);
  - cut-off fields: `balanceAsOf`, `outstandingBalance`, `accountStatus` ∈ active/paid, and `closedAt?` (set by validation to the latest `paidAt` for paid accounts);
  - child arrays: `installments[]` (`installmentNo`, `dueDate`, `amountDue`, `amountPaid` (principal and interest only), `discountAmount`, `penaltyCharged` (cumulative), `penaltyWaived`, `penaltyPaid`, `penaltyPeriods?` (filled by validation), `status` ∈ pending/partial/paid/overdue/rolled/moved, `paidAt?`, `lineType?` ∈ standard/principal/interest), optional `payments[]` (legacy reference only: `paymentDate`, positive `amount`, `channel` ∈ bank_deposit/check/pos_cash, `referenceNo?`, `sourceRowNo?`), and `pdcChecks[]` (`checkNumber?`, `bankName`, `refAccount?`, `amount`, `checkDate`).
- [ ] Define `accountValidateRequestSchema` and `accountImportRequestSchema` per the Contract. `confirmed` is `z.literal(true)`, and accounts are capped at 200. These schemas validate request shape only; batch semantic errors stay in the pure validator so the dry run can return a specific error for every affected account instead of a generic malformed-request response.

### Task 2.2: `account-validation.ts`
- [ ] Export `validateLegacyAccount(account, { today })` → `{ errors, warnings, computedOutstanding, penaltyPeriods }`.
  - Import `netInstallmentDue` and `halfUp` from `@/lib/computation/money`.
  - Compute `computedOutstanding = halfUp(Σ netInstallmentDue({ amountDue, discountAmount, penaltyAmount: penaltyCharged, penaltyDiscountAmount: penaltyWaived, amountPaid: amountPaid + penaltyPaid }))` over rows whose status is not `paid`, `rolled`, or `moved`. This is the same mapping the RPC stores.
  - Paid accounts: every row `paid` and balance 0, and `closedAt` = max `paidAt` (required on every row). Active accounts must have a balance > 0.
  - Enforce schedule-state integrity from the same `netInstallmentDue` value: a `paid` row must have zero remaining amount and a `paidAt`; a `pending`, `partial`, or `overdue` row must have a positive remaining amount and no `paidAt`. `rolled` and `moved` rows are excluded from the opening balance and must not be used to make a paid account valid.
  - Do not reconcile optional `payments[]` to installment `amountPaid`: payment references can be incomplete and are not LoanStar's live cash ledger. Instead validate every reference date is on or before `balanceAsOf`, every amount is positive, and every channel is allowed.
  - Enforce source-money reconciliation, always rounded with `halfUp`: `totalDeductions = processingFee + adminCost + docStamp + notaryFee + securityFee + otherDeductionsTotal`; `netReleased = principal − totalDeductions`; and `totalLoan = principal + totalInterest`. Do not require `Σ installments.amountDue = totalLoan`: a legitimate `rolled` or `moved` history can contain both the superseded and replacement rows. The current balance is instead reconciled exclusively through `netInstallmentDue` on rows not in (`paid`, `rolled`, `moved`). Do not manufacture a missing value: required source money fields must be present and non-negative; only the fee/rate fields explicitly named in Q3 may default to 0.
  - Add each Contract rule.
  - Enforce segment combinations: Seafarer requires `paymentFrequency`, `paymentSchedule`, and `scheduleType` all to be `monthly`; SME requires `entityType`; Individual and Seafarer require `scheduleType = 'monthly'`; only SME may use another allowed schedule type. Do not infer one field from another—the workbook supplies each persisted field explicitly.
  - Compute `penaltyPeriods[installmentNo] = penaltyPeriodsAt(dueDate, balanceAsOf)` for `pending`, `partial`, or `overdue` rows that are past due at cut-off; never compute opening periods for `paid`, `rolled`, or `moved` rows.
  - Warn if `balanceAsOf < today − 31 days`.
- [ ] Export `validateLegacyAccountBatch(accounts, { today, segment })` → the same result for every account, after adding an error to each affected result when (a) `account.segment !== segment`, (b) two accounts share `upper(trim(legacyLoanNo))`, or (c) the same normalized borrower email appears with a conflicting normalized first/middle/last/suffix name or a conflicting non-null DOB. Matching borrower identity with distinct loan numbers is valid and must not produce an error. It calls `validateLegacyAccount` for every row first and does not mutate any account. Both API routes must call this batch function, so direct callers cannot bypass the workbook reader's duplicate checks.
- [ ] Export `penaltyPeriodsAt(due, asOf)` as whole calendar months, matching Postgres `date_part('year',age())*12 + date_part('month',age())`.
- [ ] Never mutate input money values.
- [ ] Run: `npm test` → Task 0.1 and 0.2 suites PASS.

## Phase 3: Workbook templates and reader

### Task 3.1: `workbook.ts`
- [ ] Define per-segment column lists for `Accounts`, and shared lists for `Installments`, optional `Payments`, and `PDC Checks`. The join header is `Legacy Loan No.`. `Accounts` explicitly includes `Payment Frequency`, `Payment Schedule`, and `Schedule Type`; Individual omits SME corporate columns.
- [ ] `readLegacyWorkbook(grids)` takes already-extracted grids. Extract them in the browser with the existing `cellToValue` and `trimGrid` (`src/lib/legacy-import/parse-file.ts:13,34`). It returns `{ accounts, errors[] }` with sheet and row references, and assigns each optional Payment row's actual worksheet row number to `sourceRowNo` before sending it to the reference-history table.
- [ ] `buildTemplateWorkbook(segment)` returns an ExcelJS `Workbook` with the five sheets and Instructions stating that the installment schedule is the source of the opening balance. It documents the late-fee convention: Penalty Charged is cumulative, Penalty Waived and Penalty Paid are separate, and Amount Paid excludes fee money. It states that `Payments` is optional, retained as legacy reference history only, and never changes the live LoanStar balance or receipt ledger. The Installments columns are `Legacy Loan No.`, `Installment No.`, `Due Date`, `Amount Due`, `Amount Paid`, `Discount`, `Penalty Charged`, `Penalty Waived`, `Penalty Paid`, `Status`, `Paid Date`, and `Line Type`. Accounts has required `Payment Frequency`, `Payment Schedule`, and `Schedule Type` columns plus `Account Status` (Active or Paid).
- [ ] Run: `npm test` → Task 0.3 PASS.

## Phase 4: Endpoints

### Task 4.1: `account-validate/route.ts`
- [ ] `requireSuperAdmin()`, then parse with `accountValidateRequestSchema` and run `validateLegacyAccountBatch(accounts, { today, segment })`.
- [ ] Using the user-scoped `createClient()`, look up existing numbers in `masterlist.loan_account_no` and `loan_applications.application_no`, plus borrower rows (`id`, `user_id`, normalized name parts, DOB, and email) by email in batches of 200. Add duplicate errors only for account numbers. For an email match, compare borrower identity: add a conflict error when the supplied normalized name or supplied DOB differs; otherwise annotate that account result with `borrowerId`, `reusedBorrower: true`, and `hasPortalUser: Boolean(user_id)`.
- [ ] No writes.

### Task 4.2: `account-import/route.ts`
- [ ] `const user = await requireSuperAdmin()`, then parse `accountImportRequestSchema`, then re-run `validateLegacyAccountBatch(accounts, { today, segment })`. Reject with 400 if any account has errors.
- [ ] Load the run with the user client and check `created_by`, `status`, and `segment`.
- [ ] For each account, call `supabase.rpc("import_legacy_masterlist_account", { p_run_id, p_payload })` through the **user-scoped** client, never the service client, so `auth.uid()` is the caller. Merge `penaltyPeriods` and `closedAt` from validation into the payload before sending. Preserve the returned `hasPortalUser` flag with each imported result for the UI.
- [ ] Collect `imported` and `failed`.
- [ ] Update the run status, then `writeAuditEvent({ actorId: user.id, moduleSlug: "system_config", action: "create", entityType: "masterlist", entityId: masterlistId, afterData: { trigger: "legacy_account_import", runId, legacyLoanNo } })` for each success. This matches `runs/route.ts:35-47`.

### Task 4.3: `schemas.ts`
- [ ] Change only `runSchema.segment` to `legacyAccountSegmentSchema`. Leave `segmentSchema` as is, because the old row mapper stays two-segment.
- [ ] Run: `npm test` and `npm run lint` → PASS.

## Phase 5: Admin UI and invite

### Task 5.1: `import-state.ts`
- [ ] Implement `canConfirmImport` and `assertInvitableBorrower` per Task 0.4.

### Task 5.2: `invite-auth.ts`
- [ ] Implement `findAuthUserByEmail(authAdmin, email)`. Normalize the requested email with `trim().toLowerCase()`, call `authAdmin.listUsers({ page, perPage: 1000 })` beginning at page 1, and compare each returned `user.email?.trim().toLowerCase()` exactly. Continue only while `data.nextPage` is non-null; return the matching user immediately or `null` after the final page. Surface an Auth API error rather than treating it as no match.
- [ ] Run: `npm test` → Task 0.5 PASS.

### Task 5.3: `borrowers/[id]/invite/route.ts`
- [ ] `const user = await requireSuperAdmin(); await requireModulePermission("auth_admin","create");`
- [ ] Load the borrower and tracker row with the service client, then call `assertInvitableBorrower`.
- [ ] Query `profiles.id` with the service client using `.eq("email", normalizedEmail)` first. Then call `findAuthUserByEmail(service.auth.admin, borrower.email)`, which performs the authoritative case-insensitive exact comparison. If either lookup finds a user, return 409 with "Email already has a portal account — use CSA Connect". The profile lookup is fast for normal accounts; the paginated Auth lookup is the required fallback for any historical Auth user missing a profile or using a differently-cased email.
- [ ] `service.auth.admin.inviteUserByEmail(email, { redirectTo: \`${origin}/login?redirect=/borrower\` })`. The redirect pattern comes from `src/app/api/borrower/register/route.ts:111`.
- [ ] Insert into `user_roles` the `roles.slug = 'borrower'` role with `assigned_by: user.id`.
- [ ] `update borrowers set user_id = <new> where id = <id> and user_id is null`. If no row is updated, delete the invited auth user and return 409.
- [ ] `writeAuditEvent({ moduleSlug: "auth_admin", action: "create", entityType: "borrower", entityId: id, afterData: { trigger: "legacy_borrower_invite" } })`.

### Task 5.4: `page.tsx`
- [ ] Add an "Account import" mode next to the existing mapper.
- [ ] Replace the two CSV template buttons (lines 476-479) with three XLSX downloads (`buildTemplateWorkbook` → `writeBuffer` → blob). Keep the CSV templates for the old mapper only.
- [ ] Upload the workbook → `readLegacyWorkbook` → `POST account-validate` → `POST runs` (records the run and returns `runId`). Show per-account errors, warnings, computed and declared balances, and the count ready.
- [ ] The confirm dialog text reads: "These N accounts will be created in AR Masterlist. They will not appear in LRA. Any old payment rows are stored as reference history only; they are not new LoanStar receipts." The Confirm button is enabled only when `canConfirmImport` is true.
- [ ] The result table shows a "Send portal invite" button only on an imported row whose resolved borrower has no portal user. It never shows the button for a reused borrower already linked to `user_id`.
- [ ] Manual check: at `/admin/legacy-import` → Account import, upload the Seafarer fixture workbook. Expect "12 ready, 0 errors". After Confirm, the result shows a Masterlist ID, and `/ar` lists the account.
- [ ] Run: `npm test`, `npm run lint`, `npm run build` → PASS.

## Phase 6: Regression verification and rollout

- [ ] `npm test`, then `npm run lint`, then `npm run build`.
- [ ] Smoke tests, run in the local dev server against disposable fake data only:

| Role | Variant | Action | Expected |
| --- | --- | --- | --- |
| super admin | Seafarer, SME, Individual | Import one balanced account each | 3 Masterlist rows; absent from `/lra` queue and LRA released history |
| super admin | any | Import an unbalanced account | Rejected at dry run, nothing written |
| super admin | any | Re-import the same file | All duplicates |
| super admin | existing borrower, no `user_id` | Import a second distinct loan using the same matching email/name/DOB | One new loan application and Masterlist row; borrower count unchanged; invite remains available |
| super admin | existing borrower with `user_id` | Import a second distinct loan using the same matching email/name/DOB | One new loan application and Masterlist row; borrower count unchanged; portal already shows both loans; no invite button |
| super admin | existing borrower | Import a loan using their email but conflicting name or supplied DOB | Rejected; no records written |
| AR staff | any | Open the imported account | Schedule and paid/partial rows display; no normal LoanStar payment, posting, or DCR was created by import |
| AR staff | any | Assign a collector | Saves |
| AR staff | browser devtools | `supabase.rpc('import_legacy_masterlist_account', …)` | `insufficient_privilege` |
| super admin | any | Invite the imported borrower, then log in as the borrower | Portal shows the loan, balance, and schedule through the linked borrower record; no normal payment history is expected from legacy references |

- [ ] Data checks after deploy (read-only):
  - `select count(*) from legacy_imported_accounts lia left join release_queue rq on rq.loan_application_id = lia.loan_application_id where rq.id is not null` → 0.
  - `select count(*) from legacy_imported_accounts lia join masterlist m on m.id = lia.masterlist_id where abs(m.outstanding_balance - public.recompute_outstanding_balance(m.id)) > 0.005` → 0.
  - `select count(*) from public.payments p join public.legacy_imported_accounts lia on lia.masterlist_id = p.masterlist_id where p.created_at >= lia.imported_at` → 0 for the just-imported batch; use the returned import IDs/run timestamp to avoid evaluating unrelated existing accounts.
  - The day after the cron runs, `select count(*) from penalties p join legacy_imported_accounts l on l.masterlist_id = p.masterlist_id where p.calculated_at::date = current_date and p.notes not like 'Legacy%'` should be only months after the cut-off.
  - Legacy discounts survive: `select count(*) from amortization_schedules where discount_source='legacy' and discount_amount=0` → 0.
  - Native regression: before applying the migration, snapshot `select id, penalty_amount, penalty_periods_applied, status, discount_amount from amortization_schedules` for native accounts. Run `select public.recompute_account_penalties(id) from masterlist where account_status in ('active','remedial')` in a **Supabase branch**, never on production, before and after the patch. The snapshots must be identical.

## Rollback

1. Hide the "Account import" mode in the UI with a code revert. No data change is needed.
2. If the RPC is faulty, add a forward migration that runs `REVOKE EXECUTE ON FUNCTION public.import_legacy_masterlist_account(uuid, jsonb) FROM authenticated;`. Never edit `20261002100000`.
2a. If the late-fee patch misbehaves, add a forward migration that re-creates both functions from their pre-patch live bodies. Save those bodies under `tmp/` before Task 1.2. The `opening_*` columns can stay: native rows never read them.
3. Imported accounts are ordinary Masterlist accounts and stay valid. To remove one disposable import, take a manual, reviewed delete in dependency order: `legacy_import_payment_history`, penalties, pdc_checks, assignments, amortization_schedules, legacy_imported_accounts, masterlist, release_files, computations, loan_applications, borrowers. Do it only with user approval. Do not delete ordinary `payments`, postings, or DCR rows because this import creates none.

## Commit

On `main`, per the user's 2026-09-11 rule:
```bash
git add supabase/migrations/20261002100000_legacy_masterlist_import.sql src/lib/legacy-import/account-contract.ts src/lib/legacy-import/account-validation.ts src/lib/legacy-import/workbook.ts src/lib/legacy-import/import-state.ts src/lib/legacy-import/invite-auth.ts src/lib/legacy-import/__tests__/account-contract.test.mts src/lib/legacy-import/__tests__/account-validation.test.mts src/lib/legacy-import/__tests__/workbook.test.mts src/lib/legacy-import/__tests__/import-state.test.mts src/lib/legacy-import/__tests__/invite-auth.test.mts src/lib/legacy-import/__tests__/fixtures/legacy-account.ts src/app/api/admin/legacy-import/account-validate/route.ts src/app/api/admin/legacy-import/account-import/route.ts "src/app/api/admin/legacy-import/borrowers/[id]/invite/route.ts" src/lib/legacy-import/schemas.ts src/app/admin/legacy-import/page.tsx
git commit -m "feat: atomic legacy masterlist account import with portal invite"
```

## Self-review

1. **Contradictions:** The original plan said "never recalculate money" but also let aging overwrite penalties and discounts. Resolved by recording the opening position in `opening_*` columns and patching both engines to start from it, plus the `legacy` discount source. The original also promised an aging bucket from the workbook, which the cron overwrites. That input is removed.
2. **Goal reachability:**
   - Existing native accounts are untouched.
   - New imports reach AR through the single RPC path.
   - The nightly cron no longer double-charges once `penalty_periods_applied` is set.
3. **Bypass:**
   - The RPC requires `auth.uid()` to be a super admin, and `anon` has no EXECUTE.
   - The tracker has no write policy.
   - The invite needs both gates.
   - The remaining gap (`borrowers_update` with `intake:edit` writing `user_id`) is pre-existing and flagged as out of scope.
4. **Existence:** These were each confirmed in the live DB or code:
   - `is_super_admin(p_user_id DEFAULT auth.uid())`, `recompute_outstanding_balance`, `refresh_one_masterlist_aging`, and `penalty_rate_for_segment`;
   - `requireSuperAdmin`, `requireModulePermission`, `writeAuditEvent`, `netInstallmentDue`, `halfUp`, `cellToValue`, and `trimGrid`;
   - role slug `borrower`, module `auth_admin`, and the three payment channels.

   The handoff header names the available implementation sub-skills and requires one of them for execution.
5. **Consistency:** The Files table, the phases, and the commit list all name the same 17 files, including the fixture and the isolated Auth lookup helper.
   - The test names match the runner pattern `src/lib/**/__tests__/*.mts`.
   - The migration is renamed to sort after `20261002092000`.
   - The original plan's `import-contract.ts` became `account-contract.ts`, because the old `schemas.ts` already owns the request schemas for the mapper.
6. **Duplication:** `legacy_imported_accounts` is the only legacy marker. The `import_source` columns were dropped.
7. **Database boundaries:** The plan names literal field mappings and requires the RPC to re-check money, required application schedule fields, schedule state, paid-account invariants, and the no-live-payment rule after its own inserts. Consequently a malformed direct RPC call rolls back rather than creating a ledger that only the browser validator would reject.
8. **Schedule, batch, and borrower safety:** `rolled` and `moved` are accepted wherever the live schedule permits them and are excluded from the opening-balance calculation, exactly as `recompute_outstanding_balance` does. Validation also makes a row's status agree with its net due. The shared batch validator rejects mixed segments, duplicate normalized loan numbers, invalid `paymentSchedule`/`scheduleType` combinations, and conflicting identities sharing an email, while allowing multiple distinct loans for the same matching borrower. The RPC locks and reuses that borrower without overwriting it, and never creates an Auth user.
9. **Payment history separation:** Optional old receipts are stored only in `legacy_import_payment_history`. They remain available for reference without pretending they are LoanStar DCR-posted cash, changing collection KPIs, or being posted to a schedule twice.
10. **Auth lookup:** The invite path does not rely on a nonexistent `listUsers({ email })` filter. It checks `profiles` first and then pages through the installed Supabase Admin API until `nextPage` is null.

Checklist sections not applicable: none. A (concept), B (writers/readers), C (live data), D (RLS), E (variants), F (decisions), and G (tooling) were all worked above.
