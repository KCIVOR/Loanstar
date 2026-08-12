# Phase 2 — Item 2: Submitted documents no longer a strict requirement

Part of the System Revision Report rollout. See `loanstar/docs/system-revision-report-tracker.md` for the workflow rules (audit-first, Cursor implements, Claude validates) and overall status.

**Tracker item:** *Submitted documents should no longer be a strict requirement — borrowers can submit their application even if some documents are missing.*

**Ground rules (apply to every phase):**
- Touch only the files listed under "Files to change." If you find a related spot not listed, stop and flag it rather than editing it.
- Do not rename, refactor, or "clean up" adjacent code you encounter while editing a listed file.
- Do not change DB columns/tables beyond what this phase's migration specifies. Additive only unless stated otherwise.
- Run existing tests for the touched area after the change; do not delete or weaken a test to make it pass.
- At the end, output a summary: files changed, migration(s) applied, tests run/result, and anything you deliberately left alone that looked related.

## Audit findings (evidence, verified 2026-08-10)

- The hard block lives entirely in one place: `src/app/api/borrower/applications/[id]/submit/route.ts:72-86`.
  ```
  const items = await getStageChecklist(supabase, "intake", application.id, {
    segment: application.segment, entityType: application.entityType,
  });
  const summary = getCompletionSummary(items);
  if (summary.uploaded < summary.required) {
    return NextResponse.json({ error: `Upload all required documents before submitting (...).`, summary }, { status: 400 });
  }
  ```
  This is the only place that stops a `draft` application from moving to `documents_pending`. Removing it is enough to satisfy the item.
- Mirrored on the frontend, `src/app/borrower/applications/[id]/page.tsx`:
  - `canSubmit` (line 328): `isDraft && !!docsSummary && docsSummary.uploaded >= docsSummary.required` — disables the Submit button until all required docs are uploaded.
  - The "Ready to submit?" banner (lines 504-528) shows `disabled={!canSubmit}` and a `title` tooltip "Upload all required intake documents first," and its body copy assumes submission requires full docs ("Upload all required documents to submit (X of Y)").
- `getCompletionSummary`/`getStageChecklist` (`src/lib/documents/checklist.ts:284-308` and `:129+`) are **shared, read-only helpers** used by 8+ other routes (CSA endorse gate `src/lib/csa/application.ts:140-148` and `workspace.ts:43`, CIG receipt readiness `src/lib/cig/receipt.ts:37-43`, plus checklist-display routes for LRA/AR/Committee/CSA/CIG/borrower). **Do not modify this file.** Nothing about its logic is wrong — it's correctly still used downstream to gate CSA's own endorse-to-CIG step, which is unaffected by this item (per the submit route's own existing comment: uploading is the borrower's gate today; *confirming* completeness is explicitly "CSA's job after submission" — that CSA-side gate stays exactly as-is).
- No DB-level constraint duplicates this check. `20260723000100_borrower_draft_transition_guard.sql` only guards that a `draft` application may transition to `draft` or `documents_pending` and nothing else (status-value guard, not a document-completeness guard) — untouched, no migration needed for this item.
- No dedicated test file exists for the submit route (`grep` for `applications/[id]/submit` and the exact error string both return only the route file itself) — no test to update/break.

## Scope decision

Remove the hard block from the submit route only. Keep the checklist/summary **display** everywhere else exactly as-is (borrower still sees "X of Y uploaded" for their own awareness, CSA/CIG/Committee/AR/LRA all keep their own independent completeness checks at their own stages — none of that is "the borrower's submission," so none of it changes). The Submit button becomes always-enabled while `status === 'draft'`; missing-docs information becomes informational only at this step.

## Files to change

1. **`src/app/api/borrower/applications/[id]/submit/route.ts`**
   - Delete the block at lines 72-86 (the `getStageChecklist`/`getCompletionSummary` call and the `summary.uploaded < summary.required` check + 400 response).
   - Remove the now-unused import `{ getCompletionSummary, getStageChecklist } from "@/lib/documents/checklist"` (line 6) — confirm nothing else in the file uses it before deleting the import.
   - Update the file's leading doc comment (lines 55-57, "Gated on required intake documents being uploaded...") to reflect the new behavior, e.g. "Borrower submits their draft — flips it to documents_pending, the first status CSA's queue picks up. No longer gated on document completeness; CSA follows up on missing docs after intake."
   - Leave `appendStatusHistory`, the audit-event write, and the `assertOwnApplication`/permission checks untouched.

2. **`src/app/borrower/applications/[id]/page.tsx`**
   - Line 328: change `canSubmit` to `const canSubmit = isDraft;` (drop the `docsSummary` conditions).
   - Lines 516-527 (Submit button): remove `disabled={!canSubmit}` (or keep `disabled={!isDraft}` purely as a status guard, not a docs guard) and drop the `title="Upload all required intake documents first"` tooltip since it's no longer true.
   - Lines 510-514 (banner body copy): change from "Upload all required documents to submit (X of Y)" to wording that doesn't imply submission is blocked by docs, e.g. keep showing the X/Y progress as information but drop "to submit" — for example: "This application is not yet visible to Loan Star. You can submit now and finish uploading documents afterward ({X} of {Y} uploaded so far)." Keep it a single sentence, don't redesign the banner.
   - Do not touch `docsPct`, `docsSummary` state/fetch, `nextStepGuidance(...)`, or the checklist section further down the page (lines ~593+) — those remain accurate progress displays, just no longer gate the button.
   - Leave `ConfirmDialog` (lines 650-659) message as-is — it's already generic and doesn't claim docs are complete.

## Explicitly out of scope for this phase

- `src/lib/documents/checklist.ts` (`getCompletionSummary`/`getStageChecklist`) — shared helper, do not edit.
- CSA's endorse-readiness gate (`src/lib/csa/application.ts`, `src/lib/csa/workspace.ts`) — CSA still requires completeness before endorsing to CIG; that's a different stage/actor and not part of this item.
- CIG's receipt-readiness check (`src/lib/cig/receipt.ts`) — same reasoning, different stage.
- Any AR/LRA/Committee checklist route — display-only, unaffected either way.
- The `20260723000100_borrower_draft_transition_guard.sql` status-value guard — no document-completeness logic in it to remove.

## Validation checklist (for Claude to check against Cursor's summary)

- [ ] `submit/route.ts` no longer imports or calls `getStageChecklist`/`getCompletionSummary`, and no longer returns the "Upload all required documents before submitting" 400 error.
- [ ] `getCompletionSummary`/`getStageChecklist` in `src/lib/documents/checklist.ts` are byte-identical to before (untouched).
- [ ] CSA endorse gate (`src/lib/csa/application.ts`) and CIG receipt readiness (`src/lib/cig/receipt.ts`) untouched — a manual/API check confirms CSA still can't endorse an incomplete file.
- [ ] Borrower can POST `/submit` on a `draft` application with 0 of N required docs uploaded and get `200` with `status: "documents_pending"`.
- [ ] Borrower page: Submit button is enabled on a draft application regardless of doc count; no more "Upload all required intake documents first" tooltip.
- [ ] `docsSummary`/progress display (the X/Y and percentage) still renders correctly elsewhere on the page — only the gating behavior changed, not the display.
- [ ] No changes to any file outside the two listed above.

## Status: DONE (validated 2026-08-10)

Implemented by Cursor, validated by Claude directly against live code:
- `submit/route.ts`: gate + unused import removed, doc comment updated, everything else (permission check, status guard, audit write) untouched — confirmed by reading the file.
- `page.tsx`: `canSubmit = isDraft`, tooltip removed, banner copy updated to "submit now, finish uploading afterward" wording — confirmed by reading the file.
- `src/lib/documents/checklist.ts` (`getCompletionSummary`/`getStageChecklist`) — confirmed still present and unmodified.
- No migration needed, matching the plan's expectation that no DB-level gate existed.
- Cursor reported 59/59 related unit tests passing.
