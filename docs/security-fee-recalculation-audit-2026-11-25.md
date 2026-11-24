# LRA security fee recalculation — reproduction and workbook audit

Date: 2026-11-25 (Asia/Manila).
Report: `d5e35194-881d-46ab-90a8-426d7f7f9371`, high severity, open in the original production snapshot.

**Follow-up:** The fix and multi-scenario verification were completed on local staging after this reproduction audit. See [completion record and screenshots](../output/reports/security-fee-fix-2026-11-25/verification.md). The findings and pending statements below describe the pre-fix investigation; production remains unchanged.

## Finding

**Confirmed persisted calculation bug on local staging.** LRA updates interest to the newly selected loan type's rate but preserves the previous computation's security fee rate. A real UI recalculation saved the mismatched rates; a page reload and authenticated GET returned the same mismatch.

The report attachment shows interest 1.75% with security 2.25%. This audit reproduced the same stale-rate behavior with a different existing staging baseline: interest changed from 1.99% to 1.75%, but security remained 1.99%. We did not reproduce the exact report's loan inputs or assert an exact whole-workbook match.

## Environment and test scope

- App: localhost:3000, existing local staging checkout.
- Database target: ddsvqjaknuniekygpbdr.supabase.co; confirmed from the effective app configuration in the current investigation context.
- Role: existing UAT LRA browser session; role visible in screenshots.
- Browser: Ego Lite, task space 4; closed after reproduction and restoration.
- Existing staging QA application: AN300023 / 36383139-36fd-437b-ab35-a33de6797ae3; borrower BN300023, Seafarer, release file at pdc_encoding.
- No production query/write was needed for reproduction. Original report JSON and attachment were read from the previously captured production evidence.
- No application code or client workbook was changed. Macros were inspected as text, not executed.

## Reproduction steps and actual results

1. Open the LRA test application and read its calculator GET response.
2. Verify wouldClear reports 0 generated documents, 0 PDC checks and no briefing acknowledgement. The UI confirmation independently showed the same.
3. Record original computation v13: DIRECT, interest/security 1.99%, principal input 201100, terms 4, add-on 0, due day 15, release 2026-12-12. Existing 100% interest discounts on months 1–3 were preserved.
4. Select PROMO (current staging configuration: interest/security 1.75%, PF 8%).
5. Enter a QA reproduction reason and click Recalculate → Yes, recalculate.
6. Read the resulting saved computation v14 and capture its displayed breakdown.
7. Reload and read GET again: interest 0.0175, securityFeeRate 0.0199 and fee 4001.89 persist.

| Metric | Before: DIRECT v13 | After: PROMO v14 | Expected under report's rule |
|---|---:|---:|---:|
| Principal | 201,100.00 | 201,100.00 | 201,100.00 |
| Interest rate | 1.99% | 1.75% | 1.75% |
| Security fee rate | 1.99% | **1.99% (stale)** | **1.75%** |
| Security fee | 4,001.89 | **4,001.89** | **3,519.25** |
| PF rate | 10.00% | 8.00% | 8.00% |
| Total deductions | 22,283.71 | 18,898.19 | 18,415.55 if only the security rate is corrected |
| Net released | 178,816.29 | 182,201.81 | 182,684.45 if only the security rate is corrected |

Independent arithmetic: 201100 × 0.0199 = 4001.89; 201100 × 0.0175 = 3519.25. The stale fee is 482.64 higher in this test. This is a real amount discrepancy, not only an incorrect rate label.

Changing loan type also changes the PF rate, so the net-release change between the two actual versions is not attributable solely to security. The expected-column comparison keeps the new PROMO inputs and other deductions fixed and changes only security. Existing origination discounts affect total interest, not this one-time security-fee comparison.

## Evidence

- [Before recalculation](../output/reports/security-fee-audit-2026-11-25/before-recalculation.png).
- [After recalculation: interest 1.75%, security 1.99%](../output/reports/security-fee-audit-2026-11-25/after-recalculation.png).
- [Original reported image: interest 1.75%, security 2.25%](../output/reports/production-reports-2026-11-24/d5e35194-881d-46ab-90a8-426d7f7f9371.jpg).
- Local authenticated response snapshots: before.json, after.json and restored.json under output/reports/security-fee-audit-2026-11-25. These are QA investigation evidence, not a client data attachment.
- Screenshots were visually inspected without altering their content.

## Client workbook comparison

Source: C:/Users/Rovick/Downloads/SFCalculator/SF Calculator.xlsm. Read-only XML/formula extraction was cross-checked with openpyxl to expand Excel shared formulas. Relevant formula/cached-value evidence is saved in workbook-formula-trace.json. Cached workbook values are dated saved values, not a live Excel recalculation.

Verified formulas:

| Sheet / cell | Observed formula or value | Meaning |
|---|---|---|
| SEAMAN (offset)!C4 | FRESH NNO BRONZE | Saved selected loan type |
| SEAMAN (offset)!F4 | =IFERROR(VLOOKUP(C4,EJ3:EL100,2,FALSE),"") | Interest comes from selected loan type; saved value 2.25% |
| SEAMAN (offset)!EK5 | 0.0199 | DIRECT interest lookup rate |
| SEAMAN (offset)!EK18 | 0.0175 | PROMO interest lookup rate |
| SEAMAN (offset)!Q12 | =BM13*F4 | Principal-based calculation references current interest rate |
| Principal loan calculator!I5 | ='SEAMAN (offset)'!F4 | Helper uses the same current rate |
| Principal loan calculator!T5 | =IF($J$14>0,S5*$I$5,0) | Positive security input enables fee calculation using current interest |
| Principal loan calculator!T16 | =IF($J$14>0,S16*$I$5,0) | Same rate dependency in later helper iteration |
| SEAMAN (offset)!F14 | Stored number 1284.76016514; no formula | Main security-fee input is a stored amount |
| SEAMAN (offset)!AZ15 | =IF(F5<=0,"",F14) | Main displayed security fee reads that stored amount |

Important qualification: the helper formulas support using the current interest rate in security-fee calculations, but the workbook's main displayed security-fee amount is not itself a live rate formula. VBA Module4ImportBorrower copies FD16 into F14 using PasteSpecial xlPasteValues; data-entry/save macros also clear F14. Relevant VBA excerpts were extracted to vba-security-trace.json. This audit did not run Excel or its macros, and does not establish that changing the loan type automatically refreshes F14 in the client's native workflow. An end-to-end Excel workflow parity claim would require that separate check.

The app defect is independently confirmed against the reporter's explicit requirement and persisted runtime values; it does not depend on assuming every workbook cell automatically refreshes.

## App source trace and root cause

1. LRA loan-type GET maps securityFeeRate to the current loan type's interest_rate: src/app/api/lra/loan-types/route.ts:51. PROMO GET correctly returns both 0.0175.
2. LRA POST invokes recomputeAtRelease, which calls lraRecomputeComputation (src/lib/lra/release-service.ts around 1592).
3. lraRecomputeComputation calls persistOverrideComputation, also used by Committee (src/lib/negotiation/service.ts around 661).
4. persistOverrideComputation fetches the active computation including security_fee_rate.
5. For Seafarer, interestRate is selected from the newly chosen loan type.
6. securityFeeRate around src/lib/negotiation/service.ts:565 instead uses zero for SME, otherwise existingComp.security_fee_rate when present, only falling back to the new loan type if no saved rate exists.
7. The computation engine consumes that stale security rate for the actual fee and principal solving. The saved snapshot and UI therefore faithfully show the incorrect combination.

This establishes an input-resolution defect in the shared override/recomputation path, not a browser refresh problem and not a loan-type API response problem.

Committee shares the service and is a source-identified risk, but a Committee rate-change flow was not executed here. SME zero-security behavior and Individual custom-rate handling need separate checks before designing the fix. No additional production impact count was attempted.

## Staging side effects and restoration

A real recomputation was necessary to verify persistence. It created v14, switched active computation/release queue references, auto-witnessed the new computation under UAT LRA and recorded the normal LRA workflow history. Counts confirmed that no generated documents or PDC rows existed to be removed and no acknowledged briefing existed to reset.

After evidence capture, a second UI recomputation selected the original DIRECT loan type with a restoration reason, producing v15. The verified fields match the v13 baseline: loan type, mode, input amount, terms/add-on, PF/interest/security rates, principal, security fee, net released, deductions, amortization, total loan/interest and release/payment dates. The test file is back to its original financial figures.

This is financial-input restoration, not erasure of the audit: v14 and v15 remain in staging history; the active version, witness/signature timestamps and workflow audit references were naturally refreshed. Production and the supplied workbook were not changed.

## Checklist and next work

- [x] Review the report and original attached evidence.
- [x] Inspect the client's actual workbook formulas and relevant VBA excerpts.
- [x] Reproduce an actual LRA recalculation in staging.
- [x] Verify the mismatched rates persist after reload.
- [x] Capture screenshot proof and quantify the fee difference.
- [x] Trace the saved-rate precedence causing the error.
- [x] Restore the original staging financial inputs through the UI.
- [ ] Implement a reviewed fix; no code change was requested or applied in this audit.
- [ ] Verify both higher/lower loan-type rate changes, unchanged-rate recalculation, existing/first computation, supported input modes and rounding.
- [ ] Check Committee's shared path and preserve intentional SME/Individual business rules.
- [ ] Verify deductions/net proceeds/principal solving use the corrected security rate; avoid a display-only fix.
- [ ] Assess historical mismatched computations separately before deciding whether any stored loan correction is appropriate.
- [ ] Run any required native Excel workflow comparison without changing the original client file.

## Client-document guidance (investigation status)

The issue has been reproduced in the local staging test environment. When a Seafarer loan is recalculated in LRA with a different loan type, interest can update while the security fee retains its previous rate. This can produce an incorrect security fee and net release amount. The cause has been identified in the recomputation logic; implementation and verification of the fix are still pending. No production correction or deployment has been performed.
