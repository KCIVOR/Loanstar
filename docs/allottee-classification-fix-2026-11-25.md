# Seafarer / Allottee classification — fix and verification

Completed on local staging: 2026-11-25 (Asia/Manila). Report #1: 09c9fc4d-3ec7-405e-8ef9-9b7c3d08545b, medium. Production release and report closure remain pending.

## Requirement and confirmed cause

The original client report and attachment request Seafarer (the seafarer borrowing personally) and Allottee (the spouse/allottee borrowing) within the Seafarer calculator across CSA, Committee and LRA. [Workbook audit](allottee-calculator-audit-2026-11-25.md) confirmed that classification changes the header/export value, with no financial or payment-date change in the tested workbook scenarios. No additional eligibility, name-swapping or signatory rules were established.

Before changing the app, Egolite UAT Committee opened dummy application AN300025. It had no Borrower Type control; extracted label count was zero. Staging computations had no classification column. New service regression tests failed all four initial checks because classification was not stored/mapped and legacy rows did not map to an explicit unknown state. [Before image](../output/reports/allottee-fix-2026-11-25/before.png) shows the upper form; the missing-control finding used the full DOM, not that viewport alone.

## Change

- Added nullable computations.seafarer_borrower_type, constrained to SEAFARER / ALLOTTEE. No default or data backfill. NULL means Not recorded. It is separate from loan_applications.segment and from borrowers.allottee contact details.
- Applied migration 20261124214427_add_seafarer_borrower_type only to the verified staging project ddsvqjaknuniekygpbdr through the Primary connection. Repository migration matches the applied migration version. Existing RLS/grants are unchanged; no new tables/functions/policies.
- Shared calculator provides explicit Seafarer / Allottee selection for Seafarer loans only. Legacy records start blank; staff must select before UI recalculation. Saved summaries, including Committee's separate From CSA summary, show the stored classification or Not recorded.
- CSA, Committee and LRA API paths validate and pass the classification. Omission preserves existing classification in the route/service paths; explicit null remains available for legacy compatibility and QA restoration. Invalid classifications and assigning a Seafarer classification to SME/Individual are rejected before computation insertion. The API remains compatible with older callers omitting an unrecorded field.
- New computation versions retain the selection. LRA audit snapshots now include it. No financial engine rules, borrower names, contacts or signatories were changed.
- Release/acknowledgement/application-form context exposes the new seafarerBorrowerType merge field, registered in the template palette. The Final Computation Sheet generator adds a Borrower Type row comparing original/current classification. Existing published templates and signed/generated documents were not overwritten. Other templates display the new merge field only where their author includes it.

## Automated verification

**714 tests passed, 0 failed** across computation, CSA, LRA, negotiation and document-generator suites. The final run includes 18 classification service tests and two new document-context/row tests.

Coverage includes:

- Both classifications in CSA initial persistence, Committee adjustment and LRA recomputation, for Principal / Net Desired / Net less security. Entire mapped computation results are equal apart from classification.
- Existing Allottee choice survives omitted fields in Committee/LRA; explicit legacy null remains unknown.
- Invalid values and non-Seafarer misuse reject before insert.
- Legacy map has null rather than inferring from contact data.
- Template context classification changes without changing people, amounts or other context values; non-Seafarer templates get no Seafarer classification.
- Final sheet distinguishes Not recorded, Seafarer and Allottee and leaves the unused renegotiated column blank.

[Test log](../output/reports/allottee-fix-2026-11-25/tests.txt). Scoped service/API/document lint passed and git diff --check passed. Full UI lint still reports two pre-existing errors (Committee effect calling load; the existing useRateHistoryRow callback name) and three hook-dependency warnings. The useRateHistoryRow callback exists in HEAD; it was not introduced here. Repository TypeScript retains 16 existing diagnostics, with no new diagnostic location in the classification implementation. [UI lint](../output/reports/allottee-fix-2026-11-25/ui-lint.txt), [TypeScript](../output/reports/allottee-fix-2026-11-25/typecheck.txt).

Security advisors were checked after the additive migration. They report unrelated existing backup-table RLS, function exposure/search-path and Auth settings findings; no computations/new-classification finding. These were not changed by this fix. Relevant existing advisory references: [backup-table RLS](https://supabase.com/docs/guides/database/database-linter?lint=0013_rls_disabled_in_public), [function search paths](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable), [public SECURITY DEFINER functions](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable).

## Live Egolite verification

Local app http://localhost:3000, branch staging; effective development database ddsvqjaknuniekygpbdr.supabase.co. No production writes or deployment.

| Check | Actual result | Evidence |
|---|---|---|
| Committee editable calculator, AN300025 | Seafarer/Allottee selector present; Allottee selected without submission | [Selection](../output/reports/allottee-fix-2026-11-25/committee-selection.png) |
| LRA, AN300023, original v35 | Classification null; no generated documents/PDCs/acknowledged briefing; baseline captured | [Baseline](../output/reports/allottee-fix-2026-11-25/lra-baseline.json) |
| Save Allottee, reload, v36 | ALLOTTEE persisted and restored; no compared financial/input/date differences | [Image](../output/reports/allottee-fix-2026-11-25/lra-allottee.png), [values](../output/reports/allottee-fix-2026-11-25/lra-allottee.json) |
| Save Seafarer, reload, v37 | SEAFARER persisted/restored; no compared financial/date differences | [Image](../output/reports/allottee-fix-2026-11-25/lra-seafarer.png), [values](../output/reports/allottee-fix-2026-11-25/lra-seafarer.json) |
| Repeat Allottee, v38 | Saved again for cross-role checks | Seen by CSA/Committee below |
| CSA read-only, AN300023 | Same saved Allottee classification displayed | [Saved view](../output/reports/allottee-fix-2026-11-25/csa-saved-allottee.png) |
| CSA editable, AN300007 | Both choices present; selected Allottee without submitting | [Selection](../output/reports/allottee-fix-2026-11-25/csa-selection.png) |
| Committee read-only, AN300023 | Same saved Allottee classification returned by role API and displayed | [Saved view](../output/reports/allottee-fix-2026-11-25/committee-saved-allottee.png) |
| Restore original null, v39 | Normal authenticated LRA API restored original unrecorded classification and financial values; UI blank after reload | [Restored values](../output/reports/allottee-fix-2026-11-25/restored.json), [image](../output/reports/allottee-fix-2026-11-25/restored-unrecorded.png) |
| Attempt UI recalculation with blank classification | Required selection blocked submission; version remained 39 | Native validity false; API version checked |

Live computation writes were LRA only. CSA/Committee initial/adjustment write logic was tested through real services with offline persistence stubs, with live selection and saved-view checks as shown. Do not represent these as live CSA/Committee saves.

## Printed output proof

Fetched the currently published staging Final Computation Sheet HTML template. Rendered it locally through the application's PDF renderer (pdfmake) using real v35/v36 test computation values and the same exported row builders used by the generator. Visually inspected the one-page PDF: Borrower Type changes from Not recorded to Allottee while all compared figures remain equal.

[PDF preview](../output/reports/allottee-fix-2026-11-25/allottee-final-sheet-preview.pdf), [page image](../output/reports/allottee-fix-2026-11-25/printed-preview.png), [context](../output/reports/allottee-fix-2026-11-25/document-context.json).

This is a local rendered preview using the published template, not an end-to-end stored document generated through the business workflow. No document-generation endpoint or physical printing was executed. No business document was added to the test loan. Production template/renderer verification remains a release check.

## Test-data cleanup and retained side effects

AN300023 is dummy staging record 36383139-36fd-437b-ab35-a33de6797ae3. Compared restoration against baseline for classification, loan type, input mode/amount, terms, add-on months, due/release/first-payment dates, principal, processing/admin/stamp/notary/security fees, deductions, net, total interest/loan, amortization, discounts and other deductions: no differences. Classification remains null, not guessed Seafarer.

Normal recomputation history remains: versions 36–39, LRA auto-approval/witness/hash timestamps, audit events and refreshed computation pins. Restoring inputs does not remove that history. Generated documents/PDC counts remain zero and briefing was not acknowledged before/after. The Committee and CSA editable-selection fixtures were not saved, voted on or moved through workflow. Browser task closed after verification.

## Client-document wording

The Seafarer calculator now distinguishes Seafarer and Allottee borrowers. The selection is saved with the computation and shown in the relevant role summaries and Final Computation Sheet. Switching the type passed staging checks without changing loan amounts, fees or payment dates. Older records remain unclassified until staff explicitly select a type. Production release and final deployment verification are pending.

## Remaining

- [ ] Review/release the migration before the frontend/API code, then verify the deployed production role flows and document generation before closing the production report.
- [ ] Confirm live CSA initial save and Committee adjustment during release regression, if required; current write evidence for these paths is automated service testing.
- [ ] Do not infer eligibility, extra mandatory documents, name swapping or signatory changes. Obtain client policy if those behaviors are separately requested.
- [ ] Resolve unrelated existing lint/TypeScript/security advisories separately.
