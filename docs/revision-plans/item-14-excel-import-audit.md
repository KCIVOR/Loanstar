# Item 14 — Excel import/export alignment: field audit (Phase 0, no implementation plan yet)

Part of the System Revision Report rollout. See `loanstar/docs/system-revision-report-tracker.md` for the workflow rules and overall status.

**Tracker item:** *Add ability to import account data from Excel files, not just export it.*

**Status: audit only — implementation plan not yet written. Paused here at user's request 2026-08-11, to be continued later.**

## Why this became bigger than "add an import button"

The app's current export (`masterlistToExportRow`, `src/lib/ar/masterlist.ts:330-351`, wired to the "Export CSV" button on `/ar`) is a thin 19-column summary. The client's real, actively-used operational file — `Downloads\SYSTEM DEV\Step 4 - Accounting LRA\SF\SF MASTERFILE SAMPLE.xlsx` ("SUMMARY OF LOAN RELEASED - SEAFARER 2024", header row 4, columns A-CB) — has **80 columns** covering borrower demographics, employment/vessel detail, risk/coverage ratios, PIC/allotment, day-bucketed aging, full check/banking detail, and a detailed fee breakdown. Before writing an import feature, the user asked whether the system could realistically produce/consume that real format — this file is the result of checking.

## Method

Read the real 80-column header row directly from the client's sample file (`openpyxl`, row 4). Cross-checked every column against the **live production schema** (`acopcwlhkovssjnrqygk`) — `masterlist`, `borrowers` (including its jsonb sub-objects: `manning_agency`, `allottee`, `pic_work`, `financial`, `present_address`), `computations`, `verifications`, `loan_applications`, `pdc_checks`, `amortization_schedules`, `check_types`, `portfolios` — via `information_schema.columns` and direct data queries, and against the borrower jsonb shape types in `src/lib/borrowers/types.ts`. Evidence-based, not guessed.

## Result: 52 of 80 fillable, 28 are real gaps

### ✅ Fillable (52/80)

| # | Excel Column | Source | Notes |
|---|---|---|---|
| 1 | NO. | Generated row number | Not stored data |
| 2 | BORROWER NO. | `borrowers.borrower_no` | |
| 4 | LOAN NO. | `loan_applications.application_no` / `masterlist.loan_account_no` | Need to confirm which one the sheet actually means |
| 6 | LOAN TYPE | `computations.loan_type_name` | |
| 7 | BORROWER'S NAME | `borrowers` first/middle/last/suffix | |
| 8 | Gender | `borrowers.gender` | |
| 9 | AGE | Computed from `borrowers.date_of_birth` | |
| 10 | BIRTHDAY | `borrowers.date_of_birth` | |
| 11 | CONTACT | `borrowers.mobile_phone` | |
| 15 | RELEASE DATE | `computations.release_date` | |
| 16 | POSITION | `borrowers.pic_work.rank` (jsonb) | |
| 18 | TYPES OF VESSEL | `borrowers.pic_work.vessel` / `masterlist.vessel_name` | Partial — sheet wants vessel *type*, schema has vessel *name* |
| 19 | PORTFOLIO / INVESTOR | `portfolios.name` / `investor_label` | |
| 20 | AGENCY | `borrowers.manning_agency.name` (jsonb) | |
| 22 | CREWING MANAGER | `borrowers.manning_agency.crewingManager` (jsonb) | |
| 25 | CITY/MUNICIPALITY/PROVINCE | `borrowers.present_address` (jsonb) | Partial — format match to sheet's combined string unconfirmed |
| 27 | Tentative Dept. Date | `borrowers.manning_agency.departureDate` (jsonb) | |
| 28 | Actual Dept Date | `borrowers.pic_work.embarkationDate` (jsonb) | Partial — semantic match not fully confirmed |
| 30 | Contract Duration | `borrowers.pic_work.contractDuration` (jsonb) | |
| 31 | Loan Amt. (PRIN.) | `computations.principal` | |
| 32 | Net Desired | `computations.input_amount` / `net_released` | |
| 33 | Terms | `computations.terms` | |
| 35 | Amort. | `computations.monthly_amortization` | |
| 36 | INTEREST RATE | `computations.interest_rate` | |
| 37 | Total Receivable | `computations.total_loan` | |
| 39 | DEBT COVERAGE RATIO TO CONTRACT | `computations.coverage_ratio` | |
| 41 | OVER 30% TO CONTRACT | Derivable: `coverage_ratio > 0.3` | |
| 44 | PERSON IN CHARGE TO PAY | `borrowers.allottee.name`/`relationship` (jsonb) | |
| 45 | PERCENTAGE OF ALLOTMENT | `borrowers.allottee.allotmentPercent` (jsonb) | |
| 46 | DELINQUENT LISTING | `checks_recorded` (`ncl`/`lslg_denied_cancelled`) | Partial — pass/fail vs. sheet's "NO HIT" text format |
| 47 | NFIS | `checks_recorded` (`nfis` check type) | |
| 50 | MARITAL STATUS | `borrowers.civil_status` | |
| 51 | DEPENDENTS UNDER 21 | Computed from `borrowers.dependents` (jsonb) | |
| 52 | Check Rel. Date | Release event date | Partial — confirm exact timestamp source |
| 53 | Payment Start | `masterlist.first_payment_date` | |
| 54 | Payment End | Derivable: `first_payment_date` + `terms` | |
| 55-58 | 1-30 / 31-60 / 61-90 / 91-up days | `amortization_schedules` | **Needs restructuring** — `masterlist.aging_bucket` today is one label, not 4 amount columns |
| 59 | Bor. Checking Acct. | `borrowers.financial.accountType` (jsonb) | Partial |
| 60 | Account Number | `borrowers.financial.accountNumber` / `pdc_checks.ref_account` | |
| 61 | Check No. (Amort.) | `pdc_checks.check_number` | |
| 63 | BANK | `pdc_checks.bank_name` / `masterlist.atm_bank_name` | |
| 64 | Check No. | `pdc_checks.check_number` | Duplicate concept of #61 (release check) |
| 65 | Check Amount | `pdc_checks.amount` / `computations.net_released` | |
| 66 | Proc. Fee | `computations.processing_fee` | |
| 67 | Processing fee/Notarial/Admin/Doc Stamp | `computations` | Has all 4 as separate columns; sheet combines into one |
| 68 | Checking Acct. | Duplicate of #59/60 | |
| 69 | SECURITY FEE | `computations.security_fee` | |
| 77 | ATM BANK | `masterlist.atm_bank_name` | |
| 78 | ATM CARD NO. | `masterlist.atm_card_last4` | Partial — only last 4 digits stored, sheet likely wants full number |

### ❌ Genuine gaps — no home in schema (28/80)

| # | Excel Column | Why |
|---|---|---|
| 3 | BIR | No field; also blank in the sample data itself — purpose unclear, ask client |
| 5 | BRANCH | No branch concept anywhere (system appears single-branch) |
| 12 | Education Level | Not captured |
| 13 | SPOUSE | Not captured (only `dependents`, not spouse) |
| 14 | MAIDEN NAME | Not captured |
| 17 | POSITION - DETAIL | No secondary/detail position field |
| 21 | Employer | No field distinct from Agency — may be the same thing tracked twice in the sheet, ask client |
| 23 | AGENT | System's `agent_user_id` is the internal loan agent — different concept from the sheet's manning/booking agent |
| 24 | SUB-AGENT | Not captured |
| 26 | REGION | Not captured (only city/province) |
| 29 | Contract (Y/N) | No explicit "has contract" flag |
| 34 | EXCESS TERM | Not captured |
| 38 | RISK PROFILE | No LOW/MEDIUM/HIGH classification field anywhere |
| 40 | DEBT COVERAGE RATIO TO CM | Only one coverage ratio exists; this second one (to Crewing Manager) doesn't |
| 42 | Earnings to Contract | Not captured |
| 43 | Earnings to Crewing Manager | Not captured |
| 48 | TIPPING POSITION | Not captured — meaning itself unclear, ask client |
| 49 | Collective Bargain Agreement | Not captured |
| 62 | Excess Checks Issued | `pdc_checks` doesn't distinguish "excess" from regular checks |
| 70 | Commission Fee | No commission concept in `computations` |
| 71 | Commission % | Same |
| 72 | ADJUSTMENT FEE | Not captured |
| 73 | ADVANCES | Not captured |
| 74 | PAYMENT FOR PREVIOUS LOAN | Not captured (reloan linkage exists via `parent_application_id`, but not this deduction amount) |
| 75 | REMARKS | No centralized free-text remarks field on `masterlist` |
| 76 | ADVANCES AMOUNT | Same as #73 |
| 79 | STATUS (remain/credit-retain/mailing) | Not captured |
| 80 | TIN NO. | Not captured on `borrowers` |

## Open questions for the client before planning can start

1. **BIR** (col 3), **Employer vs. Agency** (col 21 vs. 20), **Tipping Position** (col 48), **Branch** (col 5) — ambiguous even in the source file; need a real answer, not an assumption.
2. Is the goal **full parity** with this 80-column file (real schema work: ~28 new fields, aging restructure, several partial-match fields to firm up), or a **partial/pragmatic** import (map what maps cleanly today, explicitly punt on the 28 gaps)?
3. Which fields are actually needed for **round-trip import** (create/update accounts from a re-uploaded file) vs. which are just **export-only reporting nice-to-haves**? Import needs way more care per-field (validation, conflict handling) than export.

## Next steps (when resumed)

Do not start writing the phased implementation plan until the 3 open questions above are answered — especially #2, since it changes the scope from "small feature" to "meaningful schema project" (new columns across `computations`/`borrowers`/`masterlist`, an aging-bucket restructure, plus the actual import parsing/validation/conflict-handling logic itself, which hasn't been designed at all yet — this audit only covers *field mapping*, not *import mechanics*).
