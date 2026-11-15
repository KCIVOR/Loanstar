# Plan — Give LRA access to the calculator (recompute a loan at the release stage)

**Source:** client request relayed by the user on 2026-11-16, split out of concern #1 (`docs/revision-plans/fix-manual-release-date-in-calculator-plan.md`).
**Mode:** Bolt-style single-issue change. Plan only; nothing in this file has been implemented.

## Decisions (confirmed by the user, 2026-11-16)

1. LRA can use **the whole calculator**: release date, amount, terms, loan type, deductions and discounts.
2. LRA can do so **any time until the loan is marked released**.
3. **No signing step.** The new computation is **auto-approved under LRA's name**.
4. **Every change is logged**: who, when, old and new values, and a **required reason**.
5. If PDC checks or release documents already exist, the system **warns first, then clears them and sends the file back** to that step so they are redone.

## Rules (apply to every phase)

- Build only this one change. Do not broad-refactor.
- Verify before changing. Re-read each file below at the stated lines before editing; if the code differs from this plan, stop and report.
- Touch only the files listed under "Files to change." If a related spot is not listed, stop and flag it. Do not edit it.
- Use the current schema only. Do not guess table names, columns or policy names. Every name below was read from the repo or the staging database on 2026-11-16; re-confirm in Phase 1.
- **No migration is planned.** If Phase 1 shows one is needed, stop and report before writing SQL. Any database change goes to **staging (`ddsvqjaknuniekygpbdr`) only**.
- Preserve existing behavior outside this change:
  - CSA and Committee calculators work exactly as today.
  - LRA cannot change anything once the release file is `released` or `closed`.
  - Other roles gain nothing. The new route requires the LRA permission.
  - Removing a single document by hand keeps its current rules.
- Do not rename, clean up, or reformat adjacent code.
- Run the existing tests after each phase. Never delete or weaken a test to make it pass.
- Execute phases in order. Each phase must leave the app green before the next starts.
- Be concise. Reuse the existing calculator panel and the existing recompute path.
- At the end, output one summary: files changed, tests run and result, and what was verified in the browser.

## We will build only one exact change

**Request:** LRA needs the calculator, so the release date and loan figures can be corrected at the release stage.

**Who is affected:** LRA staff. Committee and CSA are affected indirectly, because LRA can now change figures they approved or entered.

**What I see (verified):**
- LRA's role has only the `release_lra` module (view, create, edit, execute). It has no `computation` permission.
- The database lets `release_lra` **read** computations but not create or change them. `computations_insert` and `computations_update` allow only `computation` (CSA-editable statuses) and `committee` (`for_approval`, `negotiating_terms`).
- The LRA page (`src/app/lra/applications/[id]/page.tsx`) shows computation figures read-only. The calculator panel (`src/components/csa/ComputationPanel.tsx`) has two modes, `csa` and `committee`, each with its own compute URL, loan-type URL and active-loans URL.
- The release file pins its computation: `release_files.computation_id` and `release_queue.computation_id`. A recompute creates a **new** computation row and switches the old one off, so the pins must follow.
- LRA can already write `release_files`, `pdc_checks` and `briefings`, and delete non-finalized `generated_documents`. Documents are only finalized at close, after release.
- Today a generated document cannot be removed once the briefing is acknowledged (`canModifyGeneratedDoc`). Decision 2 and 5 mean LRA's recompute must be allowed to clear past that point.
- The release step does not check the computation's signature.

**Expected:** On the LRA application page, while the file is not yet released, LRA sees the calculator, changes any value, enters a reason, confirms a warning that lists what will be cleared, and gets a new active computation. PDC checks and generated documents are cleared, the file returns to the right step, and the change is in the audit log.

**Where it happens:** `/lra/applications/[id]`, a new `POST /api/lra/applications/[id]/computation`, and the release service.

## Scope

Only LRA's recompute at the release stage, its clearing of dependent data, and its audit record. Nothing else.

## Files to change

1. `src/app/api/lra/applications/[id]/computation/route.ts` (new): the LRA compute endpoint. Requires `release_lra:edit`.
2. `src/app/api/lra/loan-types/route.ts` (new): loan types for the panel in LRA mode, mirroring `src/app/api/committee/loan-types`.
3. `src/lib/lra/release-service.ts`: one new function, `recomputeAtRelease`, that runs the recompute, repoints the pins, clears PDC checks and generated documents, resets the briefing and the file status, and returns what it cleared.
4. `src/lib/negotiation/service.ts`: export a thin wrapper around the existing `persistOverrideComputation` for LRA, so the calculator logic is not duplicated.
5. `src/components/csa/ComputationPanel.tsx`: add mode `"lra"` (its three URLs), a required "Reason for change" field, and a confirm dialog that shows what will be cleared. CSA and Committee modes must render exactly as before.
6. `src/app/lra/applications/[id]/page.tsx`: render the panel in LRA mode while the file is not `released` or `closed`, and reload after a recompute.
7. `src/app/api/lra/applications/[id]/route.ts`: return what the page needs for the panel and the warning (counts of PDC checks and generated documents, briefing state), if not already returned.
8. Tests next to the existing LRA tests (`src/lib/lra/__tests__/`).

Not changed: the CSA and Committee compute routes, the first-payment formulas, AR code, reports, RLS and the schema.

## Current data source used

- Computation: `computations` (active row per application, `is_active`), written by `persistComputation` (`src/lib/csa/computation.ts`) through `persistOverrideComputation` (`src/lib/negotiation/service.ts:383`), which already fills unchanged values from the active computation.
- Release file: `release_files` (`status`, `computation_id`, `release_paths`), `release_queue.computation_id`.
- Dependent data: `pdc_checks` (by `release_file_id`), `generated_documents` (by `release_file_id`, plus storage objects), `briefings` (by `release_file_id`).
- Audit: `writeAuditEvent` (`src/lib/audit/writer.ts`).
- Release file statuses: `awaiting_path`, `pdc_encoding`, `ready_generate`, `awaiting_signatures`, `awaiting_briefing`, `ready_release`, `released`, `closed`.

## Root cause

The calculator was built for CSA and Committee only. LRA was given read access to the result, never a way to change it.

## Minimum design

1. **Permission and stage:** the new route checks `release_lra:edit` and that a release file exists with a status before `released`.
2. **Recompute:** reuse the existing recompute path. Because the database policies do not let LRA insert computations, the insert runs with the service role **after** the route has checked permission and stage. This follows the existing pattern used for LRA queueing and for switching off old computations, and avoids a migration.
3. **Auto-approval:** stamp the new computation as confirmed by the LRA user (Phase 1 confirms which columns the in-branch signing uses and reuses them).
4. **Repoint:** set `release_files.computation_id` and `release_queue.computation_id` to the new computation.
5. **Clear and redo:** delete the file's PDC checks and generated documents (and their storage objects), reset the briefing acknowledgement, and set the file status to `pdc_encoding` (with-PDC path), `ready_generate` (no PDC), or leave `awaiting_path` as is. Sync the application blocker and status the same way the existing steps do.
6. **Log:** one audit event with the reason, the old and new values of every changed field, and the counts of what was cleared.

## Phases

### Phase 1 — Verify (read only)

- Re-read the files above at the lines given.
- Confirm on staging: the `computations`, `release_queue`, `generated_documents`, `pdc_checks` and `briefings` policies and columns named here.
- Confirm which columns in-branch signing writes (`witnessSignComputation`), and whether anything after the LRA stage (AR receive, `initializeArAccount`, document templates) reads the computation's signature. Decide the auto-approval stamp from that.
- Confirm what else points at a computation id at this stage (`negotiations.active_computation_id`, masterlist) and whether it must follow.
- Confirm how the briefing is created and acknowledged, and the cleanest way to reset it.
- Confirm `persistOverrideComputation` accepts every field the panel sends for a full recompute (loan type, input mode, deductions, discounts, schedule, release date).
- Confirm how the Committee loan-types and active-loans endpoints work, to mirror them.
- If anything differs from this plan, or a migration looks necessary, stop and report.

### Phase 2 — Server

- Add the wrapper in `negotiation/service.ts` and `recomputeAtRelease` in `release-service.ts`, in the order above: guard, recompute, stamp, repoint, clear, reset status, log.
- Order the writes so a failure cannot leave documents that show old figures: recompute first, then clear, then repoint and reset. If a step fails after the recompute, return an error that says what was and was not done.
- Add the two new routes. Validate the body with the same rules as the Committee override route, plus a required non-empty `reason`.
- Tests (pure and source-text, the repo's style; no database):
  - the status the file returns to for each starting status and release path;
  - recompute is refused for `released` and `closed`;
  - the route requires `release_lra:edit` and a reason;
  - CSA and Committee routes are unchanged.
- Run the lra, csa, computation and negotiation test folders and `npx tsc --noEmit -p .`.

### Phase 3 — Calculator and LRA page

- Add mode `"lra"` to the panel: its compute, loan-type and active-loans URLs, the required reason field, and the confirm dialog ("This will remove N generated documents and N PDC checks and send the file back to …").
- Render the panel on the LRA page while the file is before `released`. Hide it after.
- Do not change how CSA and Committee modes look or behave.
- Run ESLint on both files and confirm no new problems.

### Phase 4 — Validation (browser, staging data)

Take a dummy application to LRA with the seed accounts, then as LRA:

1. **Panel shows** on the LRA page and is prefilled from the active computation.
2. **Reason required:** recompute without a reason is refused.
3. **Early stage:** at `awaiting_path`, change the release date. A new computation is saved, the file stays at `awaiting_path`, and the audit log has the entry.
4. **After PDC and documents:** encode PDC checks and generate documents, then change the amount. The warning shows the right counts; after confirming, PDC checks and documents are gone, the file is back at `pdc_encoding`, and the figures on screen are the new ones.
5. **After briefing:** repeat once the briefing is acknowledged, and confirm it is reset.
6. **Blocked after release:** once released, the panel is gone and the route returns an error.
7. **Other roles:** a non-LRA account gets 403 from the new route.
8. **Regression:** CSA and Committee calculators still work.
9. **Audit log:** the entry shows who, when, the reason, old and new values, and what was cleared.
10. Take screenshots for steps 1, 4 and 9.

### Phase 5 — Report

Output the summary: files changed, test and type-check results, browser results, and anything not verified. Do not commit or push unless asked.

## Risks the client should know (accepted by decisions 1–3, flag when delivering)

- **LRA can change what Committee approved.** Amount, terms and loan type can change after approval with no second review. The audit log is the only control.
- **No borrower signature on the new figures.** The borrower signed the earlier computation, not LRA's.
- **Signed documents are destroyed** when LRA recomputes late. They must be generated and signed again.
- **Offsets and other-loan deductions** can be changed by LRA; the internal transfers they create at release will follow the new figures.

## Out of scope (flag, do not fix)

- A second approval or notification to Committee when LRA changes figures.
- Letting LRA change a loan after it is released.
- Any change to who can see the audit log.
- Concern #2 (paperwork dated for a future release): this plan and the #1 field together likely cover it, but that is not confirmed.

## Estimate

3–4 days: a new route and service function with clearing logic, a third panel mode, and a long validation path through LRA.
