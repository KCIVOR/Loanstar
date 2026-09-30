# SF Template Tracker

Tracks the work of giving seafarer (SF) loans their own document templates, separate from SME.

- Started: 2026-09-30
- Source files: `C:\Users\Rovick\Desktop\Loan Star Document\SF Converted\`
- Rules: `.claude/skills/docx-template-tagging/SKILL.md`
- Approach: create a new SF-only template for each document. The current shared template stays as it is and becomes SME-only once the SF one is published.

## Status key

| Status | Meaning |
|---|---|
| Not started | Nothing done yet |
| Tagging | Real values being replaced with merge tags |
| Draft ready | Draft uploaded, waiting for review in Admin |
| Published | Published in Admin by Rovick |
| Switched | Shared template turned off for SF |

## Batch 1 — documents that already exist in the system (shared with SME)

| # | Document | Source file | Current shared template | New SF template | Paper | Status | Notes |
|---|---|---|---|---|---|---|---|
| 1 | Promissory Note | PN.docx | `promissory_note` | `promissory_note_sf` | 8.5 × 13 | Draft ready | Notary ID cells print blank (no ID data for seafarers) |
| 2 | Disclosure Statement | DISC.docx | `disclosure_statement` | `disclosure_statement_sf` | 8.5 × 13 | Draft ready | Source typos kept as-is ("Appraisal Fees D", "DTRANSACTION") |
| 3 | BLRI | BLRI.docx | `blri` | `blri_sf` | 8.5 × 13 | Draft ready | Manning Agency / Principal Ship moved below Address (client rule). Fees now list only what applies to the loan |
| 4 | Check Voucher | Check Voucher.docx | `check_voucher` | `check_voucher_sf` | A4 | Draft ready | Check No. prints blank (not stored) |
| 5 | Cash Voucher | Cash Voucher.docx | `cash_voucher` | `cash_voucher_sf` | A4 | Draft ready | Source has no bank-details line at the bottom — none added |
| 6 | AR Check | Acknowledgement Receipt - Check.docx | `ar_check_voucher` | `ar_check_voucher_sf` | A4 | Draft ready | Check number prints blank (not stored) |
| 7 | AR ATM | AR ATM - With Spouse.docx | `ar_atm_voucher` | `ar_atm_voucher_sf` | A4 | Draft ready | One template; spouse block shows only when the borrower is married |

Tagged files and a 7-page preview: `C:\Users\Rovick\Desktop\Loan Star Document\SF Tagged\`

### What is left for Batch 1

1. **Review + publish** each draft in Admin → Document Templates (Rovick).
2. **Deploy the code change** (uncommitted on `main`): new merge fields + the `_sf` slugs in `src/lib/lra/release-documents.ts`. Without it the SF vouchers ignore the PDC / no-PDC rule.
3. **Switch**: set each `_sf` template to "always" for Seafarer, and set the 7 shared templates to "hidden" for Seafarer. All 7 `_sf` templates are "hidden" for both segments until then, so nothing changes for live loans.

### Data the system does not hold yet (prints blank)

- Co-borrower / spouse name for a seafarer loan (`spouseName` is always empty)
- Borrower ID number and place/date of issue (Promissory Note notary block)
- Disbursement check number (BLRI, Check Voucher, AR Check)
- "Checked By" name
- Borrower middle name is not included in `borrowerName`

## Checks per document

Each document must pass all of these before it is marked "Draft ready":

1. Every real value replaced with a merge tag
2. No leftover real borrower data anywhere in the file
3. Paper size matches the table above
4. One-page documents stay one page, nothing overlaps, all text black
5. Rendered PDF compared page by page against the source

## Batch 2 — not yet in the system for SF (later)

| Document | Source file | Situation |
|---|---|---|
| AR Cash | Acknowledgement Receipt - Cash.docx | Template exists but is off for SF |
| Second Notice | DL2 - No address.docx | Template exists but is off for SF and SME |
| Second Notice + Final Demand | SC - NO PDC- no add.docx | Not confirmed |
| AR Multiple Check | Acknowledgement Receipt - Multiple Check.docx | Missing |
| Loan Information | Loan Information.docx | Missing |
| Payment Details | Payment Details.docx | Missing |

## Open questions for the client

- Loan Agreement and Letter of Intent print for every SF loan today, but there is no SF source file for either. Should seafarers receive them?

## Log

- 2026-09-30 — Tracker created. Live system checked: 33 templates, 9 print for SF, all 9 shared with SME.
- 2026-09-30 — Batch 1 tagged. Found the live shared templates are not usable for SF as they stand: `promissory_note` and `disclosure_statement` are the SME wording, `ar_atm_voucher` holds a Check Voucher layout, `cash_voucher` is an untagged filled sample, and BLRI / Check Voucher / AR Check are on the wrong paper size.
- 2026-09-30 — 7 `_sf` templates created (hidden for both segments) with a v1 draft each. Verified through the production PDF service with 4 data sets (married, co-borrower named, single, long-data stress): all 1 page, correct paper size, no leftover sample values. New merge fields added: `firstPaymentDateLong`, `paymentEndsLong`, `interestFromMonthYear`, `interestToMonthYear`, `interestMonths`, `interestMonthsInWords`.
