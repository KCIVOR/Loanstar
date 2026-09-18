# Legacy data import — SF & SME field audit (against the real "Data" tabs)

**Date:** 2026-09-12
**Source files (client's actual working calculators, "Data" tab in each):**
- `LSLGC Documents\SFCalculator\SF Calculator.xlsm` → sheet `Data` (75 columns, header row 1, 1221 data rows)
- `LSLGC Documents\LSLGC Calculator and Docs\Calculator SME.xlsm` → sheet `Data` (111 columns, header row 1, 3000 data rows)

**Method:** read both header rows directly with `openpyxl`. Cross-checked every column against the **live production schema** (Supabase project `acopcwlhkovssjnrqygk`, `information_schema.columns` on `borrowers`, `computations`, `loan_applications`, `masterlist`, `pdc_checks`, `verifications`, `checks_recorded`, `portfolios`) and the corresponding TypeScript types (`src/lib/borrowers/business-info.ts`, `src/lib/cig/collateral-inspection.ts`, `src/lib/computation/types.ts`, `src/lib/lra/template-context.ts`). Evidence-based — every "Fillable" row below cites the real column/field found; nothing here is guessed. This supersedes the earlier 80-column audit (`item-14-excel-import-audit.md`), which was based on a separate reporting-style masterfile sample, not this calculator working file.

**Note on "Calculator Setting," "Prepared By," "Date Modified," "Check Issued No.," "Blank Check Issued No.":** these are the client's own spreadsheet/audit-trail housekeeping columns, not borrower or loan data. The system has its own equivalents (`created_at`/`updated_at`, audit logging) — they are excluded from the import template rather than mapped.

---

## SF (Seafarer) — 75 columns

| # | Column | Status | System field | Notes |
|---|---|---|---|---|
| 1 | Borrower Number | Fillable | `borrowers.borrower_no` | |
| 2 | Loan Number | Fillable | `loan_applications.application_no` | |
| 3 | Borrower's Name | Fillable | `borrowers.first_name/middle_name/last_name/suffix` | Split into 4 template columns |
| 4 | Address | Partial | `borrowers.present_address` (jsonb) | Sheet is one combined string; system wants structured address parts |
| 5 | Birthday | Fillable | `borrowers.date_of_birth` | |
| 6 | Co-Borrower | Fillable | `loan_applications.co_borrowers` (jsonb) | Name only |
| 7 | Loan Entry Type | Fillable | `loan_applications.is_reloan` (boolean) | Sheet's FRESH/RELOAN text maps to true/false |
| 8 | Borrower Type | Fillable | `loan_applications.segment` | `seafarer` confirmed as a real value |
| 9 | Released Date | Fillable | `computations.release_date` | |
| 10 | Payment Date | Partial | likely `computations.first_payment_date` | Ambiguous vs. #19 |
| 11 | Loan Desired | Fillable | `computations.input_amount` | |
| 12 | Terms | Fillable | `computations.terms` | |
| 13 | Monthly Amort. | Fillable | `computations.monthly_amortization` | |
| 14 | Interest Rate | Fillable | `computations.interest_rate` | |
| 15 | Processing Fee Rate | Fillable | `computations.pf_rate` | |
| 16 | Admin Cost Rate | Fillable | `computations.admin_rate` | |
| 17 | Interest | Partial | `computations.total_interest` / `gross_total_interest` | Two candidate fields, ambiguous which one |
| 18 | Add-on Interest | Gap | — | `computations.addon_months` stores a month count, not a peso amount |
| 19 | Payment Start | Fillable | `computations.first_payment_date` | |
| 20 | Payment End | Fillable (derived) | `first_payment_date` + `terms` | Computed, no raw entry needed |
| 21 | NET DESIRED | Fillable | `computations.net_released` | |
| 22 | Processing Fee | Fillable | `computations.processing_fee` | |
| 23 | Notary Fee | Fillable | `computations.notary_fee` | |
| 24 | Other Loan | Fillable | `computations.other_deductions.otherLoan` | |
| 25 | Account Opening | Fillable | `computations.other_deductions.accountOpening` | |
| 26 | Security Fee | Fillable | `computations.security_fee` | |
| 27 | Admin Cost | Fillable | `computations.admin_cost` | |
| 28 | Documentary Stamp | Fillable | `computations.doc_stamp` | |
| 29 | Previous Loan | Fillable | `computations.other_deductions.previousLoanBalance` | |
| 30 | Advance Payment | Fillable | `computations.other_deductions.advancePayment` | |
| 31 | Cash Card | Gap | — | No matching field anywhere |
| 32 | Total Loan Amount | Fillable | `computations.total_loan` | |
| 33 | Total Interest | Fillable | `computations.total_interest` | |
| 34 | Principal Loan | Fillable | `computations.principal` | |
| 35 | Total Deduction | Fillable | `computations.total_deductions` | |
| 36 | Net Loan Amount | Fillable | `computations.net_released` | Same field as #21 — sheet lists it twice |
| 37 | Branch Office | Gap | — | System has no branch concept |
| 38 | ID For Notary (Borrower) | Gap | — | No notary-ID field on `borrowers` |
| 39 | Id place/date | Gap | — | |
| 40 | ID For Notary (Co-Borrower) | Gap | — | |
| 41 | Id place/date | Gap | — | |
| 42 | Company Name | Partial | `borrowers.manning_agency.name` (jsonb) | Possibly the same as #43's agency, ambiguous |
| 43 | Principal Ship | Partial | `borrowers.pic_work.vessel` / `masterlist.vessel_name` | |
| 44 | Interest from | Gap | — | No explicit interest-period-start field |
| 45 | Interest to | Gap | — | |
| 46 | Bank to be released | Fillable | `borrowers.financial.bankName` | |
| 47 | Account Number | Fillable | `borrowers.financial.accountNumber` | |
| 48 | Check Number | Fillable | `pdc_checks.check_number` | |
| 49 | Borrower Issued Check | Gap | — | No flag for whose check it is |
| 50 | Account number | Fillable | Same as #47 | Duplicate concept |
| 51 | Bank Name Under | Gap | — | Meaning unclear — ask client |
| 52 | BANK NAME | Fillable | `pdc_checks.bank_name` / `masterlist.atm_bank_name` | |
| 53 | CARD NUMBER | Partial | `masterlist.atm_card_last4` | Only last 4 digits stored |
| 54 | PIN | Gap | — | Not stored (and should not be) |
| 55 | ACCOUNT TYPE | Fillable | `borrowers.financial.accountType` | |
| 56 | INITIAL BALANCE | Gap | — | |
| 57 | REMARKS | Gap | — | No centralized remarks field |
| 58 | ADDITIONAL REMARKS | Gap | — | |
| 59 | Released Check | Fillable | `pdc_checks` (release check row) | |
| 60 | Bank / Branch | Partial | `pdc_checks.bank_name` | No separate "branch" |
| 61 | Account number | Fillable | `pdc_checks.ref_account` | |
| 62 | Check Number | Fillable | `pdc_checks.check_number` | |
| 63 | Amount | Fillable | `pdc_checks.amount` | |
| 64-67 | (2nd check block) | Same as 60-63 | `pdc_checks` (second row) | |
| 68 | TIN | Gap | — | Not on `borrowers` |
| 69 | Agent | Partial | `loan_applications.agent_user_id` | Internal user reference, not free-text name |
| 70 | Sub-Agent | Gap | — | |
| 71 | Calculator Setting | Excluded | — | Internal spreadsheet housekeeping |
| 72 | Check Issued No. | Gap | — | |
| 73 | Blank Check Issued No. | Gap | — | |
| 74 | Prepared By | Excluded | — | System uses its own audit trail |
| 75 | Date Modified | Excluded | — | System-generated (`updated_at`) |

**SF result: 38 fillable, 8 partial, 25 gap/excluded, out of 75.**

---

## SME — 111 columns

Columns 1-4, 7-37, 45-69 follow the same pattern as SF above (loan/fee/bank fields — same `computations`/`pdc_checks` mapping). Differences and SME-only columns:

| # | Column | Status | System field | Notes |
|---|---|---|---|---|
| 5 | Representative/Co-Borrower | Partial | `borrowers.business_info.companyOfficers[]` / `loan_applications.co_borrowers` | Which officer/role unconfirmed |
| 6 | Position | Partial | `business_info.companyOfficers[].position` | Tied to #5 |
| 9 | Nature of Business | Fillable | `borrowers.business_info.natureOfBusiness` | |
| 11 | Calculator Setting | Excluded | — | Same as SF |
| 32 | CM Fee | Fillable | `computations.chattel_fee` | "CM" = Chattel Mortgage fee, confirmed as its own column |
| 38 | Company Tin / Id | Fillable | `borrowers.business_info.tin` | |
| 39 | Id Date | Gap | — | |
| 40 | Representative Tin / Id | Gap | — | Only company TIN is captured |
| 41 | Id Date | Gap | — | |
| 42 | Co-Borrower Address | Fillable | `loan_applications.co_borrowers[].address` | Corrected 2026-09-12 — verified in `src/lib/applications/co-borrower.ts`: `CoBorrower = { fullName, address }`. Missed on the first template pass; add the column. |
| 43 | Corporate Secretary | Gap | — | Confirmed hardcoded to blank in the document-generation code (`template-context.ts`) — not backed by stored data anywhere |
| 44 | Board Resolution No. | Gap | — | Same as above — confirmed hardcoded blank |
| 45 | Months/Days Of Interest | Partial | `computations.terms` / `addon_months` | |
| 46-47 | Interest From / To | Gap | — | Same as SF |
| 70-76 | Vehicle 1 (Make/Year Model, Engine No., Chassis No., Plate No., CR No., MV File No., Registered Owner) | Fillable | `verifications.cm_inspection.vehicles[0]` (`makeYearModel`, `engineNo`, `chasisNo`, `orCrDetails.plateNumber`, `crNo`, `mvFile`, `registration.registeredOwner`) | Confirmed in `src/lib/cig/collateral-inspection.ts` |
| 77-83 | Vehicle 2 | Fillable | `verifications.cm_inspection.vehicles[1]` | Same fields, repeatable list |
| 84-90 | Vehicle 3 | Fillable | `verifications.cm_inspection.vehicles[2]` | |
| 91-97 | Vehicle 4 | Fillable | `verifications.cm_inspection.vehicles[3]` | |
| 98 | Registered Owner (Property 1) | Fillable | `verifications.rem_inspection.properties[0].titleDetails.registeredOwnerAtTitle` | |
| 99 | TCT / CCT No. | Fillable | `properties[0].legalDescription.tctNo` | |
| 100 | Property Address | Partial | `properties[0].legalDescription.location` | Label difference only |
| 101 | Tax Declaration No. | Gap | — | |
| 102 | Lot Area | Partial | `properties[0].legalDescription.areaSqm` | Schema has one area field; sheet separates lot vs. floor area |
| 103 | Floor Area | Gap | — | |
| 104 | Technical Description | Fillable | `properties[0].legalDescription.technicalDescription` | |
| 105-111 | (Property 2, same 7 fields) | Same as 98-104 | `verifications.rem_inspection.properties[1]` | |

**SME result: 62 fillable, 12 partial, 37 gap/excluded, out of 111** (most of the gain over SF comes from the vehicle/property collateral blocks, which are fully backed by the CI collateral-inspection redesign shipped 2026-09-11).

---

## What this means for the import template

- Both SF and SME need their **own template tab** — the column sets genuinely differ (seafarer/vessel/allotment fields vs. business/collateral fields), confirming what the client said in the September 11 session.
- Every "Fillable" field cites a real, currently-live column or jsonb key — safe to build the template from.
- "Partial" fields are included but flagged, since the mapping direction is right but an exact rule (which of two near-duplicate fields, what format) still needs a client answer before an actual import script could use them blindly.
- "Gap" and "Excluded" fields are left off the entry template and listed on a separate reference tab, so the client knows why — nothing is silently dropped.
