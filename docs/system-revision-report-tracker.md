# System Revision Report — Progress Tracker

Source: `Loanstar_System_Revision_Report.docx`, prepared for Loanstar Management, dated 2026-08-10. Tracks implementation status of each confirmed change from the walkthrough session.

Status legend: `Not Started` · `In Progress` · `Blocked` · `Done` · `Skipped`

## Workflow (read every time before touching this file)

0. **Audit phase first, always.** Before writing (or revising) a phase's implementation plan, Claude audits the live codebase for that item — evidence-only, file:line citations, "NOT FOUND" if genuinely absent, no assuming prior memory/notes still reflect current code. Findings are grounded fresh each time, since flows in this codebase get reworked frequently.
1. Claude writes a **surgical-mode** implementation plan for the item, built on the Phase 0 audit findings, with explicit constraints so the executor doesn't touch existing logic unconnected to the change. **One `.md` file per revision item (or tightly-coupled item group)**, containing all of that item's phases as sequential, step-by-step sections within the same file — never split across multiple files. Phases within the file are chunked small (by layer, and further by concern where needed — e.g. backend split into "mechanism change" / "message copy" / "tests" — corrected 2026-08-10 after first trying one-file-per-phase, which the user rejected) so each is safe and easy to reason about in isolation.
2. The user runs the plan **through Cursor one phase at a time**, in the order the phases appear in the file — Cursor does the actual code implementation, not Claude.
3. Cursor outputs a summary of what it changed for that phase.
4. The user pastes that summary back to Claude, who **validates** it against that phase's section of the plan (scope creep, missed items, incorrect implementation, unintended breakage) before the user moves to the next phase.
5. **After all phases in the file are implemented, Cursor must produce one final combined summary report covering every phase** (all files changed, all migrations applied, all tests run, everything deliberately left alone) — not just the per-phase summaries. The user sends this combined report to Claude for a final end-to-end validation pass across the whole item before it's marked Done.
6. This tracker's Status/Notes columns get updated as phases are validated and land, with the Notes column linking to the item's single plan file.

Claude should not implement code for these items directly unless the user explicitly says otherwise in a given session.

**File layout:** one file per item/item-group under `loanstar/docs/revision-plans/`, e.g. `phase-01-skype-to-teams.md` (items 1-2 predate the multi-phase-per-file convention and are single-phase anyway, so no change needed there) and `item-03-04-borrower-document-scope.md` (multi-phase, all phases as `## Phase N` sections in one file). Do **not** create a subfolder or separate file per phase — that was tried and explicitly reversed 2026-08-10.

Per-item plan files:
- [Skype → Teams](revision-plans/phase-01-skype-to-teams.md) — Done
- [Optional documents at submit](revision-plans/phase-02-optional-documents-at-submit.md) — Done
- [Items 3+4 — Borrower document scope](revision-plans/item-03-04-borrower-document-scope.md) — Done, all 5 phases validated
- [Item 7 — Verifier name auto-fill](revision-plans/phase-07-verifier-name-autofill.md) — Done, both phases validated
- [Item 8 — Committee size config](revision-plans/phase-08-committee-size-config.md) — Done, all 6 phases + 3 follow-on fixes verified — see `revision-plans/hotfix-committee-size-rls-gap.md`
- [Item 10 — Combined signing upload](revision-plans/item-10-combined-signing-upload.md) — Done (closed without Phases 3/7 test coverage, by user decision)
- [Item 14 — Excel import audit](revision-plans/item-14-excel-import-audit.md) — Audit only, paused — 3 open client questions block the implementation plan
- [Item 15 — Remove check transmittal & clearing](revision-plans/item-15-remove-check-transmittal-clearing.md) — Done, all 3 phases validated (DB columns dropped)

## Borrower Application

| # | Item | Status | Notes |
|---|------|--------|-------|
| 1 | Replace "Skype" with "Teams" as a contact option in the application form | Done | Implemented by Cursor 2026-08-10, validated against plan (code + DB checked directly) — see `revision-plans/phase-01-skype-to-teams.md` |
| 2 | Submitted documents no longer a strict requirement — borrowers can submit even with missing docs | Done | Implemented by Cursor 2026-08-10, validated against plan (code checked directly) — see `revision-plans/phase-02-optional-documents-at-submit.md` |

## Document Requirements

| # | Item | Status | Notes |
|---|------|--------|-------|
| 3 | Borrowers only responsible for uploading: house sketch, valid ID, passport, seaman's book, 2x2 photo, and loan contract | Done | Implemented by Cursor 2026-08-10, all 5 phases validated (code + DB checked directly, full suite 545/545) — see `revision-plans/item-03-04-borrower-document-scope.md` |
| 4 | Other required docs (e.g. Data Privacy Consent) signed in person at branch; CSA uploads signed copies afterward — not a borrower step | Done | Implemented by Cursor 2026-08-10, all 5 phases validated (code + DB checked directly, full suite 545/545) — see `revision-plans/item-03-04-borrower-document-scope.md` |

## Credit Screening

| # | Item | Status | Notes |
|---|------|--------|-------|
| 5 | Negative record at initial credit check → staff can note it and let application proceed with a remark, not auto-stop | Done | Audited 2026-08-10, already implemented — no code change needed. CSA's "Record fail" already allows an optional remark and does not block endorsement readiness (`getEndorseReadiness`/`nclRecorded` treats pass and fail as equally "recorded"; `endorse/route.ts` only gates on that). No auto-stop found anywhere in the codebase. |
| 6 | Same flexibility for the later verification check — negative result recorded, not auto-blocking | Done | Audited 2026-08-10, already implemented — no code change needed. CIG's `isFindingRecorded`/`assessVerificationCompleteness` treat "positive" and "negative" findings identically for completeness; `forwardToCommittee` only gates on overall completeness, not finding value. No auto-block on negative finding found anywhere in the codebase. |

## Verification Step

| # | Item | Status | Notes |
|---|------|--------|-------|
| 7 | Verifying staff member's name auto-filled from logged-in user, not editable | Done | Implemented by Cursor 2026-08-10, both phases validated (code checked directly, 54/54 tests) — see `revision-plans/phase-07-verifier-name-autofill.md` |

## Approval Committee

| # | Item | Status | Notes |
|---|------|--------|-------|
| 8 | Number of required approvers adjustable by management, instead of fixed | Done | All 6 phases + 3 follow-on fixes (RLS gap, client-bundle break, unrelated pre-existing `committee_votes` UPDATE-policy gap found while testing) implemented and verified 2026-08-11 — see `revision-plans/phase-08-committee-size-config.md` and `revision-plans/hotfix-committee-size-rls-gap.md` |

## Loan Release Processing

| # | Item | Status | Notes |
|---|------|--------|-------|
| 9 | Add a Cash Voucher to the auto-prepared release document set | Done | Audited 2026-08-11, already implemented — `cash_voucher` is already in `AUTO_GENERATED_SLUGS.without_pdc` and genuinely rendered by `generateReleaseDocuments`. Skipped for now: a separate, deeper bug found during this audit — `closeRelease()`'s `REQUIRED_SIGNED_RELEASE_SLUGS` hardcodes `signed_check_voucher` regardless of release path, and no `signed_cash_voucher` document type exists at all — likely means a cash-path release can never close. Zero `release_files` rows with `release_path='without_pdc'` exist in the DB, so this has never been exercised. Deferred at user's request, not fixed. |
| 10 | Combine all signing documents into a single file/upload with one confirmation, instead of one at a time | Done | Feature validated working end to end (combined upload, remarks, view, persistent uploaded-by/at log) — see `revision-plans/item-10-combined-signing-upload.md`. **Note: Phases 3 and 7 (dedicated unit test coverage) were closed as not-done by user decision, not implemented** — no automated test regression protection for `resolveCombinedUploadTargets` or `combinedUploadSchema` specifically, though the app's existing broader test suite is unaffected. |
| 11 | Remove "client briefing" responsibility from the Collector role | Skipped | Skipped at user's request 2026-08-11 |
| 12 | Create a new "Collection Head" position for client briefings, separate from Collector | Skipped | Skipped at user's request 2026-08-11 |

## Post-Dated Checks

| # | Item | Status | Notes |
|---|------|--------|-------|
| 13 | Fix rounding bug — checks must sum to the exact loan balance instead of repeating the same rounded amount | Not Started | |

## Accounts Receivable

| # | Item | Status | Notes |
|---|------|--------|-------|
| 14 | Add ability to import account data from Excel (not just export) | In Progress | Field audit done (paused here, resume later) — client's real 80-column SF Masterfile checked against live schema: 52/80 fields fillable/computable, 28/80 are genuine gaps (no home in schema). 3 open client questions block writing the implementation plan (full vs. partial parity; ambiguous columns like Branch/BIR/Tipping Position; import-vs-export-only field scope). See `revision-plans/item-14-excel-import-audit.md` |
| 15 | Remove "Check Transmittal & Clearing" tracking feature entirely | Done | Implemented by Cursor 2026-08-11, all 3 phases validated directly (code + DB checked) — see `revision-plans/item-15-remove-check-transmittal-clearing.md`. DB columns dropped per user's explicit confirmation (1 row's non-default data was lost, as disclosed) |

## Payments & Collections

| # | Item | Status | Notes |
|---|------|--------|-------|
| 16 | Only Collector can record a payment received | Not Started | |
| 17 | Collectors can manually record in-person branch payments | Not Started | |
| 18 | Record actual payment date, separate from original due date | Not Started | |
| 19 | Borrowers can pay multiple months at once, applied properly across all covered months | Not Started | |

## Deferred to Future Phase

- Online payment options (DragonPay, PayMaya) — not part of this round.

## Summary

- Total items: 19
- Not Started: 5
- In Progress: 1
- Blocked: 0
- Skipped: 2
- Done: 11

## Deferred findings (out of tracker scope, flagged not fixed)

- **Cash-path release close-gate bug** (found auditing Item 9, 2026-08-11): `src/lib/lra/release-service.ts:579-583` (`REQUIRED_SIGNED_RELEASE_SLUGS`) unconditionally requires a `signed_check_voucher` scan to close any release, regardless of `release_path`. No `signed_cash_voucher` document type exists in `document_types`. A `without_pdc` (cash) release likely cannot close through the normal flow. Never exercised in this environment (0 `release_files` rows with `release_path='without_pdc')`. User asked to skip for now — revisit later.
