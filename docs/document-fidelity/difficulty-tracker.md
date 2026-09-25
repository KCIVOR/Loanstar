# Document-fidelity difficulty tracker

Every `document_templates` row, ordered easiest → hardest to verify/fix against
a retained client source. Difficulty is an estimate based on structure (field
count, repeat/conditional blocks, page length, legal-instrument overhead like
notarization blocks) — not measured line-by-line for every row. Re-rank as
real work on a document turns up more/less complexity than expected.

Status column meanings:
- **Fixed** — checked against a real retained source this project, corrected where needed, published.
- **Confirmed OK** — checked against a real retained source, already matched, no fix needed.
- **Draft pending** — an unpublished draft sits on this template (may or may not be fidelity-related).
- **No source** — no retained client `.doc`/`.docx` has been located; stays blocked per the design doc's unmapped-source rule until one is supplied.
- *(blank)* — not yet checked against a source at all (published, presumably from original Phase 1 seeding).

## Tier 1 — Simple
Single-page letter/voucher, few scalar fields, at most one repeat block.

| # | Slug | Category | Published | Status |
|---|------|----------|-----------|--------|
| 1 | `payment_receipt` | collection | v1 | No source |
| 2 | `acknowledgement_receipt` | release | v1 | No source |
| 3 | `letter_of_intent` | release | v1 | No source |
| 4 | `endorsement_letter` | release | v1 | No source |
| 5 | `demand_letter` | collection | v2 | No source |
| 6 | `demand_letter_dishonored_check` | collection | v2 | |
| 7 | `demand_letter_v2` | lra | v1 | Fixed |
| 8 | `demand_letter_second_notice` | collection | v3 | Fixed |
| 9 | `cash_voucher` | release | v3 (docx) | Fixed — same bug pattern as `blri`: a real filled sample (`Cash_voucher.docx`, borrower ELVEN DEL MONTE CAYANAN / spouse MARIEVIC FLORES CAYANAN, LA303401) was uploaded directly as a draft with **zero merge tags** and reached `published` status on 2026-09-25. The tagged replacement was uploaded and published as v3 on 2026-09-25, replacing the untagged v2. Confirmed the DEBIT/CREDIT ledger (7 sample rows: Loans Receivable, CASH, and 5 fee particulars) collapses into the same real `{{#accountingEntries}}` loop used by `ar_atm_voucher`/`blri` — no new fields needed, everything (`borrowerName`, `address`, `loanAccountNo`, `checkVoucherNo`, `netLoanAmount`, `amountInWords`, `dateReleasedFormatted`, `dateReleasedLong`, `preparedBy`/`checkedBy`/`approvedBy`, `hasSpouse`/`spouseName`, `companyName`) was already established in `template-context.ts`/`fields.ts`. The sample's co-borrower (spouse) name/date, present twice (the combined "BORROWER:" line and a separate signature block), was wrapped in `{{#hasSpouse}}…{{/hasSpouse}}` around `spouseName` — this is the same real `hasSpouse`/`spouseName` pair `ar_atm_voucher` added, just exercised here for the first time with an actual filled second signer. Verified with `mergeDocxTemplate`-equivalent (pizzip+docxtemplater) against a multi-item `accountingEntries` context in both `hasSpouse: true` and `false` states — zero unresolved tags, no leftover literal source values on a case-insensitive sweep |
| 10 | `check_voucher` | release | v3 (docx) | Fixed — identical bug and same real source person as `cash_voucher` above (`Check_voucher.docx`, same borrower/spouse/loan). Same fix approach: `{{#accountingEntries}}` loop reused (identical 7-row ledger to `cash_voucher`), `hasSpouse`/`spouseName` conditional reused for the co-borrower block, no new fields. One ambiguous call: the sample's "BANK NAME" cell literally reads `EW - 2858` (a bank-code + last-4-of-account hybrid display, not just the bank's name) — tagged the whole hybrid string as the single established `{{bankName}}` field verbatim rather than inventing a new "last 4 digits" field, since the pre-existing v1 HTML body for this slug already expects one `{{bankName}}` cell. `{{bankAccountNo}}`, `{{checkNumber}}`, `{{checkAmount}}`, `{{dateReleasedFormatted}}` map directly to their own distinct cells. Verified clean with the same multi-item/both-hasSpouse-states merge test and literal sweep as `cash_voucher` |
| 11 | `ar_cash_voucher` | release | v3 (docx) | Fixed — same bug, same real source person (`AR_Cash.docx`, borrower/spouse ELVEN DEL MONTE CAYANAN / MARIEVIC FLORES CAYANAN). Structurally different from `cash_voucher`/`check_voucher`: this is a plain "ACKNOWLEDGEMENT RECEIPT" with **no accounting ledger at all** (confirmed — no DEBIT/CREDIT table anywhere in the source), just `companyName`, `dateReleasedLong`, `amountInWords`, `netLoanAmount`, and the borrower/spouse names — no new fields needed. The source repeats the borrower's name and the spouse's name **twice each** in two nearly-identical signature-block tables (a real duplicate "customer copy"/office-copy style layout, confirmed by checking each occurrence individually — not the stray-textbox-wrap bug seen on `blri`; a genuine decorative `<w:txbxContent>` duplicate was also found on the "ACKNOWLEDGED & RECEIVED BY:" label table, but that one carries no real data so needed no tagging). Both spouse-name tables wrapped independently in their own `{{#hasSpouse}}…{{/hasSpouse}}`. One cosmetic-only note: the source prints the amount-in-words in ALL CAPS ("FIFTY THOUSAND PESOS") as literal text (no `w:caps` toggle backing it), while the established `amountInWords` field renders Title Case ("Fifty Thousand Pesos") — accepted as a minor styling difference rather than inventing an uppercase-only duplicate field. Also dropped one literal redundant word: the source's own text continued "...PESOS (Php 50,000.00)" right after the amount-in-words phrase, which would have doubled the word "Pesos" once `{{amountInWords}}` was substituted in — removed the literal leading "PESOS" from that follow-on run. Verified clean with a `hasSpouse: true`/`false` merge test and literal sweep |
| 12 | `ar_check_voucher` | release | v3 (docx) | Fixed — same bug, same real source person and structure as `ar_cash_voucher` (`AR_Check.docx`, no ledger, acknowledgement-receipt style). Same fixes: `hasSpouse`/`spouseName` wrapped independently around both duplicate spouse-name tables, same ALL-CAPS/duplicate-"Pesos" cosmetic notes as `ar_cash_voucher`. Difference from the cash variant: the issuance sentence names the bank + check instead of "CASH" — tagged as `{{bankName}}` (again the `EW - 2858` hybrid-string convention, same ambiguous call as `check_voucher`) and `{{checkNumber}}`. Verified clean with a `hasSpouse: true`/`false` merge test and literal sweep |
| — | `demand_letter_sme` | lra | *(draft v1, unpublished)* | Fixed — new template, source was `Demand Letter - SME.doc` |

## Tier 2 — Moderate
A real table + repeat block, or several distinct sections.

| # | Slug | Category | Published | Status |
|---|------|----------|-----------|--------|
| 13 | `ar_atm_voucher` | release | v8 (docx, draft pending) | Fixed — content replaced entirely: the real source (`SF Calculator.docx`) is a **"CHECK VOUCHER"** disbursement ledger, not the v7 HTML's "SURRENDER OF BANK ATM CARD" content (per explicit user instruction, despite the naming mismatch — flagged before proceeding). Rebuilt via docx-template-tagging skill; the DEBIT/CREDIT ledger (7 sample rows) collapsed into the real `{{#accountingEntries}}` loop already produced by `template-context.ts` (`description`/`accountCode`/`debit`/`credit`), not individual scalar fee fields — verified this is the actual production shape before tagging. Added missing `spouseName`/`hasSpouse` sample fields (real production fields, just missing from the admin-preview catalog). `ar_check_voucher`/`check_voucher` remain "No source" — this file was originally offered for those but the user chose to apply it to `ar_atm_voucher` instead |
| 14 | `final_computation_sheet` | computation | v1 | No source |
| 15 | `consent_form` | release | v2 | Fixed |
| 16 | `agreement_check_replacement` | release | v2 | Confirmed OK |
| 17 | `agreement_for_consolidation` | release | v2 | Confirmed OK |
| 18 | `blri` | release | v3 (docx) | Fixed — a real filled sample (`blri.docx`, borrower BN303401) was uploaded directly as a draft with **zero merge tags** (real client name/address/loan data hardcoded) and somehow reached `published` status on 2026-09-25 without ever going through the docx-template-tagging skill or being recorded here or in `source-registry.json`. Every BLRI generated since then shows that one real borrower's data instead of the actual borrower's — recommend reverting to v1 in Admin immediately. A properly tagged replacement draft has been prepared from that same source (not yet uploaded — no Storage/service-role access from this session) and needs the user to upload it as a new draft via Admin, then verify and publish. Tagging added three new context fields (`dateReleasedFormatted`, `dateReleasedLong`, `totalDeductions`) and a `no` index on `pdcSchedule` rows — additive only, no existing template's output changes. Known gaps carried over as designed: `checkNumber`/`checkDate`/`bankName` render blank in production today (no data source wired yet, per existing `template-context.ts` convention) even though the sample shows real values for them |

## Tier 3 — Complex
Legal instrument: notarization block, witness/acknowledgment tables, precise
formatting (e.g. Disclosure's checkbox-grid tab-stops).

| # | Slug | Category | Published | Status |
|---|------|----------|-----------|--------|
| 19 | `disclosure_statement` | release | v11 (docx) | Fixed — rebuilt via the docx-template-tagging skill against a real filled sample (Vienovo Philippines, Inc.), 0 hardcoded values remaining |
| 20 | `promissory_note` | release | v9 (docx) | Fixed — rebuilt via the real `.docx` upload path (docx-template-tagging skill), verified 100% against the client source `PN - MPL.pdf` |
| 21 | `spa_mortgage_cancellation` | release | v3 | Fixed |
| 22 | `cancellation_of_chattel_mortgage` | release | v3 | Fixed |
| 23 | `cancellation_of_real_estate_mortgage` | release | v2 | No source |
| 24 | `deed_of_chattel_mortgage` | release | v5 (docx) | Fixed — rebuilt via docx-template-tagging skill against `CHATTEL MORTGAGE - 3 units.doc`; vehicles collapsed into a real `{{#vehicles}}` loop, verified against a 3-item test context and confirmed generating correctly for real car-refinancing loans in LRA. One known cosmetic issue: a stray rendering artifact in the page-1 margin near the rotated name label (see skill notes) — doesn't affect any contract content |
| 25 | `real_estate_mortgage` | release | v4 (docx, draft pending) | Fixed — rebuilt via docx-template-tagging skill against `REAL ESTATE MORTGAGE - 2 Properties.doc`; properties collapsed into a real `{{#properties}}` loop, verified against a 3-item test context. No stray-artifact issue seen (unlike the chattel mortgage's known sidebar glitch) despite the same block-deletion pattern. Notary table's "Validity" column and the notarization/execution date blanks were left as hand-fill, matching the source exactly (same convention as promissory_note) |
| 26 | `voluntary_surrender_deed_auto` | release | v2 | Fixed |
| 27 | `voluntary_surrender_deed_rem` | release | v1 | No source |
| 28 | `loan_agreement` | release | v4 | No source (only the Vienovo variant below has one) |

## Tier 4 — Hardest
Multi-page, multiple real variants, or segment-conditional structure.

| # | Slug | Category | Published | Status |
|---|------|----------|-----------|--------|
| 29 | `loan_agreement_vienovo` | release | v2 | Fixed |
| 30 | `application_form_sme_corporate` | intake | v1 | |
| 31 | `application_form_sme_individual` | intake | v1 | |
| 32 | `application_form` | intake | v1 | **draft pending** (unrelated to this project, check before touching) |

## Business importance ranking

Separate from the difficulty tiers above — this orders templates by how central
each is to actually releasing or collecting on a loan, not by how hard it is to
verify. Use this to prioritize which "No source" entries to unblock first if a
retained client source turns up.

### Tier 1 — Core release documents (used on nearly every loan)
- `promissory_note` — the loan contract itself
- `disclosure_statement` — legally required disclosure
- `deed_of_chattel_mortgage` / `real_estate_mortgage` — the collateral security instrument
- `ar_atm_voucher` / `ar_cash_voucher` / `ar_check_voucher` — how loan proceeds are actually disbursed

### Tier 2 — Release-path support documents (frequent, conditional on collateral/path)
- `blri`
- `agreement_for_consolidation` / `agreement_check_replacement`
- `consent_form`
- `loan_agreement` / `loan_agreement_vienovo`
- `voluntary_surrender_deed_auto` / `voluntary_surrender_deed_rem`
- `spa_mortgage_cancellation` / `cancellation_of_chattel_mortgage` / `cancellation_of_real_estate_mortgage`

### Tier 3 — Collections (lower volume, high stakes when used)
- `demand_letter_dishonored_check`
- `demand_letter_second_notice`
- `demand_letter_v2`
- `demand_letter`
- `demand_letter_sme`

### Tier 4 — Intake / administrative (high volume, lower legal sensitivity)
- `application_form`, `application_form_sme_corporate`, `application_form_sme_individual`
- `payment_receipt`, `acknowledgement_receipt`, `cash_voucher`, `check_voucher`, `endorsement_letter`, `letter_of_intent`, `final_computation_sheet`

## Not ranked

- Everything under **"No source"** above stays blocked per the design doc's rule: a source-without-a-mapping entry must not silently inherit a similar template. Would need real source material from the client to proceed.

## Notes for whoever picks this up next

- "Fixed" entries were verified with a real visual comparison (source `.doc`/`.docx` rendered to an image via Word, compared against the actual rendered PDF) as of the 2026-09-25 redo pass — earlier passes in this project (before that date) relied on text-only comparison and may still have undetected layout differences. Disclosure Statement is the one confirmed example of this gap (see its migration `20260925100000_fix_disclosure_statement_source_accuracy.sql`); the other "Fixed" rows have not been re-verified visually yet.
- `application_form` has an unpublished draft that predates this project — inspect before assuming it's related to fidelity work.
- The "Upload a Word file" feature (real `.docx` uploaded, `{{field}}`/`{{#field}}...{{/field}}` tags inserted directly in the OOXML, rendered via docxtemplater + Gotenberg's LibreOffice route) is now the **default, preferred workflow** whenever a real source file is available — confirmed 100% accurate on `promissory_note` (2026-09-25), after HTML rebuilds kept hitting the TipTap schema's ceiling (no real tab-stops, limited table semantics). Use the `docx-template-tagging` skill for this. HTML rebuilding is now the fallback only when no real source file exists — `demand_letter_sme` is the one document built as HTML after the upload path was tried first and set aside by request that day, not because the feature failed.
- For a document with a variable-length repeating section (mortgage collateral, PDC schedules, multiple co-borrowers), the skill covers what to upload and how the loop gets tagged — see its "Reusable templates" section.
