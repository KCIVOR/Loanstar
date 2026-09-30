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

## Batch 2 — other calculator prints

All uploaded as drafts (new templates are hidden for both segments).

| Document | Template | Paper | Status | What prints blank / open points |
|---|---|---|---|---|
| AR Fund Transfer | `ar_fund_transfer` | A4 | Draft ready (v1) | — |
| AR Single Check | `ar_single_check` | A4 | Draft ready (v1) | Check number (not stored) |
| AR Multiple Check | `ar_multiple_check` | A4 | Draft ready (v1) | Check row hand-filled. Source rows are broken ("NO PESOS", "#VALUE!") |
| Loan Information | `loan_information` | 8.5 × 13 | Draft ready (v1) | Processing Fee Rate, Admin Cost Rate, Chattel Mortgage Fee, Individual co-borrower |
| BLRI, 25–36 payments | `blri_long` | 8.5 × 13 | Draft ready (v1) | Standard `blri` holds one page up to 24 payments; this one to 36 |
| BLRI (CWT) | `blri_cwt` | 8.5 × 13 | Draft ready (v1) — incomplete | CWT and Check Amount columns blank: the system has no withholding-tax computation (sheet: total interest × 2% ÷ payments) |
| BLRI (Invoice) | `blri_invoice` | 8.5 × 13 | Draft ready (v1) — needs decisions | "Terms (weekly)" mapped to number of checks (unconfirmed); sheet's Amount is a running payoff; sheet lists fees the invoice rules say do not exist |
| Consolidation - Restructure | `consolidation_restructure` | 8.5 × 13 | Draft ready (v1) — mostly blank | No consolidation / restructure computation in the system; only names, date, signatories filled |
| Briefing | `briefing_sme` | 8.5 × 13 | Draft ready (v1) | — |
| Disclosure (Vienovo) | `vienovo_disclosure_statement` | 8.5 × 13 | Draft ready (v1) — incomplete | Item 9b payment lines blank. Source has a signature image pasted over the lender's name — confirm with client |
| Vienovo BLRI / vouchers / receipts / sheet | — | — | No template needed | Same forms as the standard SME ones fed from another calculator tab; only small wording differences ("LSLG", no Borrower No.) |

## Batch 3 — legal documents

Every live template was audited against the client's source and none was faithful, so each was rebuilt as a Word template from the source. All are drafts; the live versions keep printing until published.

| Template | Draft | Paper | Main problems in the live version | Open points on the draft |
|---|---|---|---|---|
| `loan_agreement` | v5 | 8.5 × 13, 3 pp | Names the person instead of the company for SME; legal wording rewritten; raw dates; pre-filled witness / notary lines; DTI, bi-monthly, per-day, invoice and no-security variants can never print | Covers standard, Individual, DTI, no-security. DTI / no-security need flags wired. Bi-monthly, per-day, invoice need their own templates + data |
| `deed_of_chattel_mortgage` | v6 | 8.5 × 13, 2 pp | Principal and total loan swapped; hardcoded sample TIN; coloured text; stray "X" in the margin | Prints "vehicle/s" |
| `real_estate_mortgage` | v5 | 8.5 × 13, 2 pp | 3 pages for one property; blank signature name for Individual; missing closing sentence | — |
| `cancellation_of_chattel_mortgage` | v4 | 8.5 × 13, 1 p | Not the client layout; raw dates; blank page count; pre-filled place / date | Witness names kept as printed in the source |
| `cancellation_of_real_estate_mortgage` | v3 | 8.5 × 13, 2 pp | Same as above; missing sentences | Corp/DTI paragraph borrowed from the chattel cancellation — confirm |
| `voluntary_surrender_deed_auto` | v3 | 8.5 × 13, 3 pp per vehicle | All vehicles in one document; vendee pre-filled as Loan Star; wording edited | One full set per vehicle (4 vehicles = 12 pages) |
| `voluntary_surrender_deed_rem` | v2 | 8.5 × 13, 4 pp per property | Same as the vehicle version | One full set per property |
| `spa_mortgage_cancellation` | v4 | 8.5 × 13, 2 pp | Vehicle block not the source's layout; pre-filled dates | Year Model / Transmission lines dropped (no field) |
| `agreement_check_replacement` | v3 | 8.5 × 13, 2 pp | Blank bank details (source has fixed BDO text); wording changed; raw dates | Replacement checks and date hand-filled |
| `agreement_for_consolidation` | v3 | 8.5 × 13, 2 pp | Person instead of company; clause 2 table instead of running text; raw dates | Prior loans hand-filled. Individual wording is not from the client — confirm or limit to SME |
| `consent_form` | v3 | 8.5 × 13, 1 p | Person instead of company; second signer uses a field that does not exist | Source says "two (5) years" — kept |
| `demand_letter_dishonored_check_sme` | v1 (new) | A4 | Live SME demand templates are unrouted and would fail | Needs routing in `pickDemandLetterSlug`. "Attention:" line and co-borrower letter need new data |
| `demand_letter_no_pdc_sme` | v1 (new) | A4 | Same | Same |
| Loan Agreement (Vienovo) | — | — | Always prints "quarterly"; omits the principal check | Not rebuilt: needs payment-frequency flags first |

Combined preview of every draft: `C:\Users\Rovick\Desktop\Loan Star Document\SME Tagged\SME all drafts - preview.pdf`

## Work that is not template work

- Route SME / Individual accounts to the two new demand letters; confirm whether the account name on an SME loan is the company or the person.
- Pass the lender's paying account to documents (receipts and vouchers print the borrower's bank where the sheet prints Loan Star's).
- Pass payment frequency to documents (Vienovo quarterly / every 2 months).
- Withholding tax (CWT), invoice payoff column, consolidation / restructure computation.
- Flags for DTI, no security check, bi-monthly, per-day interest, invoice; Board Resolution No., Corporate Secretary, representative ID, co-borrower.

## Log

- 2026-09-30 — Tracker created. Found that the live SME BLRI, Check Voucher, Cash Voucher and AR Check were all built from the seafarer sample, not the SME originals.
- 2026-09-30 — Batch 1 tagged from the SME calculator prints and uploaded as drafts. Verified on the production PDF service with an SME loan, an Individual loan, the admin sample and a long-data stress case: all 1 page, correct paper size, no leftover sample values. New merge fields: `clientName`, `clientAddress`, `segmentLoanLabel`.
- 2026-09-30 — Batch 1 receipts fixed: the "BORROWER:" / "REPRESENTATIVE:" labels shared a paragraph with the text before them.
- 2026-09-30 — Batches 2 and 3 done by six sub-agents, then every file re-checked on the production PDF service (admin sample, SME, Individual; demand letters second / final): all merge, correct paper size, expected page counts. 29 drafts uploaded; 12 new templates created hidden.
- 2026-09-30 — Seven system gaps closed in code (commits `b57d829` + the one after it, local only): schedule flags from the computation's payment frequency; mortgage wording from the collateral type; the matching loan agreement chosen per frequency (`loan_agreement_bi_monthly`, `loan_agreement_per_day`, `loan_agreement_vienovo`); SME / Individual demand-letter routing, addressed to the company with an Attention line; co-borrower copy of the dishonored-check letter. Seven templates built and checked on the production PDF service — **not yet published, code not yet pushed** (files in `SME Tagged\Ready to publish`).
