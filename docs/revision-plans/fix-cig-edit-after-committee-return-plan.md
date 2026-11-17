# Fix plan — CIG cannot edit after Committee returns an application directly to CIG

**Concern:** #4 in `docs/client-concerns-checklist.md`. Audited and reproduced 2026-11-16 on dev application AN300024.
**Mode:** Bolt-style single-issue fix. Plan only; nothing in this file has been implemented.

## Rules (apply to every phase)

- Fix only this one issue. Do not broad-refactor.
- Verify before changing. Re-read each file below at the stated lines before editing; if the code differs from this plan, stop and report.
- Touch only the files listed under "Files to change." If a related spot is not listed, stop and flag it. Do not edit it.
- Use the current schema only. Do not guess table names, columns, policy names or function names. Every name used below was read from the repo on 2026-11-16; re-confirm against the live database in Phase 1 before writing SQL.
- The only database change allowed is one new migration that relaxes the four named policies. No new tables, columns or functions unless a phase says so (none is expected).
- Preserve existing behavior outside the exact issue:
  - CIG forward, return, cancel and callback still require `for_verification`.
  - A file returned to **CSA** must not unlock CIG.
  - Once CIG marks the revision complete, CIG is locked again.
- Do not rename, clean up, or reformat adjacent code.
- Run the existing tests after each phase. Never delete or weaken a test to make it pass. A test may be updated only where this plan names it.
- Execute phases in order. Each phase must leave the app green before the next starts.
- Apply the migration to the **dev** database first. Do not touch staging or production in this task.
- Be concise. No new abstractions beyond the one helper named below.
- At the end, output one summary: files changed, migration applied, tests run and result, and what was verified in the browser.

## We will fix only one exact issue

**Issue:** When Committee returns an application directly to CIG ("Notice to Revisit", route = CIG), CIG cannot edit the information that needs correcting.

**Who is affected:** CIG staff. The client reported it. Committee is indirectly affected because the file can never be corrected and sent back.

**What I see (verified):**
- On AN300024, after the return, the API reports `status = for_revision` and `editable = false`.
- The CIG page shows every field disabled and the banner "Submitted to Committee — view only. Edits are locked."
- The only available action is "Revision complete", so CIG can only send the file back unchanged.
- A direct save returns 403 "Application is not in verification stage" and changes nothing.

**Expected:** While an application is `for_revision` **and** has an open return notice routed to CIG, CIG can edit and save the verification form, record checks, and edit the borrower fields it can normally edit, then click "Revision complete" to return the file to Committee.

**Error message:** 403 "Application is not in verification stage" (from `assertCigVerificationStage`).

**Where it happens:** CIG application page `/cig/applications/[id]`, `GET` and `PATCH /api/cig/applications/[id]`, `POST /api/cig/applications/[id]/checks`, and the database write policies behind them.

## Scope

Only CIG's ability to edit and save while a CIG-routed revisit is open. Nothing else.

## Files to change

1. `src/lib/cig/queue-guards.ts`: add one new guard, `assertCigEditStage`. Leave `assertCigVerificationStage` exactly as is.
2. `src/app/api/cig/applications/[id]/route.ts`: use the new guard in `PATCH` (line ~448), and change `editable` in `GET` (line ~400).
3. `src/app/api/cig/applications/[id]/checks/route.ts`: use the new guard in `POST` (line ~117).
4. `supabase/migrations/<new timestamp>_cig_edit_during_cig_revisit.sql`: one new migration. Timestamp must be later than `20261114214212`.
5. A test file for the new guard and flag, next to the existing CIG tests (`src/lib/cig/__tests__/`).

Not changed: `forward`, `return`, `cancel` and `callback` routes (they keep `assertCigVerificationStage`), `completeRevision` in `src/lib/negotiation/service.ts`, the CIG page component, the CSA code, and the Committee code.

## Current data source used

- Status: `loan_applications.status`. A Committee return sets `for_revision`, shared with CSA returns.
- Which team the return is for: `revisit_notices` (`route_to` = `csa` or `cig`, `resolved_at` is null while open). The CIG GET route already reads it through `getOpenRevisitNotice`.
- Edit rights today (all keyed on `status = 'for_verification'`):
  - UI flag: `editable` in the CIG GET route.
  - API guard: `assertCigVerificationStage` in `queue-guards.ts`.
  - Database policies: `verifications_write`, `checks_recorded_cig_write`, `borrowers_cig_update` (all in `20260706140001_p4_rls.sql`) and `applications_cig_borrower_edit` (in `20260706140000_p4_cig_verification.sql`). No later migration redefines these four.
- `revisit_notices_select` already lets a user with `verification:view` read CIG-routed notices, so the new policy check can read them with no policy change.

## Root cause

CIG's edit rights were written for a single status, `for_verification`. A Committee return moves the file to `for_revision`. CSA's rights include `for_revision` (`is_csa_editable_status`), but CIG's never did, at the page, the API and the database. The workspace text already tells CIG to "complete the requested verification updates, then mark revision complete", but nothing allows the updates.

## Minimum fix

1. Define "CIG-editable" as: `status = 'for_verification'`, **or** `status = 'for_revision'` with an open `revisit_notices` row where `route_to = 'cig'`.
2. API: apply that rule to the edit routes only (`PATCH` and checks `POST`) through a new guard, and to the `editable` flag in `GET`.
3. Database: add the same condition to the four policies above, in one migration.

## Phases

### Phase 1 — Verify the live database (read only)

- With the Supabase tools or SQL, read the live definitions of `verifications_write`, `checks_recorded_cig_write`, `borrowers_cig_update` and `applications_cig_borrower_edit`, and the columns of `revisit_notices`.
- Confirm they match the repo files named above (a `reconcile_production_*` migration exists from 2026-11-14, so do not assume).
- Confirm `revisit_notices` has `loan_application_id`, `route_to` and `resolved_at`.
- If anything differs, stop and report. Do not write SQL from the repo alone.

### Phase 2 — Migration

- Add one migration that drops and recreates only the four policies, keeping each policy's name, command, roles, permission checks and `USING` / `WITH CHECK` shape exactly as in Phase 1.
- Replace each `status = 'for_verification'` test with:
  `(status = 'for_verification' OR (status = 'for_revision' AND EXISTS (SELECT 1 FROM public.revisit_notices rn WHERE rn.loan_application_id = <the application id for that table> AND rn.route_to = 'cig' AND rn.resolved_at IS NULL)))`
  Use the correct application id reference for each table: `loan_application_id` for `verifications` and `checks_recorded`, `la.id` for the `borrowers` policy, `id` for `loan_applications`.
- For `applications_cig_borrower_edit`, keep the `WITH CHECK` target as it is: the row must still be in the same editable state after the update, and it must not allow the status to change. Do not touch `applications_cig_forward`, `applications_cig_return` or `applications_cig_cancel`.
- Apply to the **dev** database only. Record the migration name in the summary.

### Phase 3 — API guard and flag

- In `queue-guards.ts`, add `assertCigEditStage(supabase, applicationId)`:
  - allow `for_verification`;
  - allow `for_revision` only when an open `revisit_notices` row has `route_to = 'cig'` (reuse the same lookup shape as `getOpenRevisitNotice`);
  - otherwise throw the same `ForbiddenError("Application is not in verification stage")`.
- In `route.ts` (CIG), call `assertCigEditStage` in `PATCH`. Change `editable` in `GET` to be true for `for_verification`, or for `for_revision` when the open notice is routed to CIG. The route already computes `revisit` for `for_revision`, so reuse that value and add no new query.
- In `checks/route.ts`, call `assertCigEditStage` in `POST`.
- Leave `assertCigVerificationStage` and its other callers untouched.
- Add tests for the guard and the flag:
  - allowed: `for_verification`; `for_revision` with an open CIG notice;
  - rejected: `for_revision` with an open CSA notice; `for_revision` with no open notice; `for_revision` with a resolved CIG notice; other statuses.
  Use the style the neighbouring CIG tests use. Do not hit the database.
- Run `node --import tsx --test "src/lib/cig/__tests__/*.mts"` and `npx tsc --noEmit -p .` (ignore the generated `.next` file).

### Phase 4 — Validation (browser, dev data only)

Use ego-browser with the seed accounts on the dev server that runs **this checkout**, on dev application **AN300024** (already `for_revision`, routed to CIG).

1. **Unlocked:** as CIG, the banner no longer says edits are locked, the fields are enabled, and Save buttons work.
2. **Edit and save:** change the interview notes and the crewing manager details, save, reload, and confirm the values persisted.
3. **Checks:** record or change a check and confirm it saves.
4. **Revision complete:** click it and confirm the status becomes For Approval with a Committee notification, and the notice is marked resolved.
5. **Locked again:** as CIG, confirm the file is view-only again and a direct save returns 403.
6. **CSA-route negative:** open **AN300023** (returned to CSA, status `for_revision`) as CIG and confirm it stays locked.
7. **Regression:** forward, return, cancel and callback still work on a normal `for_verification` file, and a normal `for_verification` file still edits as before.
8. Take screenshots for steps 1 and 5.

### Phase 5 — Report

Output the summary: files changed, migration applied, test and type-check results, browser results, and anything not verified. Do not commit or push unless asked.

## Out of scope (flag, do not fix)

- **Borrower-profile edit rights.** Whether CIG should edit borrower fields during a return is a business decision. The plan only restores the same edit rights CIG has during normal verification.
- **Applying the migration to staging and production.** Follow `docs/staging-environment.md` after dev is verified.
- **Concern #5** (CIG editing and sending back to Committee after a CSA correction) is a separate issue. It depends on the status flow through CSA, so confirm it separately after this fix.
- **Other CIG pages** (field visit, collateral inspection, CI references form modal) may have their own status checks. They were not audited. Flag any that still lock after this fix instead of editing them.
- The status label stays "For Revision". A clearer label for CIG is a separate change.

## Risk

Medium. It touches four database policies in a live permission path, but the change only widens access in one narrow case: a file in `for_revision` with an open CIG-routed notice, for users who already hold the same CIG permissions. The main risks are unlocking CIG on a CSA-routed return (Phase 4 step 6) and loosening the `WITH CHECK` on `applications_cig_borrower_edit`. Both are covered by the validation steps.

## Estimate

1–1½ days, up from the checklist's ½–1 day because of the migration and policy verification.
