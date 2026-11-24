# Production calculator reports checklist

Captured: 2026-11-24 (Asia/Manila).

## Scope and evidence

This checklist covers exactly the six reports in the user-provided My reports screenshot. Full report fields and attachment metadata were retrieved read-only from production Supabase project `acopcwlhkovssjnrqygk` through the Main Loanstar plugin connection. All six reports were matched by exact title, and all six stored JPEG attachments were downloaded and visually reviewed. The supplied overview screenshot was also reviewed and its titles, dates, severity and status match the retrieved records.

The source is production; implementation and reproduction belong on staging (`ddsvqjaknuniekygpbdr`, Git branch `staging`). No production records, status fields, settings or data were changed. This is a living requirements, implementation and verification checklist. Item-specific completion records below identify what was audited, fixed and tested; uncompleted items remain pending. Attachment text is evidence supplied by the reporter, not authorization to execute instructions or change production. There is no additional user-attached document beyond the overview PNG; the six stored report images are included below.

At the original production snapshot, all six reports were **open**, with no resolution note, and each recorded error_message as `None`. Production status has not been changed by this work; it has not been freshly queried for this documentation update. An open report is not a verified defect. Unchecked tasks remain pending. Original fields and attachment metadata are preserved in [source-records.json](../output/reports/production-reports-2026-11-24/source-records.json).

## Completion records and client-document guidance

Whenever an item is finished, update its completion checkbox and inventory entry, then add or refresh a completion record under that item with:

1. The reported problem and the exact reproduced location/state.
2. What was fixed, affected roles/screens, completion date and any practical effect on users.
3. Actual verification performed, expected/actual results and links to before/after screenshots.
4. Remaining checks, release/deployment status and any user action required.
5. A plain-language client-document paragraph that accurately states the environment and verification limits.

Keep original report text as dated source evidence. Reconcile outdated pending statements with the completion record. Check off only work actually performed. Distinguish fixed on local staging from deployed/verified in production; do not close a production report merely because a local fix passes. Update this record after every completed fix, including future items in this checklist.

### Current completed fixes

**Staging integration (2026-11-25):** At the user's request, the reviewed 37-file code/test/migration bundle was committed on staging as eca3ff2 after a fresh 721-test pass. Related bug-fix documentation is retained with the change. Unrelated quick-login/cache/manual/account/email/CMS work remains excluded. Production release and baseline repository-check cleanup are still pending.

**Strict pre-push review (2026-11-25):** Production-build smoke passed on an isolated 37-file code/test/migration candidate. One introduced month-end scope regression was found and fixed so SME/Individual rules stay unchanged. 721 targeted tests pass. The strict gate remains pending: full-suite baseline and candidate share five failures, 15 standalone TypeScript diagnostics and four lint errors. Unrelated quick-login/cache and other working files are excluded; nothing staged or pushed. [Full scope, evidence and release decision](prepush-smoke-audit-2026-11-25.md).

| Item | Fixed | Verified | What remains |
|---|---|---|---|
| #1 Borrower type Allottee | Added explicit classification, versioned persistence and final-sheet row; legacy values stay unrecorded | 714 targeted tests; LRA live toggles/reload and CSA/Committee views; rendered PDF preview | Migration/code review, production verification, stored-document workflow check |
| #4 Seafarer due days | Expanded to 1–31; approved month-end clamp and recurring date recovery | 635 targeted tests; native Excel and live LRA save/reload/PDC draft | Production release and rendered-document verification |
| #2 Doc stamp computation | SF day-proration and residual Admin allocation corrected | 612 tests; LRA write/reload and CSA/Committee display checks | Release, production check, rendered document check; SME default preserved |
| #3 Change Label | Net sarado renamed to Net Desired in shared dropdown and display mapping | Dropdown checked in CSA, Committee and LRA using Ego Lite; screenshots linked under #3 | Explanation/full-breakdown browser check and optional calculation regression; review, production release and production verification |
| #5 Principal amount display | Principal Amount added below Monthly amortization in the dark results panel | Existing saved computations checked in CSA, Committee and LRA using Ego Lite; screenshots linked under #5 | Broader segment/input-mode and new-computation/recalculation checks; review, production release and production verification |
| #6 Security fee recalculation | Seafarer recomputation uses current loan-type interest for security | 573 automated tests and eight LRA egolite checks passed | Review/release, production verification and separate historical-data assessment |

## Inventory

| # | Report | Severity | Report date (Manila) | Source status |
|---|---|---|---|---|
| 1 | Borrower type Allottee — fixed on local staging; production pending | medium | 2026-11-23 | open |
| 2 | Doc stamp computation — Seafarer done on local staging; production pending | high | 2026-11-23 | open |
| 3 | Change Label — done on local staging; production pending | low | 2026-11-23 | open |
| 4 | Seafarer due days 1–31 — fixed on local staging; production pending | medium | 2026-11-23 | open |
| 5 | Shared calculator fixed on staging; separate Committee improvement completed | medium | 2026-11-19 | open |
| 6 | Security fee rate did not change after recalculation — done on local staging; production pending | high | 2026-11-19 | open |

## 1. Borrower type Allottee

- [x] Fixed on local staging: Seafarer/Allottee classification, saved/restored per computation, shown in summaries and Final Computation Sheet. Production release pending.

**Report ID:** `09c9fc4d-3ec7-405e-8ef9-9b7c3d08545b`\
**Reported location:** Calculator CSA Committee, and LRA\
**Severity/status:** medium / open\
**Created (UTC):** 2026-11-23 03:38:27.24065+00\
**Updated (UTC):** 2026-11-23 03:38:27.24065+00

**Original description:** Currently, the borrower type in the SF calculator is only Seafarer.

**Original expected behavior:** Borrower type in Seafarer has two types: Seafarer (if the borrower is the seafarer itself), and Allottee (if the borrower is the spouse or allottee of the seafarer).

**Attachment reviewed:** [Allottee.jpg](../output/reports/production-reports-2026-11-24/09c9fc4d-3ec7-405e-8ef9-9b7c3d08545b.jpg) (image/jpeg; 103194 bytes).

**Attachment findings and context:** The attachment is a reference computation sheet showing a Borrower Type dropdown with SEAFARER and ALLOTTEE; ALLOTTEE is selected. It illustrates the requested distinction, rather than proving the current application supports it.

**Expected output:** Provide Seafarer and Allottee borrower types for the Seafarer calculator across CSA, Committee and LRA. The reporter defines Seafarer as the seafarer borrowing personally and Allottee as the spouse/allottee borrowing.

**Acceptance checks and unresolved details:**

- [x] Shared selector, nullable versioned computations.seafarer_borrower_type, role API mapping and final-sheet row implemented. Existing rows were not backfilled.
- [x] Both types and all three input modes pass real-service tests for CSA/Committee/LRA. LRA actual toggles/save/reload pass; CSA/Committee live selection and saved views pass. Live CSA/Committee write regression remains a release check.
- [x] Workbook/native audit and app tests support classification/header/export only, with unchanged calculations. No eligibility/name-swapping/signatory rule was inferred; those policies remain outside the reported fix.

**Verification status (2026-11-25):** Fixed and verified on local staging. 714 targeted tests pass. Live LRA toggles preserved financial/date values; CSA/Committee show the saved classification. A local PDF preview using the published Final Computation Sheet template shows Not recorded → Allottee with identical figures. Test inputs/classification restored to the original null state; normal v36–v39 audit/approval history remains. Production untouched. [Full completion, screenshot/PDF evidence, limitations and client wording](allottee-classification-fix-2026-11-25.md).

- [ ] Review/release the migration and code, then verify production and the stored document-generation workflow before closing the report.
- [ ] Resolve existing unrelated lint/TypeScript/advisor findings separately; targeted test success is not a claim that global checks pass.

## 2. Doc stamp computation

- [x] **Done on local staging for Seafarer (2026-11-25):** Reproduced, fixed and verified against the supplied SF workbook. [Full completion record and screenshots](doc-stamp-fix-2026-11-25.md). Production release remains pending.

**Report ID:** `95d7414b-e2be-487d-8ec5-faa82da6e892`\
**Reported location:** Calculator CSA Committee, and LRA\
**Severity/status:** high / open\
**Created (UTC):** 2026-11-23 03:10:46.867837+00\
**Updated (UTC):** 2026-11-23 03:10:46.867837+00

**Original description:** Computation is based only on the Principal Amount x 0.75%

**Original expected behavior:** There are 2 computations depending on the term's number of days. If the loan term is 1 year (365 days) or more, the formula is Principal Amount x 0.75%. However, if it is less than a year, it is Principal Amount x 0.75% x (No. of days/365).

**Attachment reviewed:** [Doc Stamp Computation..jpg](../output/reports/production-reports-2026-11-24/95d7414b-e2be-487d-8ec5-faa82da6e892.jpg) (image/jpeg; 67062 bytes).

**Attachment findings and context:** The attachment states the same two formulas as the report and gives examples: PHP 100,000 for at least 1 year gives PHP 750.00; for 90 days it gives PHP 184.93. These are reporter-supplied requirements, not independently verified tax/legal guidance.

**Expected output:** Per the report: for a term of at least 365 days, principal × 0.0075; below 365 days, principal × 0.0075 × (term days / 365).

**Acceptance checks and unresolved details:**

- [x] Confirm the supplied SF workbook uses principal and actual calendar days from release to final scheduled payment (end minus start), including add-on months and leap years.
- [x] Verify final-centavo rounding and SF scope. Actual SME workbooks have an opt-in ProrateDS switch set to NO; their default full-year/No DS & Notary rules remain unchanged.
- [x] Test 90/364/365/366-day cases in egolite and automated tests; 100,000 over 90 days now gives 184.93. Client workbook 111,340 over 210 days gives 480.44.
- [x] Verify actual LRA recomputation/reload and consistent CSA/Committee saved-result displays. All three write paths, both net modes and printed-document context are automatically tested.
- [ ] Generate/visually inspect an actual new output document during release validation; printing-context tests do not prove rendered or physical printing.

**Verification status:** Fixed/verified on local staging for Seafarer. 612 targeted tests and scoped lint pass. Nine primary LRA write scenarios plus CSA/Committee display checks pass. Repository-wide TypeScript still reports 16 diagnostics in unrelated files. Native Excel printing and generated-document rendering were not executed. Production untouched.

### Completion record for client documentation — 2026-11-25

**Fixed:** Seafarer stamp uses principal × 0.75% × min(actual release-to-final-payment days, 365) / 365, rounded once to centavos. The SF fixed fee bundle is preserved by adjusting residual Admin Cost. This changes stamp/admin allocation, not net proceeds solely because of proration.

**Verified:** The source workbook's formula and printing cell links were inspected. 612 tests passed, including real CSA/Committee/LRA services, calendar boundaries, both net modes, SME controls and document-template context. Egolite confirmed nine primary LRA recalculations/restoration cases and the matching saved stamp in CSA and Committee. [Evidence and limitations](doc-stamp-fix-2026-11-25.md).

**Proof:** [LRA 90-day case](../output/reports/doc-stamp-2026-11-25/01-90-days.png), [CSA](../output/reports/doc-stamp-2026-11-25/csa-after.png), [Committee](../output/reports/doc-stamp-2026-11-25/committee-after.png), [Client workbook case](../output/reports/doc-stamp-2026-11-25/05-client-workbook.png).

**Client-ready wording:**

> Documentary stamp for Seafarer loans now follows the supplied calculator: terms shorter than 365 days are prorated using actual days from release to final scheduled payment; 365 days or longer uses the full 0.75%. The 100,000/90-day example now gives 184.93. The correction was tested in local staging, including saved values visible under CSA, Committee and LRA. Production deployment is pending.

**What to do next:**

- [ ] Review/release and verify the deployed production flow before closing the production report.
- [ ] Generate/inspect a new client document; template context is tested, but output rendering/physical printing is unverified.
- [ ] Review historical incorrect stamp allocations separately before any signed/released-loan correction.
- [ ] Resolve unrelated existing repository TypeScript diagnostics separately.

Original QA inputs were restored. Stamp/admin allocations intentionally remain corrected, net release and other financial results match the baseline, and staging versions/signing history remain. No migration, production data change or source-workbook modification was made.

## 3. Change Label

**Additional verification during #6 (2026-11-25):** LRA Net Desired recomputation exercised the updated mode, and the explanation displays Net Desired in [browser proof](../output/reports/security-fee-fix-2026-11-25/04-net-desired.png). Full-breakdown tool verification remains separate.

**Update 2026-11-25:** Shared dropdown and display mapping changed to **Net Desired**. Ego Lite verified the dropdown in CSA, Committee and LRA on local staging; internal value remains NET_SARADO. [Screenshot proof and verification limits](../output/reports/change-label-verification-2026-11-25/verification.md). No recomputation or production deployment performed. The original audit below describes the pre-fix state. Optional broader regression checks are tracked separately below; production deployment remains pending.

- [x] **Done on local staging (2026-11-25):** Change the label to Net Desired; verify the dropdown in CSA, Committee and LRA using Ego Lite and screenshot evidence.

- [x] Reproduction and source audit completed on 2026-11-24: **Net sarado** is visible in the Input mode dropdown under CSA, Committee and LRA quick-login accounts in local staging. Confirmed low-severity terminology mismatch with requested **Net Desired**; no calculation error established. Shared component also retains the old display mapping for explanation/full-breakdown text (source only). See [role evidence, scope and limitations](change-label-reproduction-audit-2026-11-24.md). This is the pre-fix finding; implementation and dropdown retest were completed on 2026-11-25 as noted above. Production status is unchanged.

**Report ID:** `04418785-25c2-4cd5-bb4e-68230aa46f42`\
**Reported location:** Calculator CSA Committee, and LRA\
**Severity/status:** low / open\
**Created (UTC):** 2026-11-23 02:15:02.088588+00\
**Updated (UTC):** 2026-11-23 02:15:02.088588+00

**Original description:** Dropdown name Net Sarado

**Original expected behavior:** Change to Net Desired

**Attachment reviewed:** [Net Sarado.jpg](../output/reports/production-reports-2026-11-24/04418785-25c2-4cd5-bb4e-68230aa46f42.jpg) (image/jpeg; 33181 bytes).

**Attachment findings and context:** The attachment shows the Input mode dropdown on a DIRECT computation with 'Net sarado', 'Net less security' and 'Principal'. The report spells the existing label 'Net Sarado'; the image uses 'Net sarado'.

**Expected output:** Change the displayed input-mode label to 'Net Desired'.

**Acceptance checks and unresolved details:**

- [x] Locate the label across CSA, Committee and LRA and use the requested wording consistently (dropdown browser-verified; explanation mapping updated in source).
- [x] Preserve the underlying NET_SARADO identifier and calculation code; only the two display strings changed.
- [ ] Optional broader regression: recompute and confirm saved input-mode restoration and identical results. Not performed in this label-only browser verification.

**Verification status:** Done on local staging for the requested label change. Reproduced, fixed, and dropdown retested in CSA, Committee and LRA with screenshots. Explanation/full-breakdown browser testing and calculation regression were not performed. Not deployed; production report remains open.

### Completion record for client documentation — 2026-11-25

**Problem:** Input mode was labeled Net sarado in the CSA, Committee and LRA calculators. The client requested Net Desired.

**Fixed:** Updated the shared dropdown label and explanation/full-breakdown display mapping to Net Desired. Internal mode NET_SARADO, stored computations and calculation formulas were not changed. This is a terminology update; staff should use Net Desired for the same input mode previously named Net sarado.

**Verified:** Ego Lite browser checks confirmed the new dropdown wording in all three roles on local staging. No recomputation was submitted. The explanation mapping change was inspected in source; its rendered output was not separately browser-tested.

**After-fix evidence:** [CSA](../output/reports/change-label-verification-2026-11-25/csa.png), [Committee](../output/reports/change-label-verification-2026-11-25/committee.png), [LRA](../output/reports/change-label-verification-2026-11-25/lra.png). [Before-fix audit and screenshots](change-label-reproduction-audit-2026-11-24.md).

**What to do next:**

- [ ] Verify rendered explanation/full-breakdown wording when the saved mode is NET_SARADO.
- [ ] If broader regression is required for release, confirm existing mode restoration and unchanged calculation results.
- [ ] Review and release the frontend change through the agreed GitHub deployment process.
- [ ] Verify the wording in production, then update the production report after release is confirmed and authorized.

No database migration or staff data re-entry is required. Production deployment has not occurred in this work.

**Client-document wording (current staging status):**

> The calculator input option previously labeled “Net sarado” has been renamed to “Net Desired.” The updated dropdown was verified in the CSA, Committee and LRA calculators in our local staging test environment. This is a wording change; the calculation mode and formulas remain unchanged. The update is awaiting production deployment.

## 4. Calculator Seafarer additional due date day

- [x] Implemented on local staging: calendar days 1–31, including the 10th, with the user-approved month-end clamp.

**Report ID:** `89ce2a58-83f5-46e0-a229-766209e5cf1a`\
**Reported location:** Calculator CSA Committee, and LRA\
**Severity/status:** medium / open\
**Created (UTC):** 2026-11-23 02:06:26.474922+00\
**Updated (UTC):** 2026-11-23 02:06:26.474922+00

**Original description:** Additional due date on the 10th

**Original expected behavior:** Open for the whole month, so if future dates change, they can be accommodated. Another option is that it could be enrollable.

**Attachment reviewed:** [Due Day.jpg](../output/reports/production-reports-2026-11-24/89ce2a58-83f5-46e0-a229-766209e5cf1a.jpg) (image/jpeg; 52136 bytes).

**Attachment findings and context:** The attachment shows the CSA Due date dropdown with only 5th, 15th and 25th. The description requests the 10th, while expected behavior asks for the whole month or an enrollable/configurable list.

**Approved expected output (2026-11-25):** A clean 1–31 list across the Seafarer calculators, including the 10th and 24th. If a selected day does not exist, use that month's last day and return to the selected day in later months. The user explicitly chose month-end clamping after native Excel testing showed unexpected rollover; configurable enrollment is not part of this approved approach.

**Acceptance checks and unresolved details:**

- [x] User selected all calendar days (1–31); no enrollment/maintenance UI required.
- [x] Automated real-service tests cover CSA/Committee/LRA saved computations and schedule generation; LRA live save/reload verified. See completion record for the narrower role UI evidence.
- [x] Confirmed month-end policy; tested February/leap years and year rollover, including recovery from Feb 28/29 to March 31.
- [x] Cutoff/add-on cases pass; live LRA PDC draft matches Feb 28, Mar 31, Apr 30, May 31 after recalculation.

**Verification status:** Fixed on local staging. 635 computation/CSA/LRA/negotiation tests pass. Native Excel input testing completed read-only without saving. LRA live day-10 save/reload and day-31/PDC draft checks pass; original test inputs/financial values restored. Broader run: 898/901 pass, with three date-sensitive move-of-payment failures. Repository-wide TypeScript retains 16 unrelated diagnostics. [Completion, evidence, limits and client wording](seafarer-due-day-fix-2026-11-25.md).

- [ ] Review/release, then verify production and rendered documents before closing the production report.

## 5. Calculator no principal amount

**New follow-up found during #2 (2026-11-25):** Committee has a separate read-only From CSA summary that still lacks Principal Amount. The previous fix covers the shared editable calculator and CSA/LRA panels. [Observed screenshot](../output/reports/doc-stamp-2026-11-25/committee-after.png).

- [x] Additional user-requested improvement completed on local staging (2026-11-25): Committee's read-only From CSA summary now shows Principal Amount. This was discovered during QA, not reported by the client. Egolite verified 201,100.00 against the saved computation after reload. [Completion record and screenshot](committee-summary-principal-2026-11-25.md). Production release pending.

**Audit update 2026-11-25:** Reproduced on local staging in CSA, Committee and LRA. The missing field is specifically the **Principal Amount row in the dark results panel**, between Monthly amortization and Processing Fee. Principal exists in the white explanation; no missing stored principal or calculation defect was established. [Audit and screenshot evidence](principal-amount-reproduction-audit-2026-11-25.md). Implementation and role verification are now complete on local staging; see the completion entry below. Original notes describe the pre-fix state.

- [x] **Done on local staging (2026-11-25):** Principal Amount added below monthly amortization; browser-verified in CSA, Committee and LRA. [Screenshots and verification limits](../output/reports/principal-amount-fix-2026-11-25/verification.md). Production deployment pending.

**Report ID:** `70a15fd6-7f60-4c82-95d5-c8f9700bca14`\
**Reported location:** Calculator CSA Committee, and LRA\
**Severity/status:** medium / open\
**Created (UTC):** 2026-11-19 07:56:39.810362+00\
**Updated (UTC):** 2026-11-19 07:56:39.810362+00

**Original description:** No information is available on the principal amount.

**Original expected behavior:** Add the principal amount

**Attachment reviewed:** [principal amount.jpg](../output/reports/production-reports-2026-11-24/70a15fd6-7f60-4c82-95d5-c8f9700bca14.jpg) (image/jpeg; 79128 bytes).

**Attachment findings and context:** The attachment already shows a highlighted 'Principal Amount' row with PHP 101,215.61, monthly amortization PHP 19,554.86 and net released PHP 90,000.00. This may be a desired example or a different screen/state; it does not demonstrate the missing row described in the report.

**Expected output:** Display the computed principal amount clearly in the relevant calculator result across CSA, Committee and LRA.

**Acceptance checks and unresolved details:**

- [ ] Identify the exact affected role, loan type, input mode, page and calculation state; establish whether the image is expected output or a screen where the row is already present.
- [x] Reproduce the reported omission before changing behavior — confirmed in the dark output panel under CSA, Committee and LRA; see the dated audit.
- [ ] Verify principal is visible and correct after initial calculation, recalculation, save and reload, including each supported input mode.
- [x] Distinguish principal from net released and total loan; the new row reads the computed principal, with existing saved values verified in all three roles.

**Verification status:** Fixed and verified in all three affected role calculators on local staging using existing saved computations. CSA/Committee: 295,000.00; LRA: 201,100.00. New computation, recalculation and other segment/input-mode combinations remain untested. No production deployment.

### Completion record for client documentation — 2026-11-25

**Problem:** The dark calculator results panel omitted the principal row, going directly from Monthly amortization to Processing Fee. Principal was available in the white explanation, so this was a summary display gap rather than missing loan data.

**Fixed:** Added Principal Amount directly below Monthly amortization and above Processing Fee in the shared results panel used by CSA, Committee and LRA. It displays the saved computed principal, formatted to two decimal places. It does not derive the result from the unsaved Amount input. Existing computations display the new row without recomputation or a database migration.

**Verified:** In Ego Lite on local staging, CSA and Committee displayed 295,000.00 for AN300024 and LRA displayed 201,100.00 for AN300023. Values match the previously observed saved principal. All three role screenshots were visually inspected. TSX syntax check reported zero errors; git diff --check passed. No new computation or recalculation was submitted.

**After-fix evidence:** [CSA](../output/reports/principal-amount-fix-2026-11-25/csa-fixed.png), [Committee](../output/reports/principal-amount-fix-2026-11-25/committee-fixed.png), [LRA](../output/reports/principal-amount-fix-2026-11-25/lra-fixed.png). [Before-fix audit and screenshots](principal-amount-reproduction-audit-2026-11-25.md). [Verification details](../output/reports/principal-amount-fix-2026-11-25/verification.md).

**What to do next:**

- [ ] Complete broader checks for other loan segments/input modes, new computation and recalculation if required for release; these combinations were not individually tested.
- [ ] Review and release the frontend change through the agreed GitHub deployment process.
- [ ] Verify the principal row on production in all affected role calculators, then update the production report after release is confirmed and authorized.

No staff data re-entry is required for existing saved computations. Production deployment has not occurred in this work.

**Client-document wording (current staging status):**

> A “Principal Amount” row has been added below “Monthly amortization” in the calculator results panel. This makes the principal easier to find alongside the other loan figures. The display was verified using existing saved computations in the CSA, Committee and LRA calculators in our local staging test environment. Existing loan values were not changed. The update is awaiting production deployment.

## 6. Security fee rate did not change after recalculation

**Pre-fix audit 2026-11-25 — confirmed bug:** An actual LRA staging recomputation from DIRECT to PROMO changed interest from 1.99% to 1.75% while keeping security at 1.99%; the mismatch persisted after reload. For principal 201,100.00, security remained 4,001.89 instead of 3,519.25 (482.64 difference). Shared override logic explicitly prefers the previous security_fee_rate. Client workbook formulas and relevant VBA were inspected read-only; helper security calculations use current interest, but its main displayed security amount is stored/imported, so automatic native Excel refresh was not established. [Full findings, screenshot proof, workbook references and next steps](security-fee-recalculation-audit-2026-11-25.md).

- [x] Reproduce through LRA, confirm persisted values, quantify the amount difference and trace the cause.
- [x] Capture before/after screenshots and inspect the client's SF Calculator.xlsm.
- [x] Restore the test application's original financial inputs; QA computation versions/history remain in staging.
- [x] Fix Seafarer security-rate resolution in the shared LRA/Committee service. All 573 targeted regression tests pass; eight LRA browser checks pass. [Completion record and screenshots](../output/reports/security-fee-fix-2026-11-25/verification.md).

**Client-document status:** Fixed and verified on local staging; production release pending. No production change. This is an actual fee/net-release calculation issue, not only a mismatched display label. Preserve the workbook qualification and test-data side effects when drafting the client document.

- [x] **Done on local staging (2026-11-25):** Investigated, fixed, regression-tested and verified in egolite. Production deployment remains pending.

**Report ID:** `d5e35194-881d-46ab-90a8-426d7f7f9371`\
**Reported location:** Calculator LRA recomputation\
**Severity/status:** high / open\
**Created (UTC):** 2026-11-19 03:55:37.357263+00\
**Updated (UTC):** 2026-11-19 03:55:37.357263+00

**Original description:** The security fee rate did not change after recalculation. The interest rate was changed during recalculation to another rate

**Original expected behavior:** It should follow the current calculator interest rate when recalculating

**Attachment reviewed:** [sec fee rate.jpg](../output/reports/production-reports-2026-11-24/d5e35194-881d-46ab-90a8-426d7f7f9371.jpg) (image/jpeg; 66955 bytes).

**Attachment findings and context:** The LRA breakdown image shows principal PHP 67,979.34, security fee PHP 1,529.54 at 2.25%, and total interest PHP 7,137.83 calculated using 1.75% over 4 months plus 2 add-on months. The footer likewise shows Interest 1.75%/mo and Security 2.25%. This supports a visible rate mismatch; the cause and exact original inputs remain unverified.

**Expected output:** Per the reporter, the security fee rate should follow the current calculator interest rate during LRA recalculation.

**Acceptance checks and unresolved details:**

- [x] Reproduce stale-rate behavior in LRA and retest the fix: UI 1.99% → 1.75%, then 2.25%; automated tests also cover 2.25% → 1.75%. The exact original loan was not recreated.
- [x] Apply the reporter's Seafarer rule: security follows the current selected loan-type interest rate. No separate Seafarer security-rate input is exposed in this recomputation flow; SME/Individual rules remain separate.
- [x] Verify the pictured principal's fee: 67,979.34 × 1.75% = 1,189.64 after rounding (corrects the earlier checklist arithmetic). Regression tests cover this value; both net modes also verify principal re-solving.
- [x] Verify LRA breakdown/footer, actual fee, deductions, net released and reload behavior in egolite; automated regression covers CSA and Committee service paths. Committee UI recomputation was not exercised.

**Verification status:** Fixed on local staging. 573 automated tests pass (including 24 new real-service/engine tests); eight LRA browser checks pass. Committee service tested automatically; live Committee UI recomputation not run. Test loan financial baseline restored; QA history retained. No production release.

### Completion record for client documentation — 2026-11-25

**Fixed:** Seafarer security rate now follows the selected loan type's current interest rate in LRA/Committee recomputation. Real fee, deductions, net release and net-mode principal solving use that rate. SME/Individual behavior was preserved.

**Verified:** 573 automated tests passed, including rate decreases/increases, unchanged/zero/missing prior rates, first computation, all input modes and SME/Individual controls. Eight egolite checks passed: rate decrease + reload, increase, repeat, Net Desired, Net less security + reload, baseline restoration + reload, required reason and Cancel. [Detailed results and limitations](../output/reports/security-fee-fix-2026-11-25/verification.md).

**Screenshot proof:** [1.75% matched rates](../output/reports/security-fee-fix-2026-11-25/01-decrease-promo.png), [2.25% increase](../output/reports/security-fee-fix-2026-11-25/02-increase-bronze.png), [Net Desired](../output/reports/security-fee-fix-2026-11-25/04-net-desired.png), [Net less security](../output/reports/security-fee-fix-2026-11-25/05-net-less-security.png).

**Client-ready wording:**

> The Seafarer security fee calculation has been corrected so it follows the current interest rate when LRA recalculates a loan. Rate increases, decreases, repeated recalculations and all three input modes passed local staging browser checks, including saved results after reload. The shared Committee calculation path passed automated regression tests. Production deployment is pending; existing production loans have not been recalculated.

**What to do next:**

- [ ] Review and release the code through the agreed GitHub deployment process.
- [ ] Verify deployed LRA/Committee behavior with approved production test records.
- [ ] Assess historical mismatches separately before deciding on signed/released-loan corrections.
- [ ] Close the production report only after authorized deployment and verification.

No database migration is required. The QA loan's original financial fields were restored; staging versions/history and refreshed signing timestamps remain. No production or workbook change was made.


## Completion and handover

- [x] Match every report shown in the supplied overview screenshot to a production record.
- [x] Preserve original descriptions, expected behavior, severity, status, timestamps and attachment metadata.
- [x] Review all six stored attachments and record ambiguities.
- [ ] Resolve the report-specific open questions before implementing dependent behavior.
- [ ] Reproduce each issue on staging with the affected role and calculation inputs.
- [ ] Record code/schema changes, actual results and evidence for each completed item.
- [ ] Retest across the affected roles; keep production report status unchanged until separately authorized.

Priority should start with the two reporter-rated high items (documentary stamp and LRA security fee), followed by medium items and the low label change. No effort estimates or root causes have been asserted without investigation.
