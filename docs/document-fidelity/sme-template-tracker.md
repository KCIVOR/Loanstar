# SME Template Tracker

Tracks the work of rebuilding the SME (and Individual) document templates from the client's SME originals. Seafarer has its own set — see `sf-template-tracker.md`.

- Started: 2026-09-30
- Source files: `C:\Users\Rovick\Desktop\Loan Star Document\SME Converted\` (79 files)
- Rules: `.claude/skills/docx-template-tagging/SKILL.md`
- Approach: the un-suffixed template (`blri`, `check_voucher`, …) is the SME / Individual version. Each fix is a new **draft** on that template; the published version keeps printing until the draft is published.
- Individual loans use the SME documents. Templates use `clientName` / `clientAddress`, which resolve to the company for SME and to the borrower for Individual.

## Status key

| Status | Meaning |
|---|---|
| Not started | Nothing done yet |
| Draft ready | Draft uploaded, waiting for review in Admin |
| Published | Published in Admin |
| Kept | Existing published version already matches the SME source |

## Batch 1 — the documents every SME release prints

| # | Document | Source file | Template | Paper | Status | Notes |
|---|---|---|---|---|---|---|
| 1 | BLRI | BLRI (Regular).docx | `blri` | 8.5 × 13 | Draft ready (v5) | Live v4 is the seafarer layout on 8.5 × 14. Ref. Account Number column prints blank (not passed to documents) |
| 2 | Check Voucher | Check Voucher.docx | `check_voucher` | A4 | Draft ready (v4) | Live v3 is the seafarer layout on 8.5 × 14. Check No. blank (not stored) |
| 3 | Cash Voucher | Cash Voucher.docx | `cash_voucher` | A4 | Draft ready (v5) | **Live v4 prints a sample borrower's real details on every loan** |
| 4 | AR Check | Acknowledgement Receipt - Check.docx | `ar_check_voucher` | A4 | Draft ready (v4) | Live v3 is the seafarer layout on Letter |
| 5 | AR Cash | Acknowledgement Receipt - Cash.docx | `ar_cash_voucher` | A4 | Draft ready (v4) | Live v3 is on Letter |
| 6 | Disclosure Statement | DISCLOSURE.docx | `disclosure_statement` | 8.5 × 13 | Draft ready (v12) | Live v11 fails for Individual loans (company-only tag) and printed fixed dashes for every fee line |
| 7 | Promissory Note | PN - MPL.docx | `promissory_note` | 8.5 × 13 | Kept (v9) | Already tagged from the SME source, 3 pages like the original |

Tagged files and a preview: `C:\Users\Rovick\Desktop\Loan Star Document\SME Tagged\`

### Needs a decision

- `ar_atm_voucher` prints for every SME release without PDC, but it holds a Check Voucher layout and the SME folder has no ATM-surrender document. Recommended: hide it for SME.

## Batch 2 — other calculator prints (not started)

| Document | Source file(s) | Situation |
|---|---|---|
| BLRI variants | BLRI (18 / 24 / 36 Payments), BLRI (CWT 12 / 24 Payments), BLRI (Invoice) | 18 / 24 / 36 differ only in row count — covered by the looped schedule. CWT adds Amortization / CWT / Check Amount columns; Invoice has different fee labels and weekly terms. Both need their own template and data |
| AR Fund Transfer | Acknowledgement Receipt - Fund Transfer.docx | No template |
| AR Single Check | Acknowledgement Receipt - Single Check.docx | No template |
| AR Multiple Check | Acknowledgement Receipt - Multiple Check.docx | No template; source row 2 is a broken "#VALUE!" |
| Loan Information | Loan Information.docx | No template |
| Consolidation - Restructure | Consolidation - Restructure.docx | 3 pages, no template |
| Vienovo set | Vienovo - BLRI Page 1–3, Cash / Check Voucher, AR Cash / Check / Single Check, Vienovo Sheet | No templates |
| Briefing | NEW BRIEFING SME LSLG.docx | No template |

## Batch 3 — legal documents (existing templates to verify against source)

| Template | Source file(s) | Current format |
|---|---|---|
| `loan_agreement` | LOAN AGREEMENT + 8 variants (Auto and Individual, Bi-Monthly, DTI, Invoice, Invoice (DTI), multiple invoices, No Security check, Per Day Interest Single) | HTML, one template with conditions |
| `loan_agreement_vienovo` | Vienovo Loan Agreement (3 dated versions) | HTML |
| `deed_of_chattel_mortgage` | CHATTEL MORTGAGE - 1 to 4 units | docx |
| `real_estate_mortgage` | REAL ESTATE MORTGAGE - 1 / 2 properties | docx |
| `cancellation_of_chattel_mortgage` | CANCELLATION OF CHATTEL (8 files) | HTML |
| `cancellation_of_real_estate_mortgage` | CANCELLATION OF REM (2 files) | HTML |
| `voluntary_surrender_deed_auto` / `_rem` | Voluntary and Deed Auto (4) / REM (2) | HTML |
| `spa_mortgage_cancellation` | SPECIAL POWER OF ATTORNEY Cancellation of Mortgage | HTML |
| `agreement_check_replacement` | Additional Agreement 1.23.23 - check replacement | HTML |
| `agreement_for_consolidation` | AGREEMENT FOR CONSOLIDATION | HTML |
| `consent_form` | LSLGC CONSENT FORM 2025 (3 files) | HTML |
| `demand_letter_sme`, `demand_letter_v2`, `demand_letter_dishonored_check` | Demand Letter (10 files) | docx / HTML; only `demand_letter` is actually generated |
| Disclosure (Vienovo) | DISCLOSURE - vienovo quarter2months | No template |

## Log

- 2026-09-30 — Tracker created. Found that the live SME BLRI, Check Voucher, Cash Voucher and AR Check were all built from the seafarer sample, not the SME originals.
- 2026-09-30 — Batch 1 tagged from the SME calculator prints and uploaded as drafts. Verified on the production PDF service with an SME loan, an Individual loan, the admin sample and a long-data stress case: all 1 page, correct paper size, no leftover sample values. New merge fields: `clientName`, `clientAddress`, `segmentLoanLabel`.
