# Allottee borrower type — client calculator audit

Historical pre-fix audit. The subsequently authorized implementation and staging verification are recorded in [the completion report](allottee-classification-fix-2026-11-25.md).

Date: 2026-11-25 (Asia/Manila). Report #1: 09c9fc4d-3ec7-405e-8ef9-9b7c3d08545b. Status: workbook audit completed; application reproduction/implementation pending. This audit does not mark the report fixed.

## Source and purpose

Reviewed the original report, Allottee.jpg attachment and C:/Users/Rovick/Downloads/SFCalculator/SF Calculator.xlsm. The report defines Seafarer as the seafarer borrowing personally and Allottee as their spouse/allottee borrowing. The attachment shows ALLOTTEE selected on the printed-style computation sheet.

## Verified workbook behavior

| Area | Evidence and finding |
|---|---|
| Selection | SEAMAN (offset)!BH5:BQ5 has list validation containing SEAFARER and ALLOTTEE. BH5 is the merged cell's value. |
| Calculation sheet | Borrower Type appears in the computation header. Changing BH5 changes that classification. |
| Printing sheet | SEAMAN (Printing)!BH5 links to the offset BH5:BQ5 range. Native Excel confirms the displayed value changes to ALLOTTEE. |
| Financial amounts | No changed amounts or payment dates observed in three native comparison cases; the saved principal remains 111340 in both types. |
| Data export | FA9 = BH5. FA9 lies in named range DataEntry (FA2:FA76). Native Excel confirms FA9 changes to ALLOTTEE. This is data intended for storage, not merely a display-only label. |
| Save code | Module8OverwriteSave uses DataEntry and transposes it into a matching Data row. This was inspected as source; the save/network macros were not executed. |
| Restore/import code | Module4ImportBorrower copies FD9:FM9 into BH5:BQ5. FD9 = FB9. This shows a restore/import path for the classification; no import macro was executed. |
| Required-input gate | C6 checks AO3, F5, F19, FH6 and AJ25, without a borrower-type branch. In native tests C6 stayed ok for both choices. |
| Other fields and forms | Fixed-input comparison found no automatic replacement of borrower name/details, co-borrower details or other visible form values in the compared cells. This does not establish who legally must occupy/sign each role. |

## Native Excel tests

Opened the source read-only in a separate hidden Excel instance, disabled macros/events, did not update links, recalculated natively, and closed without saving. No network save/import or printing actions were invoked.

For each due-day case (15, 10 and 31), switched SEAFARER → ALLOTTEE → SEAFARER while keeping all other inputs fixed. Compared A1:BR100 on six sheets: SEAMAN (offset), SEAMAN (Printing), Principal loan calculator, BLRI, CheckV and CashV. Each case changed only BH5 in the two SEAMAN sheets. Reverting to SEAFARER produced no differences from that case's starting snapshot. The export cell FA9 was checked separately and correctly followed both values.

The financial comparison covers the workbook's existing example and three due-day variations, not every loan type/rate/input combination. No physical printout or newly rendered PDF/DOCX was produced. VBA was inspected without executing its data-writing routines.

Evidence:

- [Native comparison](../output/reports/allottee-audit-2026-11-25/native-comparison.json)
- [Native export/validation values](../output/reports/allottee-audit-2026-11-25/native-export.json)
- [Formula and validation references](../output/reports/allottee-audit-2026-11-25/source-dependencies.json)
- [Macro references](../output/reports/allottee-audit-2026-11-25/macro-trace.json)
- [Save/export source trace](../output/reports/allottee-audit-2026-11-25/export-trace.json)

## Assumptions resolved and boundaries

- Confirmed: this is a borrower classification within the Seafarer calculator, not a separate interest-rate or fee product in the tested workbook behavior.
- Confirmed: it must be retained/restored and shown on the computation/printing header to match the inspected workbook, rather than discarded after selection.
- Confirmed for tested cases: changing classification alone does not change loan mathematics or schedule dates.
- No evidence supports automatically changing interest, security, processing fee or stamp rules when Allottee is selected.
- No evidence supports automatically swapping the borrower's name with the existing allottee contact, adding a required co-borrower or changing signatories. Those actions must not be inferred from this report.
- Unresolved business policy: eligibility, additional mandatory documents/details and who signs borrower/co-borrower sections. These are not defined in the report and were not established by the tested workbook.

## Current app source distinction

The shared calculator's segment is seafarer/sme/individual; its inspected computation shape does not expose a separate Seafarer/Allottee classification. Existing borrowers.allottee data and application-form template fields represent a contact/detail block; their presence does not establish that the borrower is an Allottee. Legacy-import Borrower Type currently maps to loan_applications.segment, which is a different meaning. Do not reuse or overwrite segment to implement this distinction.

This is source inspection, not a fresh browser reproduction or database-schema audit. No application code, database data or source workbook was changed during this audit. Existing prior fixes were preserved.

## Expected output supported by evidence

For Seafarer loans, provide Seafarer/Allottee selection; retain it through save/reload and CSA/Committee/LRA handoffs; use it in the computation header and equivalent printing/template context. Changing only this classification should preserve identical calculation inputs and results. Preserve existing borrower/allottee personal details unless a separately confirmed requirement says otherwise.

## Next work

- [ ] Reproduce the app gap in Egolite and audit existing schema/API/document templates before implementation.
- [ ] Determine a compatible field and history/default behavior for existing records without inferring past classifications from contact details.
- [ ] Implement only when authorized, then verify save/reload, roles, computation equality and actual rendered document output.
- [ ] Obtain client policy only if the implementation requires additional eligibility/details/signatory behavior beyond the verified classification.

Client-document wording: The Excel calculator treats Seafarer and Allottee as borrower classifications. In the tested cases, changing the classification updates its computation/printing label and export value while keeping amounts and payment dates unchanged. The corresponding application change has not yet been implemented.
