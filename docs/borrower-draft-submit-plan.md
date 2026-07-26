# Borrower Draft → Submit Flow — Implementation Plan

> **For agentic workers:** Execute phase-by-phase, in order. Each phase must leave the app green (build passes, existing flows untouched). This changes the intake workflow's *entry point only* — everything from `documents_pending` onward is untouched. Migrations apply via Supabase MCP `apply_migration` (NOT `db push` — see the two-folder CLI gotcha in project memory); mirror the file into both `supabase/migrations/` folders.

**Goal:** Borrower-created applications start as a `draft` invisible to CSA. A new **Submit application** button (gated on intake-document completeness) flips the application to `documents_pending`, which is when it first appears in the CSA intake queue. CSA-created applications (`submitted`) bypass drafts entirely — a file created in-branch is already submitted by definition.

**Why:** Today the borrower's "Start application" click instantly inserts a `documents_pending` row, so CSA's queue fills with 0/8-document files nobody has acted on. Submit-gating makes queue entry deliberate and (with the completeness gate) guarantees CSA only sees workable files.

**Client sign-off:** ⚠️ This adds a step to the client's intake process that is NOT in the two-week plan doc. Confirm with the client before publishing to production — counter-argument on record: CSA may *want* to see stalled drafts to call and assist. (Mitigation if that comes up: a separate read-only "Drafts" view for CSA later; out of scope here.)

---

## Audit summary (verified 2026-07-23, codebase + live DB)

### How status drives everything today

| Concern | Where | Behavior with a `draft` row |
|---|---|---|
| CSA queue visibility | `api/csa/applications/route.ts:37-46` — explicit `.in("status", [...])` list | ✅ Already excludes `draft` — the visibility gate needs **zero changes** |
| Status storage | `loan_applications.status` is plain `text`, no CHECK constraint; default `'documents_pending'` | ✅ `draft` storable without schema change |
| Canonical status list | `src/lib/constants.ts:124-147` `APPLICATION_STATUSES` (20 values) | ➕ add `draft` |
| Labels / badges | `src/lib/applications/status.ts` — `formatStatusLabel` title-cases unknowns; `statusBadgeVariant` falls back to `neutral` | ✅ graceful; ➕ add explicit entries anyway |
| Borrower timeline | `src/lib/borrowers/pipeline.ts:34-61` `STATUS_TO_STAGE` — unknown → index `-1`, all steps "todo" | ➕ map `draft → "documents"` |
| Borrower page focus | `src/lib/borrowers/home.ts:91-113` `borrowerAppFocus` — default → `"waiting"` (leads with terms section!) | ➕ map `draft → "documents"`; add `nextStepGuidance` copy |
| Document uploads | `api/borrower/applications/[id]/documents/route.ts` — ownership check only, **no status check**; `documents` RLS has borrower-ownership insert path with no status gate | ✅ drafts accept uploads as-is (wanted — borrower fills checklist while drafting) |
| Completeness data | `getCompletionSummary` (`checklist.ts:181-205`) → `{ total, required, complete, uploaded, incomplete, percentComplete }`, already served by `api/borrower/applications/[id]/checklist` as `summary`; consumed in the page as `docsSummary` | ✅ Submit gate = `uploaded >= required`, zero new plumbing |
| CSA leak rendering | `csa/page.tsx` + `csa/queue.ts` + `workspace.ts` — no crash on unknown status; worst case a read-only "Draft"-badged row | ✅ safe even if the filter ever regresses |

### The three highest-risk spots (found by audit, all addressed in phases below)

1. **RLS: borrower can't update a draft row.** `applications_update` (live DB, verified via `pg_policies`) gates borrower self-updates on `is_csa_editable_status(status)` = `registered, documents_pending, submitted, on_hold, for_revision`. A `draft` row is **un-updatable by its own borrower** — the Submit flip itself would be silently RLS-blocked (the recurring silent-RLS-write-block pattern from the Collection rework). **Fix: a dedicated `applications_borrower_draft_submit` policy** — NOT widening `is_csa_editable_status`, which would also grant CSA edit + endorse rights over drafts via the 6 policies that share it (`applications_update`, `applications_endorse`, `application_details_write`, `checks_recorded_write`, `computations_insert/update`).
2. **Abandoned drafts brick the borrower.** `canStartReloan` (`src/lib/borrowers/reloan.ts:15-32`) blocks a new application while ANY non-terminal app exists — a lingering draft means the borrower can never start again, and `nextApplicationKind` returns `null`. **Fix: "Start application" resumes an existing draft** instead of erroring (route returns the existing draft's id; no delete mechanics needed).
3. **Dashboards silently count drafts.** `src/lib/dashboard/aggregates.ts` (statusCounts, funnel, active query excluding only `released,closed`) and `src/lib/reports/aggregates.ts:118-133` (dynamic pipeline buckets) would include drafts in open-pipeline numbers. **Fix: exclude `draft` from dashboard funnel/open counts; reports pipeline shows it as its own labeled bucket** (visible but distinguishable). `components/dashboard/widgets/pipeline.tsx:18-20` label map needs a `draft` entry.

### Explicitly unaffected (verified)

- CSA create path (`createCsaApplication` → `submitted`) — untouched.
- CIG/Committee/LRA/AR/Collection — none touch pre-`submitted` statuses.
- Reports TAT pairs (`submitted → for_verification`) — keyed off `status_history`, drafts never enter.
- `ensureDocumentSlots` — no status check; already runs at creation.
- Existing data: live DB has 5 `documents_pending`, 3 `submitted`, 2 `loan_active`, 3 `paid_off` rows — **no backfill needed**, and Phase 5 wipes them anyway for a clean UAT start.

---

## Decisions locked into this plan (flag if wrong)

1. **Submit gate = all required intake documents uploaded** (`summary.uploaded >= summary.required` from the existing checklist API). Application Form (profile) completeness is NOT required to submit — CSA reviews/completes it with the borrower today, and blocking submit on ~60 profile fields would be hostile. Revisit after client feedback.
2. **Drafts resume, never duplicate.** One draft max per borrower; "Start application" returns the existing one.
3. **No draft deletion** in v1 — resume covers the stuck-borrower case; deletion adds RLS/audit surface for little gain.
4. **CSA cannot see drafts at all** in v1 (no read-only drafts view).

---

## File map

| Path | Change |
|---|---|
| `supabase/migrations/20260723000000_borrower_draft_submit_policy.sql` (both folders) | **done** — `applications_borrower_draft_submit` UPDATE policy: qual = own borrower AND `status='draft'`; with_check = `status IN ('draft','documents_pending')` |
| `supabase/migrations/20260723000100_borrower_draft_transition_guard.sql` (both folders) | **done** — `guard_draft_status_transition()` trigger function (`SECURITY INVOKER`) + `BEFORE UPDATE` trigger; closes the cross-policy `WITH CHECK` leak found during Phase 1 verification (see Phase 1 notes) |
| `src/lib/constants.ts` | ➕ `draft` in `APPLICATION_STATUSES` |
| `src/lib/applications/status.ts` | ➕ label "Draft — not yet submitted", badge `neutral` |
| `src/lib/borrowers/pipeline.ts` | ➕ `draft: "documents"` in `STATUS_TO_STAGE` |
| `src/lib/borrowers/home.ts` | ➕ `draft → "documents"` focus; draft-specific `nextStepGuidance` / page title/description copy |
| `src/lib/borrowers/reloan.ts` | ➕ export a `findResumableDraft` helper (pure, testable); `canStartReloan` itself unchanged |
| `src/app/api/borrower/applications/reloan/route.ts` | insert `status:"draft"`; before eligibility check, return existing own `draft` app if present (resume) |
| `src/app/api/borrower/applications/[id]/submit/route.ts` | **new** POST — ownership + `status==='draft'` + completeness check (`getCompletionSummary`) → update to `documents_pending` + `status_history` append + audit event. **Verify the update wrote** (select-after-update or `.select()` on update) — silent-RLS-block pattern |
| `src/app/borrower/applications/[id]/page.tsx` | draft banner ("Not yet visible to Loan Star — submit when your documents are ready"), Submit button (disabled + reason until docs complete), `ConfirmDialog`, reload on success |
| `src/app/borrower/page.tsx` | "Start application" button label/behavior aware of resumable draft ("Continue your draft") |
| `src/lib/dashboard/aggregates.ts` | exclude `draft` from funnel/open-pipeline counts |
| `src/components/dashboard/widgets/pipeline.tsx` | ➕ `draft` label |
| **Do not modify** | `is_csa_editable_status` (SQL or TS mirror), CSA queue filter, `createCsaApplication`, any CIG/Committee/LRA/AR/Collection code, existing RLS policies |

---

## Phase 0 — Vocabulary + rendering (no behavior change)

- [x] Add `draft` to `APPLICATION_STATUSES` (`src/lib/constants.ts`), `STATUS_LABELS` ("Draft — Not Yet Submitted") + `STATUS_BADGE_VARIANTS` (`neutral`) in `applications/status.ts`, `STATUS_TO_STAGE` (`draft → "documents"`) + `stageNote` in `pipeline.ts`, `borrowerAppFocus` (`draft → "documents"`) + `nextActionLabel` ("Continue your draft") + `nextStepGuidance` draft copy in `home.ts`, pipeline widget label map ("Draft").
- [x] Deliberate non-change: `PROGRESS_STATUSES` in `home.ts` was NOT extended — adding `draft` there would change the progress-percent denominator for every existing status (a behavior change). Draft resolves via the `APPLICATION_STATUSES` fallback (~5%), which is fine.
- [x] **Verify:** `tsc --noEmit` — zero new errors (the `Record<ApplicationStatus, …>` types force-verified both status maps are complete); `npm test` — 300/300 pass; eslint clean on all five files. No row has `draft` yet, so zero user-facing change.

**Phase 0 completed 2026-07-23.**

## Phase 1 — RLS migration

- [x] Migration `20260723000000_borrower_draft_submit_policy.sql` (both folders, applied via Supabase MCP `apply_migration`): policy `applications_borrower_draft_submit` on `loan_applications` FOR UPDATE — `USING` own-borrower AND `status='draft'`; `WITH CHECK` own-borrower AND `status IN ('draft','documents_pending')`.

- [x] **⚠️ Finding during verification, not anticipated by the original audit:** live impersonation testing (via `SET LOCAL ROLE authenticated` + `request.jwt.claims`, wrapped in rolled-back transactions — see below) showed the borrower could flip their own draft **directly to `approved` or `denied`**, bypassing the intended `{draft, documents_pending}` cap. Root cause: Postgres combines every UPDATE policy's `WITH CHECK` on a table with OR **globally**, not paired with whichever policy's `USING` granted access to the old row. Several pre-existing policies (e.g. `applications_committee_action`) have `WITH CHECK` clauses that check only the new status value with no accompanying permission/ownership condition — safe *only* as long as no policy's `USING` ever let a borrower reach the row at all. My new policy's `USING` was the first to open that door for `draft` rows, which meant the OR-combined `WITH CHECK` from every other policy became reachable through it. This is a latent, codebase-wide RLS pattern risk (same family as the recurring silent-RLS-block pattern already noted from the Collection rework) that this change activated for a new row class, not a bug in the migration's SQL syntax.

- [x] **Fix** — migration `20260723000100_borrower_draft_transition_guard.sql`: a `BEFORE UPDATE` trigger `guard_draft_status_transition()` that reads `OLD`/`NEW` directly and blocks any `draft → X` transition where `X NOT IN ('draft','documents_pending')`, unless `is_super_admin()`. Triggers see both row versions directly, so this closes the gap unconditionally regardless of which policy's `WITH CHECK` fired — mirrors the existing `guard_template_version_immutability` pattern already used in this codebase for the same class of problem.
- [x] **Self-correction on the fix itself:** first cut of the trigger function was mistakenly declared `SECURITY DEFINER`, which the security advisor immediately flagged as newly anon/authenticated-RPC-callable (2 new findings). Checked convention — every other guard trigger in this codebase (`prevent_signature_mutation`, `prevent_finalized_generated_doc_mutation`, `prevent_audit_mutation`, `guard_template_version_immutability`) is `SECURITY INVOKER` (`prosecdef=false`), and none of them needed elevation since they either read plain columns or call an already-self-elevating helper (`is_super_admin()`, itself `SECURITY DEFINER`). Reissued as `SECURITY INVOKER` via `CREATE OR REPLACE`; migration file on disk updated to match so a fresh environment gets the corrected version directly, not the flawed intermediate one.

- [x] **Verify (live impersonation, not just qual/check text inspection):**
  - Owner flips own draft → `documents_pending`: **allowed** (1 row updated).
  - Owner flips own draft → `submitted` directly: **blocked** (trigger raises `check_violation`).
  - Owner flips own draft → `approved` directly: **blocked** (trigger raises `check_violation` — this is the exact case that leaked before the trigger existed).
  - A *different* borrower touching another borrower's draft: **blocked** (0 rows — RLS ownership check).
  - Legitimate submit re-tested after the `SECURITY INVOKER` fix: still **allowed**.
  - `get_advisors` (security): 37 findings before this phase, 37 after — zero net new. (Briefly 39 during the `SECURITY DEFINER` misstep, corrected before completing the phase.)
  - All test rows created inside rolled-back transactions only; confirmed 0 leftover rows in `loan_applications` after testing.

**Phase 1 completed 2026-07-23.**

## Phase 2 — API

- [x] `src/lib/borrowers/reloan.ts`: added `findResumableDraft()` — pure, generic-typed helper, returns the first application with `status:"draft"` or `null`.
- [x] `reloan/route.ts`: checks `findResumableDraft(existingApps)` first (before `canStartReloan`, so a draft never trips the "open application" block) → returns it with `resumed: true` (200); otherwise inserts with `status:"draft"` (status_history note "Draft created" / "Reloan draft created"), unchanged from there (`ensureDocumentSlots`, audit event, response now also carries `resumed: false`).
- [x] New `src/app/api/borrower/applications/[id]/submit/route.ts`: `requireModulePermission("borrower_portal","edit")` → `assertOwnApplication` (same ownership-check pattern duplicated across 5 sibling borrower routes — `checklist`, `computation`, `counter`, `documents`, `[id]`) → 400 if not `draft` → completeness gate via the *same* `getStageChecklist`+`getCompletionSummary` pair the borrower's own checklist UI already uses (so the numbers always match what they see) → `appendStatusHistory(..., "documents_pending", ...)` (reused, not reimplemented — already carries the select-after-update "0 rows = throw" guard the plan called for) → audit event.
- [x] **Verify:**
  - `tsc --noEmit` — zero new errors.
  - `npm test` — 305/305 pass (300 baseline + 5 new `findResumableDraft`/lingering-draft tests in `reloan.test.mts`).
  - `eslint` — zero findings on all 4 changed/new files.
  - Route placement confirmed alongside the 8 other `[id]/*` borrower sub-resource routes.
  - Careful manual code review line-by-line (documented below) — no HTTP/browser-level test performed.

**Known gap, same as Phase 1's borrower-side limitation:** no HTTP-level or browser test was possible — still no borrower login credentials available in this environment. Unlike Phase 1 (where I could impersonate a borrower directly in SQL to prove the RLS/trigger interaction), Phase 2 is ordinary application code with no separate "impersonate via SQL" equivalent — its correctness rests on (a) reusing already-verified Phase 1 primitives for every actual database write, (b) reusing already-existing helpers (`appendStatusHistory`, `getCompletionSummary`, `getStageChecklist`, `ensureDocumentSlots`) rather than reimplementing their logic, and (c) matching the ownership-check pattern already proven correct in 5 sibling routes. Recommend a real click-through (start → upload partial docs → confirm Submit stays disabled → upload the rest → confirm Submit works → confirm CSA queue picks it up) once a borrower test login is available — this is also exactly what Phase 3's UI verification needs anyway, so it can happen together.

**Phase 2 completed 2026-07-23.**

## Phase 3 — Borrower UI

- [x] `src/app/borrower/applications/[id]/page.tsx`: added `isDraft`/`canSubmit` derived state, a "Ready to submit?" CTA block (rendered only when `isDraft`) showing live `docsSummary.uploaded`/`required` counts and a Submit button disabled until `uploaded >= required`, a `ConfirmDialog` wired to the new `[id]/submit` endpoint, and `handleSubmitApplication` (closes the dialog either way, surfaces errors via the page's existing top-of-page `error` state — same pattern as `cig/denials`' `handleInformConfirm`, not a new convention). On success, silently reloads — the page then just renders today's normal `documents_pending` view, no special-casing needed.
- [x] **Dashboard (`src/app/borrower/page.tsx`) — audited, needs no change.** A `draft` application is neither in `RELOAN_TERMINAL_STATUSES` nor `LOAN_STATUSES`, so it already satisfies the existing `pipelineApp` condition and routes through the "Application progress" card (not the empty-state "Start application" button, which only renders when there is *no* open application at all). That card's CTA already reads `nextActionLabel(pipelineApp.status)` — which Phase 0 already made return "Continue your draft" for `draft`. Same for the status badge (neutral, Phase 0), the timeline (maps to the "Documents" stage, Phase 0), and the KPI tile. Verified this by tracing the actual branch logic, not by assumption — this is Phase 0's groundwork paying off directly, not a gap.
- [x] **Verify:**
  - `tsc --noEmit` — zero new errors.
  - `npm test` — 305/305 pass (unchanged from Phase 2; no lib logic touched this phase).
  - `eslint` — only the same pre-existing `void load()` finding, at the untouched top-level effect (line 199) — not introduced by this phase's edits.
  - `ConfirmDialog`'s `message` prop confirmed to accept `ReactNode` (a plain string, as used).
  - Manual trace through every `focus`/`orderedSections`/`intakeChecklist` branch for `draft` — confirms the intake checklist and Application Form modal render first (via Phase 0's `borrowerAppFocus` mapping), unaffected by the new Submit block.

**Known gap, unchanged from Phases 1–2:** no borrower login credentials available in this environment, so no live browser click-through was possible (start → see draft banner + disabled Submit → upload docs → Submit enables → confirm → dialog closes → status flips → CSA queue picks it up). All three phases' UI/API work rests on code review + typecheck + the live-tested Phase 1 database layer underneath it. **This is the single most important remaining verification before shipping** — recommend doing it as soon as a borrower test login is available, covering all of Phases 1–3 in one pass rather than three separate ones.

**Phase 3 completed 2026-07-23.**

## Phase 4 — Aggregates + regression

- [x] **Audited every `loan_applications` query in both aggregate files (7 sites), not just the two the original audit flagged** — confirmed which needed a fix and which didn't:
  - `src/lib/dashboard/aggregates.ts` `buildIntakeWidget` — was completely unfiltered (`select("status, created_at")`, no `.eq`/`.neq` at all) → feeds the "Intake" module widget (CSA's own dashboard). **Fixed**: added `.neq("status", "draft")`.
  - `src/lib/dashboard/aggregates.ts` `buildLeadsWidget`'s funnel query — same, completely unfiltered → feeds the Leads/Agent module widget's conversion funnel, which drafts have no relationship to (they're never linked to a `lead`). **Fixed**: added `.neq("status", "draft")`.
  - `buildVerificationWidget` / `buildCommitteeWidget` / `buildReleaseWidget` — each already filters to specific non-draft statuses (`for_verification`, `for_approval`, `[released, loan_active, closed, paid_off]`) — draft can never appear. **No change needed.**
  - `src/lib/reports/aggregates.ts` `buildPipelineReport` — unfiltered by design, and correctly so: this is the management-facing report (`/reports`), already using `formatStatusLabel` (Phase 0's "Draft — Not Yet Submitted") for display. Per the plan's own decision, drafts belong here as a visible, labeled bucket — this is what lets management see how many borrowers start but don't finish. **No change — matches the plan's design intent exactly.**
  - `src/lib/reports/aggregates.ts`'s TAT history query — pulls `status_history` for turnaround-time calculation. A draft's history only ever contains `{status:"draft"}` entries until submitted, and none of `TAT_PAIRS` starts from `"draft"`, so draft rows contribute nothing and need no filter. **No change needed** — verified by reading `TAT_PAIRS`, not assumed.
- [x] **Full regression:**
  - `tsc --noEmit` — zero new errors vs. baseline.
  - `npx eslint` on both changed files — clean, zero findings.
  - `npm test` — 305/305 pass (unchanged from Phase 2/3 — no lib logic behavior changed, only query filters).
  - **Full-repo `npm run lint`** — exactly 90 problems (66 errors, 24 warnings), byte-for-byte matching the Phase 0 baseline. Zero net-new across all four phases combined (constants, status labels, pipeline stages, home guidance, dashboard widget labels, two migrations, reloan helper, two new API routes, the borrower application page, and now the aggregates file).
  - `createCsaApplication` (CSA-created applications still insert `status:"submitted"` directly, bypassing draft) — grepped and confirmed byte-identical to before Phase 1; never touched by any phase.
  - `canStartReloan` / `RELOAN_TERMINAL_STATUSES` — untouched; only `findResumableDraft` was added alongside it in Phase 2.

**Phase 4 completed 2026-07-23.**

## Phase 5 — Loan-application data reset (DESTRUCTIVE — gated)

**Goal:** clear every existing loan application (and all per-application records) for a clean UAT start, keeping borrowers, user accounts, roles, config, loan types, checklists, document templates, and the audit trail intact.

**⚠️ Execution gate:** this phase is destructive and irreversible. Do NOT run it as a side effect of the other phases — it requires explicit user confirmation at execution time, runs in a single transaction via Supabase MCP `execute_sql`, and must be preceded by the row-count snapshot below.

**Why a naive `DELETE FROM loan_applications` fails** (verified against live FK rules via `information_schema.referential_constraints`):

- 19 child tables CASCADE off `loan_applications` (documents, computations, verifications, masterlist, payments via masterlist, release_files and its subtree, etc.) — those are fine.
- **`signatures.document_id → documents` is RESTRICT** and signatures is not in any cascade chain — 99 signature rows will block the documents cascade. Must be deleted explicitly first.
- **`postings` RESTRICTs three ways** (→ payments, → masterlist, → dcr) — 23 posting rows block the masterlist/payments cascade. Delete first.
- **`dcr_items.payment_id → payments` is RESTRICT** — delete before payments cascade (also cascades from `dcr`, but the payment-side RESTRICT fires first).
- **Guard triggers**: `prevent_signature_mutation` (signatures) and `prevent_finalized_generated_doc_mutation` (generated_documents) are BEFORE-triggers that raise on mutation — they will abort the transaction mid-cascade. They must be `ALTER TABLE … DISABLE TRIGGER`'d inside the transaction and re-enabled before COMMIT.
- `leads.application_id` and `loan_applications.parent_application_id` are SET NULL — leads (agent referrals) survive with the link cleared; acceptable.
- **CORRECTED at execution time** — the original claim that NO-ACTION references "resolve within the single statement" was wrong and caused a first-attempt failure (rolled back cleanly, no data lost). Postgres does not guarantee that a same-statement CASCADE branch (e.g. `release_files → release_events`) completes before a sibling CASCADE branch (e.g. `loan_applications → documents`) triggers a NO-ACTION check on a table the first branch was about to clear (e.g. `release_events.signed_voucher_document_id → documents`). Fix: explicitly pre-delete every table that both (a) sits inside the cascade closure and (b) holds a NO-ACTION/RESTRICT FK into another closure table, before the main cascade runs. Verified via a full closure-graph query (`information_schema`/`pg_constraint`, recursive CTE) rather than guessing table-by-table. The complete risk set turned out to be: `release_events → documents`, `release_events → release_files`, `denial_notices → committee_actions`, `negotiations → computations`, `release_files → computations`, `release_queue → computations`. (All other NO-ACTION/RESTRICT FKs from closure tables point at `auth.users` or kept lookup tables like `document_types`/`check_types`, which are never deleted, so they're inert.)
- **Guard-trigger names were also wrong in the original draft** — the real trigger names (confirmed via `pg_trigger`) are `signatures_no_update` and `generated_documents_immutable_when_finalized`, not `prevent_signature_mutation`/`prevent_finalized_generated_doc_mutation`. Moot in practice since the transaction uses `DISABLE TRIGGER USER` (disables all user triggers on the table, not by name), but the plan's specific names were never actually valid.

**Steps:**

- [x] **Snapshot**: taken before execution; matched the counts below.
- [x] **Confirm with user** (user replied "run it" after reviewing the snapshot).
- [x] **Transaction** (single `execute_sql` call, corrected from the original draft after a first attempt failed on `release_events_signed_voucher_document_id_fkey` and rolled back with zero data loss):
  ```sql
  BEGIN;
  ALTER TABLE signatures DISABLE TRIGGER USER;          -- guard triggers only; FK triggers are system-level and stay on
  ALTER TABLE generated_documents DISABLE TRIGGER USER;
  DELETE FROM postings;
  DELETE FROM dcr_items;
  DELETE FROM dcr;                                       -- collector day-sheets; test data, headers now empty
  DELETE FROM signatures;
  DELETE FROM release_events;                            -- NO-ACTION into documents + release_files; must precede both
  DELETE FROM denial_notices;                            -- NO-ACTION into committee_actions
  DELETE FROM negotiations;                              -- NO-ACTION into computations
  DELETE FROM release_queue;                             -- NO-ACTION into computations
  DELETE FROM release_files;                             -- NO-ACTION into computations; cascades ar_queue/pdc_checks/generated_documents/briefings
  DELETE FROM loan_applications;                         -- cascades the remaining subtree cleanly now
  ALTER TABLE signatures ENABLE TRIGGER USER;
  ALTER TABLE generated_documents ENABLE TRIGGER USER;
  COMMIT;
  ```
- [x] **Verify**: ran 2026-07-23. Every wiped table reads 0 (`loan_applications`, `documents`, `generated_documents`, `rendered_documents`, `signatures`, `postings`, `dcr`, `dcr_items`, `computations`, `masterlist`, `payments`, `release_files`, `release_events`, `release_queue`, `ar_queue`, `pdc_checks`, `checks_recorded`, `negotiations`, `committee_actions`, `committee_assessments`, `committee_votes`, `denial_notices`, `revisit_notices`, `verifications`, `assignments`, `briefings`, `callbacks`, `collector_contacts`, `penalties`, `amortization_schedules`, `application_details`, `file_holds`, `remedial_turnovers`, `reminder_log`). Kept tables unchanged: `borrowers` 11, `profiles` 23, `user_roles` 23, `roles` 10, `modules` 15, `loan_types` 33, `document_templates` 14, `document_template_versions` 15, `stage_checklists` 31, `document_types` 33, `config_settings` 9, `audit_events` 97, `portfolios` 2. `leads` intact at 5 rows, all with `application_id IS NULL`. Guard triggers confirmed re-enabled (`tgenabled = 'O'`) on both `signatures` and `generated_documents`.
- [ ] **Storage note**: deleted `documents`/`generated_documents`/`rendered_documents` rows leave orphaned objects in the `loan-documents` storage bucket. Harmless (private bucket, no dangling DB refs) — not purged; optional cleanup, ask the user before acting.
- [ ] **Smoke test after reset**: CSA queue loads empty without errors; borrower dashboard shows "Start application"; dashboards/report pages render with zero-state (no divide-by-zero or null crashes on empty aggregates). Pending — see next step.

**Phase 5 executed 2026-07-23.** Data reset complete; smoke test pending.
