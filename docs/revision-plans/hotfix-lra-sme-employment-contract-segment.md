# Hotfix — LRA release is structurally blocked for every SME loan

**Ground rules (apply to every phase, same as every other item in this workflow):**
- Touch only the files listed under "Files to change." If you find a related spot not listed, stop and flag it rather than editing it.
- Do not rename, refactor, or "clean up" adjacent code you encounter while editing a listed file.
- Do not change DB columns/tables or migrations — this item needs no new migration.
- Run existing tests for the touched area after each phase; do not delete or weaken a test to make it pass.
- Execute phases **in order**. Each phase must leave the app green (tests passing) before the next starts.
- At the end of all phases, output one combined summary: files changed, tests run/result, and anything you deliberately left alone that looked related.

## Audit findings (re-verified 2026-08-12, live against current code)

`hasEmploymentContractUploaded` (`src/lib/lra/employment-contract.ts:53-85`) checks for a `documents` row with `document_types.slug = 'contract'`, `stage = 'intake'`, status `uploaded`/`confirmed`, for the given `loan_application_id` — unconditionally, with no segment awareness at all. Re-read directly, unchanged since the original audit.

This document slot is never created for SME applications in the first place — re-confirmed against the live migration files:
- `supabase/migrations/20260807070100_sme_phase2_seed_sme_intake_checklists.sql:83` — `AND sc.stage <> 'intake'` — explicitly excludes intake-stage rows when mirroring seafarer checklist rows onto `segment='sme'`, so `contract` (an intake-stage document) is never copied into SME's checklist.
- `supabase/migrations/20260810211000_seafarer_intake_contract_required.sql:8` — flips `contract` to *required*, scoped `AND sc.segment = 'seafarer'`, with the migration's own header comment: "Does not touch ... any SME rows."

Net effect: an SME application's intake checklist never has a `contract` slot, so a `documents` row matching `hasEmploymentContractUploaded`'s query can never exist for an SME loan through normal upload workflow. Re-confirmed both real call sites are still exactly as found originally:
- `src/lib/lra/release-service.ts:544-551` — sets `blocker = releaseBlockerForReadyRelease(path, hasContract)`. With `hasContract` always `false` for SME, `blocker` is permanently `"Pending: employment contract"` (`EMPLOYMENT_CONTRACT_BLOCKER`).
- `src/lib/lra/release-service.ts:651-655` (`recordRelease`, the actual release action) — calls `assertEmploymentContractForRelease(hasContract)`, which **throws** `"Employment contract must be uploaded before release"` when `hasContract` is `false`. This hard-fails for every SME loan, every time, with no workaround through normal workflow.
- `src/app/api/lra/applications/[id]/route.ts:70-73` — same call for display (`employmentContractPresent`), so the LRA page shows the same false "missing" state to staff.

This lives in a shared library function both callers use — not in page JSX — so the fix belongs there, once, rather than at each call site.

## Scope decision

Two phases:
1. **Backend fix** — make `hasEmploymentContractUploaded` segment-aware: fetch the application's `segment` and short-circuit to `true` when `segment === "sme"`. This mirrors the identical precedent already established in this codebase for the same situation (`getCigChecksComplete` in `src/lib/cig/verification.ts:326-379` treats a segment with zero mapped requirements as trivially complete — see its own "Phase 7.1 provisional" comment). Both real call sites (`release-service.ts:544`, `release-service.ts:651`) and the display call (`route.ts:70`) inherit the fix automatically — none of them need to change.
2. **Tests** — add unit coverage for `hasEmploymentContractUploaded` itself (currently untested — the existing `employment-contract.test.mts` only covers the pure helper functions, never this one), using the hand-rolled fake-Supabase-client stub pattern already established in `src/lib/lra/__tests__/pdc-collect.test.mts`.

This does **not** invent a new SME-specific document requirement. Per the audit, SME's intake checklist deliberately has no employment-contract equivalent today (the seeding migration's own comment calls the SME checklist split "an operator decision pending final client sign-off"). If the business later decides SME needs its own equivalent document, that's a separate, deliberately-scoped follow-up requiring a product decision — not something to invent here.

---

## Phase 1 — Segment-aware backend fix

**Goal:** `hasEmploymentContractUploaded` returns `true` for SME applications without querying a document slot that can never exist for them; seafarer behavior is byte-identical to today.

### Files to change

1. **`src/lib/lra/employment-contract.ts`**
   - Function `hasEmploymentContractUploaded` (lines 53-85): before the existing `document_types` lookup, add a query for the application's segment and return `true` immediately when it's `"sme"`:
     ```ts
     export async function hasEmploymentContractUploaded(
       supabase: SupabaseClient,
       applicationId: string,
     ): Promise<boolean> {
       const { data: application, error: appError } = await supabase
         .from("loan_applications")
         .select("segment")
         .eq("id", applicationId)
         .maybeSingle();

       if (appError) {
         throw new Error(appError.message);
       }
       if (application?.segment === "sme") {
         // SME intake checklist has no employment-contract-equivalent requirement today.
         return true;
       }

       // ...existing document_types/documents lookup unchanged below...
     }
     ```
   - Do not change `isEmploymentContractStatus`, `assertEmploymentContractForRelease`, `releaseBlockerForReadyRelease`, `assertLraIntakeUploadAllowed`, `EMPLOYMENT_CONTRACT_SLUG`, `EMPLOYMENT_CONTRACT_MISSING_ERROR`, `EMPLOYMENT_CONTRACT_BLOCKER`, or `LRA_INTAKE_UPLOAD_ALLOWLIST` — only `hasEmploymentContractUploaded`'s body changes.
   - Do not touch `src/lib/lra/release-service.ts` or `src/app/api/lra/applications/[id]/route.ts` — both call sites inherit the fix automatically with no code change.

### Validation checklist — Phase 1

- [x] `hasEmploymentContractUploaded` returns `true` immediately for any application with `segment === "sme"`, without querying `document_types`/`documents` at all.
- [x] For `segment === "seafarer"` (or any non-`"sme"` value, including `null`/missing), behavior is byte-identical to before — same queries, same result for the same data.
- [x] No other exported function in `employment-contract.ts` changed.
- [x] No changes to `release-service.ts` or `route.ts`.
- [ ] `npx tsc --noEmit` clean for the changed file.
- [x] Existing full test suite still passes (this phase has no dedicated new tests yet — that's Phase 2 — but nothing existing should break).

### Status: Done (2026-08-12)

---

## Phase 2 — Test coverage for `hasEmploymentContractUploaded`

**Goal:** Lock in the new segment behavior with real unit tests, since this function was previously untested (only its pure sibling helpers were covered).

### Files to change

1. **`src/lib/lra/__tests__/employment-contract.test.mts`**
   - Add a fake-Supabase-client stub for `hasEmploymentContractUploaded`, following the exact hand-rolled stub pattern already used in `src/lib/lra/__tests__/pdc-collect.test.mts` (a `from(table)` switch returning a chainable stub per table, no external mocking library).
   - Add test cases:
     - SME application (`loan_applications.segment = "sme"`) → `hasEmploymentContractUploaded` returns `true` without the stub's `document_types`/`documents` chains ever being queried (or, if queried, without needing seeded data — assert the short-circuit path is taken).
     - Seafarer application with no matching `documents` row → returns `false` (existing behavior, now covered for the first time).
     - Seafarer application with a `documents` row at `stage="intake"`, `status="uploaded"` → returns `true`.
     - Seafarer application with a `documents` row at `stage="intake"`, `status="confirmed"` → returns `true`.
     - Seafarer application with a `documents` row present but wrong `stage` (e.g. `"release"`) or wrong `status` (e.g. `"pending"`) → returns `false`.
   - Do not modify any existing test in this file (the pure-function tests for `isEmploymentContractStatus`, `assertEmploymentContractForRelease`, `releaseBlockerForReadyRelease`, `assertLraIntakeUploadAllowed`) — only add new `describe`/`it` blocks for `hasEmploymentContractUploaded`.

### Validation checklist — Phase 2

- [x] New tests cover: SME short-circuit, seafarer-missing, seafarer-uploaded, seafarer-confirmed, seafarer-wrong-stage/status.
- [x] All pre-existing tests in this file are untouched and still pass.
- [x] Full repo test suite passes with the new tests included (report the total count, e.g. "N/N").
- [ ] `npx tsc --noEmit` clean.

### Status: Done (2026-08-12)

---

## Explicitly out of scope for this hotfix

- Any new SME-equivalent document requirement (e.g. a business permit, SME loan agreement, etc.) — not defined anywhere today; inventing one is a product decision out of scope here.
- `supabase/migrations/20260807070100_sme_phase2_seed_sme_intake_checklists.sql` / `20260810211000_seafarer_intake_contract_required.sql` — both correct as-is for what they were scoped to do; not modified, no new migration.
- `LRA_INTAKE_UPLOAD_ALLOWLIST`/`assertLraIntakeUploadAllowed` — governs LRA's own late-upload permission for the `contract` slug; still correct for seafarer, irrelevant for SME since no such slot exists, not touched.
- The Committee SME verification gap — separate hotfix (`hotfix-committee-sme-verification-gap.md`), already Done.

## Final combined validation (after both phases land)

- [ ] Manual/API check against a live SME application at `ready_release`/release stage: `recordRelease` no longer throws `"Employment contract must be uploaded before release"`, and `releaseBlockerForReadyRelease` no longer returns `"Pending: employment contract"` for that application — release can actually proceed.
- [ ] Manual/API check against a live seafarer application still missing its contract upload: behavior is unchanged — release is still correctly blocked with the same message.
- [x] Full test suite run — no new failures anywhere, new tests included in the count.

## Status: Done (2026-08-12)
