# Hotfix — Intake checklist completely optional (remove CSA endorse gate)

Follow-up to `phase-02-optional-documents-at-submit.md` (tracker item 2). That phase unblocked the borrower's *submit* step but left one hard gate downstream. This hotfix removes that last gate so intake-document completeness never blocks any workflow action, anywhere.

**Ground rules (apply to every phase, same as every other item in this workflow):**
- Touch only the files listed under "Files to change." If you find a related spot not listed, stop and flag it rather than editing it.
- Do not rename, refactor, or "clean up" adjacent code you encounter while editing a listed file.
- Do not change DB columns/tables — this item needs no migration.
- Run existing tests for the touched area after the change; do not delete or weaken a test to make it pass.
- At the end, output a summary: files changed, tests run/result, and anything you deliberately left alone that looked related.

## Audit findings (evidence, verified 2026-08-12)

A full sweep of every consumer of `getStageChecklist`/`getCompletionSummary` (`src/lib/documents/checklist.ts`) across borrower, CSA, CIG, Committee, AR, and LRA code found **exactly one place where intake-checklist completeness actually blocks an action**:

- `src/lib/csa/application.ts`, `getEndorseReadiness` (lines 135–254):
  - Line 148–150: `checklistComplete = summary.required > 0 && summary.complete === summary.required`
  - Line 216–218: pushes `"Intake checklist incomplete"` into `missing` when `!checklistComplete`
  - Line 237–246: `ready` is `false` whenever `!checklistComplete` (ANDed with the other readiness conditions)
  - Consumed by `src/app/api/csa/applications/[id]/endorse/route.ts` lines 23–31, which returns HTTP 400 `"Cannot endorse — requirements not met"` when `!readiness.ready` — this is the actual block, and it stops a CSA staff member from endorsing an application to CIG.
  - Mirrored on the frontend in `src/app/csa/applications/[id]/page.tsx` line 1268: `disabled={!data.endorseReadiness.ready}` on the "Endorse to CIG" button, and lines 700–717 render `endorseReadiness.missing` (which today includes "Intake checklist incomplete") as a blocking-looking warning list.

Everything else is display-only already, confirmed by tracing every call site — **no code change needed for these**:
- `src/lib/cig/receipt.ts` (`getReceiptReadiness`) — computed and returned by `src/app/api/cig/applications/[id]/route.ts` (GET only), never read by any action route. CIG's forward-to-committee action is not gated on it.
- `src/lib/committee/completeness.ts` (`getCommitteeCompleteness`) — wraps `getReceiptReadiness`, consumed only by `src/app/api/committee/applications/[id]/route.ts` (GET only). No committee vote/decision/override/action route references it.
- `src/lib/csa/workspace.ts` (`csaDocsSummary`, `csaWorkspaceStageIndex`) — progress bar and stepper-position display only; does not block anything. The actual CSA gate is `getEndorseReadiness`, called independently from the endorse route.
- `src/lib/agent/queue.ts` — checklist summary used only for a display column/sort in the agent lead queue.
- All `*/checklist/route.ts` routes (AR, borrower, CIG, Committee, CSA, LRA) — GET-only display endpoints.
- No SQL migration enforces document-count completeness at the DB layer (only status-value and immutability guards exist) — nothing to touch there.

## Scope decision

Remove `checklistComplete` from the `ready` boolean and from the `missing` list in `getEndorseReadiness`. Keep computing and returning `checklistComplete` itself (and the underlying checklist data elsewhere on the page) so CSA staff can still *see* upload progress — it just stops being a requirement to endorse. All other `EndorseReadiness` conditions (on-hold, NCL/duplication check recorded, signed computation, coverage ratio, application-form completeness, privacy orientation, initial interview) are untouched — this hotfix only concerns document-checklist completeness, not the other endorse prerequisites.

## Files to change

1. **`src/lib/csa/application.ts`**
   - Line 216–218: delete the `if (!checklistComplete) { missing.push("Intake checklist incomplete"); }` block.
   - Line 237–246 (`ready:` calculation): remove `checklistComplete &&` from the boolean expression.
   - Leave the `checklistComplete` computation itself (lines 140–150) and its inclusion in the returned `EndorseReadiness` object (line 246, `checklistComplete,`) untouched — still useful for display.
   - Leave every other readiness input (`onHold`, `nclRecorded`, `signedComputationPresent`, `coverageEval`, `formCompleteness`, `orientation`, `interview`) untouched.

2. **`src/app/csa/applications/[id]/page.tsx`**
   - No functional change required — once `missing` no longer contains "Intake checklist incomplete" and `ready` no longer depends on it, the existing warning list (lines 700–717) and disabled button (line 1268) automatically stop treating the checklist as blocking, since they just render whatever the API returns.
   - Confirm (don't need to change) that the checklist's own display section elsewhere on the page is unaffected — it should keep showing "X of Y uploaded" for CSA's awareness, same as the borrower-side precedent from `phase-02-optional-documents-at-submit.md`.

## Explicitly out of scope for this hotfix

- `src/lib/cig/receipt.ts` / `src/lib/committee/completeness.ts` — already display-only, no gate exists to remove.
- `src/lib/csa/workspace.ts` — display/stepper only, not a gate.
- `src/lib/documents/checklist.ts` (`getCompletionSummary`/`getStageChecklist`) — shared helper, do not edit.
- Every other `EndorseReadiness` condition (on-hold, NCL check, signed computation, coverage ratio, form completeness, orientation, interview) — not part of this item, stay exactly as they are today.
- Any DB migration — no DB-level completeness constraint exists to remove.

## Validation checklist (for Claude to check against Cursor's summary)

- [ ] `getEndorseReadiness` no longer pushes "Intake checklist incomplete" into `missing`.
- [ ] `ready` no longer ANDs on `checklistComplete`.
- [ ] `checklistComplete` is still computed and still present on the returned object (for display), untouched otherwise.
- [ ] All other readiness conditions (onHold, nclRecorded, signedComputationPresent, coverageEval.coverageOk, formCompleteness.complete, orientation.complete, interview.complete) unchanged.
- [ ] Manual/API check: CSA can POST `/endorse` and successfully move an application to `for_verification` with 0 of N required intake documents uploaded, provided every other readiness condition is met.
- [ ] `src/app/csa/applications/[id]/page.tsx` — no code changes needed there; confirm the endorse button enables correctly once the API reflects the new `ready` value, and that the checklist progress display elsewhere on the page still renders "X of Y" for awareness.
- [ ] No changes to `src/lib/cig/receipt.ts`, `src/lib/committee/completeness.ts`, `src/lib/csa/workspace.ts`, or `src/lib/documents/checklist.ts`.
- [ ] Existing tests for `src/lib/csa/application.ts` / endorse route still pass (update any test that specifically asserted the old "Intake checklist incomplete" blocking behavior — that assertion is now the thing being removed).

## Status: Done (2026-08-12)
