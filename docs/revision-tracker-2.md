# Revision Tracker 2 — CIG / Committee / LRA / AR

Source: client-provided revision prompts, pasted 2026-08-14 (second round, separate from `Loanstar_System_Revision_Report.docx` tracked in `system-revision-report-tracker.md`).

Status legend: `Not Started` · `In Progress` · `Blocked` · `Done` · `Skipped`

## Workflow (read every time before touching this file)

0. **Audit phase first, always.** Before writing (or revising) an item's implementation plan, Claude audits the live codebase for that item — evidence-only, file:line citations, "NOT FOUND" if genuinely absent, no assuming prior memory/notes still reflect current code. Findings are grounded fresh each time, since flows in this codebase get reworked frequently.
1. Claude writes a **surgical-mode** implementation plan for the item, built on the audit findings, with explicit constraints so the executor doesn't touch existing logic unconnected to the change. **One `.md` file per revision item (or tightly-coupled item group)**, containing all of that item's phases as sequential, step-by-step sections within the same file — never split across multiple files. Phases within the file are chunked small (by layer, and further by concern where needed) so each is safe and easy to reason about in isolation.
2. The user runs the plan **through Cursor one phase at a time**, in the order the phases appear in the file — Cursor does the actual code implementation, not Claude.
3. Cursor outputs a summary of what it changed for that phase.
4. The user pastes that summary back to Claude, who **validates** it against that phase's section of the plan (scope creep, missed items, incorrect implementation, unintended breakage) before the user moves to the next phase.
5. **After all phases in the file are implemented, Cursor must produce one final combined summary report covering every phase** — not just the per-phase summaries. The user sends this combined report to Claude for a final end-to-end validation pass across the whole item before it's marked Done.
6. This tracker's Status/Notes columns get updated as phases are validated and land, with the Notes column linking to the item's single plan file.

Claude should not implement code for these items directly unless the user explicitly says otherwise in a given session — the exception is trivial one-line fixes, or infra/hotfix work Claude is actively debugging live (e.g. a production incident), per established practice.

**File layout:** one file per item under `loanstar/docs/revision-plans/`, named `feature-<short-slug>.md`. Do not create a subfolder or separate file per phase.

Per-item plan files (filled in as each item's plan is written):

- Item 1 — CIG: Edit application form — [feature-cig-edit-application-form.md](revision-plans/feature-cig-edit-application-form.md), audited + planned 2026-08-14
- Item 2 — CIG: Cancel/stop application — [feature-cig-cancel-application.md](revision-plans/feature-cig-cancel-application.md), audited + planned 2026-08-14
- Item 3 — Committee: Bypass borrower confirmation (no account) — [feature-committee-bypass-borrower-confirmation.md](revision-plans/feature-committee-bypass-borrower-confirmation.md), audited + planned 2026-08-14
- Item 4 — LRA: PDC + ATM surrender simultaneous release — [feature-lra-pdc-atm-simultaneous-release.md](revision-plans/feature-lra-pdc-atm-simultaneous-release.md), audited + planned 2026-08-14
- Item 5 — LRA: Cash Voucher + Check Voucher simultaneous generation — *plan not yet written*
- Item 6 — LRA: AR Check in document set — [feature-lra-ar-atm-voucher.md](revision-plans/feature-lra-ar-atm-voucher.md), audited + planned 2026-08-14
- Item 7 — AR: BIR / Non-BIR status tagging — [feature-ar-bir-status-tagging.md](revision-plans/feature-ar-bir-status-tagging.md), audited + planned 2026-08-14
- Item 8 — AR: Reference/transaction number on amortization ledger — *plan not yet written*
- Item 9 — AR: Rounding write-off page — *plan not yet written* (see note below — likely overlaps existing work)

## CIG (Credit Investigation)

| # | Item | Status | Notes |
|---|------|--------|-------|
| 1 | Allow CIG to edit the borrower's application form in-place (personal info, reference contacts — not computation/amount/documents), with audit trail of before/after values, attributed and timestamped, no re-submission triggered | Done | Implemented by Cursor 2026-08-14, both phases validated (code + `tsc` + full suite 891/891 checked directly), merged to `main` locally — see `revision-plans/feature-cig-edit-application-form.md`. User confirmed "Edit Application Form" button working live (initial "missing button" report was a stale dev-server bundle, resolved by hard refresh — not a code bug). |
| 2 | Allow CIG to cancel/withdraw an application from the CI stage, with a required reason, full audit log (who/when/why), confirmation dialog, and the record preserved in history (not deleted) | Done | Implemented by Cursor 2026-08-14, all 4 phases validated (code + `tsc` + full suite 892/892 checked directly, live DB/RLS state confirmed), merged to `main` locally — see `revision-plans/feature-cig-cancel-application.md`. Bonus fix beyond plan scope: `cancelled` now correctly terminal for reloan eligibility, dashboard pipeline widget, and CSA history (real gap the original audit missed). One migration-filename drift caught and fixed post-implementation. Live click-through still pending — left for the user. |

## Committee

| # | Item | Status | Notes |
|---|------|--------|-------|
| 3 | Auto-bypass borrower confirmation after committee approval when the borrower has no portal account — route straight to LRA, log the bypass, show committee a visible "no account" indicator before voting | In Progress | Audited + planned 2026-08-14 — see `revision-plans/feature-committee-bypass-borrower-confirmation.md`. Bypass reuses the existing `queueForLra()` service-role write (no new RLS needed on `loan_applications` — the committee policy already permits writing `lra_pending` directly); "no account" indicator is nearly free since the detail page already fetches `borrower.user_id`. 2 phases. Ready for Cursor. |

## LRA (Loan Release)

| # | Item | Status | Notes |
|---|------|--------|-------|
| 4 | Allow PDC and ATM Surrender to be selected simultaneously as release methods (not mutually exclusive), collecting and recording details for both, visible to AR at transmittal, with document generation responding to both | Done | Implemented by Cursor 2026-08-14, all 8 phases validated (code diffed directly against plan for every phase, `tsc` clean, 902/902 tests including a dedicated "both paths" test, live DB state independently confirmed for both the schema-add and the legacy-column-drop migrations), merged to `main` — see `revision-plans/feature-lra-pdc-atm-simultaneous-release.md`. Pre-existing `signed_cash_voucher` gap correctly left untouched, as instructed. A few consequential fixes outside the plan's literal file list (queue/briefings list labels, `employment-contract.ts`) — verified as correct TypeScript-driven ripple fixes, not scope creep. Live end-to-end browser click-through still pending — left for the user given the size of this change. |
| 5 | Allow Cash Voucher and Check Voucher (PDC) to be generated simultaneously in the same document set — currently treated as mutually exclusive | Done | Already satisfied as a side effect of Item 4 — confirmed 2026-08-14. `AUTO_GENERATED_SLUGS` already includes both `check_voucher` and `cash_voucher`; since Item 4 made both release paths selectable together, `generateReleaseDocuments()` now generates their union whenever both are checked (no auto-exclusion). The document checklist UI (`data.generatedDocuments.map(...)`) renders whatever's returned generically, no hardcoded filter. No new plan/implementation needed. |
| 6 | Add "AR Check" as a selectable document in the LRA generation checklist, alongside AR Cash and AR ATM — generated when release method includes PDC/check issuance | Done | Implemented by Cursor 2026-08-14, validated (code + `tsc` + full suite 902/902 checked directly, template body confirmed byte-identical to source live in the DB), merged to `main` — see `revision-plans/feature-lra-ar-atm-voucher.md`. Cursor correctly caught and fixed an error in the plan (voucher templates live in `document_templates`, not the unrelated legacy `document_types` table — verified). Scope note still open: "AR Cash" as a literally distinct document has no trigger condition without inventing a 3rd release method — needs a decision from the client, not silently built or dropped. |

## AR (Accounts Receivable)

| # | Item | Status | Notes |
|---|------|--------|-------|
| 7 | Add a configurable coded BIR / Non-BIR status field to AR master list accounts (no literal "BIR"/"Non-BIR" labels in UI), editable by AR, filterable/sortable, visible in account detail, codes configurable by Super Admin, never exposed to the borrower portal | Done | Implemented by Cursor 2026-08-14, all 3 phases validated (code + `tsc` + full suite 903/903 checked directly, live DB/RLS state confirmed, borrower-exclusion fix independently verified field-by-field for regressions), merged to `main` — see `revision-plans/feature-ar-bir-status-tagging.md`. Zero literal "BIR"/"Non-BIR" text confirmed anywhere in the UI. Unknown/removed codes fall back to showing the raw code rather than crashing — verified directly in the diff. |
| 8 | Add a required "Reference / Transaction No." free-text field to the payment posting form (collector + AR), surfaced as a ledger column and in the borrower portal's payment history; locked after AR confirms posting (correction requires Super Admin) | Not Started | Required at posting — cannot post without it. |
| 9 | Dedicated Rounding Write-Off page: a "Clear Rounding Difference" action on the account/ledger view (visible below a Super-Admin-configured threshold), logging borrower, account/loan no., amount, timestamp, and acting AR user; page filterable by date range/borrower/AR user with summarized totals; confirmation dialog; irreversible; AR + Super Admin only | Not Started | **Likely overlaps existing work** — `revision-plans/feature-ar-rounding-writeoff.md` (tracked as item 13, Done, in `system-revision-report-tracker.md`) already added a manual, threshold-gated, logged rounding write-off. Audit must start by diffing this request against what's already live before assuming any of it is net-new — this may be a "add the missing dedicated page/filtering/summary" delta rather than a from-scratch build. |
