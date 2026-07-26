# CIG Hard Sequence — Design

**Date:** 2026-07-24  
**Status:** Approved for planning (user: fine with CSA-style hard sequence; doc-aligned order)

## Problem

Workflow §3 lists an ordered CIG process. The app supports all steps and blocks **Submit** until complete, but does **not** enforce step order. CIG can save Finding, Crewing Manager, checks, or CI & References in any order while `for_verification`. Soft stepper copy (“unlock finding”) is misleading.

## Goal

Enforce a CSA-style hard sequence: UI disables later stages; server rejects out-of-order writes. Keep explicit **Submit CI report** (Accepted as-is vs auto-forward).

## Frozen sequence

| Stage | ID | Required to complete stage |
|-------|-----|------------------------------|
| S1 | `borrower_review` | `fieldCompletenessOk != null` + all three borrower-interview confirms (`biIdentityConfirmed`, `biPurposeConfirmed`, `biDetailsConfirmed`) |
| S2 | `external_checks` | All CIG-mapped checks recorded pass or fail |
| S3 | `ci_references` | Same PIC/refs/checklist/rating subset already required by `assessVerificationCompleteness` |
| S4 | `crewing_manager` | `cmPosition`, `cmContractStatus`, `cmDepartureDate`, `cmFitToWork` filled |
| S5 | `finding` | `finding` is `positive` or `negative` |
| S6 | `forward` | Existing `forwardToCommittee` completeness (unchanged end gate) |

**Within-stage:** draft/partial saves allowed.  
**Cross-stage:** writing fields for stage N+1 rejected until stage N complete.

## Explicit non-goals

- Do not change auto-forward (keep Submit).
- Do not hard-gate Receipt check (remains advisory + return-to-CSA).
- Do not rename/rebuild CI & References Form.
- Do not change CIG deny authority, computation visibility, or callback scheduling.
- Do not fix `for_revision` edit lock in this work (pre-existing; separate if needed).
- Borrower **name** correction stays allowed anytime in `for_verification` (workflow §3 step 8).

## Pattern to mirror

CSA: `assertCanRecordInitialInterview` / `assertInterviewRecordedForComputation` + UI `disabled={!interviewComplete}`.

CIG: pure `getCigSequenceState(verification, checks)` + `assertCigFieldPatchAllowed(patch, state)` on PATCH and checks POST; UI disables cards from the same helper.

## Risks

- In-flight files with Finding already set but S1 empty: still forward-blocked today; after change, they must complete S1→S4 before Finding becomes writable again (Finding already saved remains until cleared — prefer: allow reading existing finding; block *changes* to later-stage fields until priors complete; if finding already set while priors incomplete, next-step points at earliest incomplete stage).
- Callbacks: no freeze; sequence resumes when editable.
