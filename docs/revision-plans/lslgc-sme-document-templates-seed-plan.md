# LSLGC SME document templates — seed plan

**Date:** 2026-09-10
**Status:** Mapping for review — no code written yet
**Source:** `C:\Users\Rovick\Desktop\LSLGC Documents\LSLGC Calculator and Docs`
**Rule from client:** every document here is **SME-side** →
`seafarer_generation = 'hidden'`, `sme_generation = 'always' | 'optional'`.

---

## 1. What's in the source folder

66 document files (`.doc` / `.docx` / a couple `.pdf`) + 2 calculators
(`Calculator SME.xlsm`, `SFCalculator/` — **not** templates, ignore).

They are **filled-in legal instruments** (real borrower names, amounts,
amounts-in-words, TINs, notary blocks), not blank forms. Seeding them means
tokenising every specific value to `{{merge fields}}` while leaving the legal
prose **verbatim** (no paraphrasing of contract wording).

Converted copies for review: `scratchpad/lslgc_txt/*.txt` (LibreOffice text
extraction).

### Raw file groups

| Group | Files | Notes |
|---|---|---|
| Loan Agreement | `LOAN AGREEMENT.doc`, `- Auto and Individual`, `- Bi-Monthly`, `- DTI`, `- Invoice`, `- Invoice (DTI)`, `- Invoice with multiple invoices`, `- No Security check and termination fee`, `- Per Day Interest Single` (9) | Same skeleton; differ in **party clause** (corp / DTI sole-prop / individual), **security clause** (with/without security check + pre-termination fee), **cadence** (monthly / bi-monthly / per-day), **invoice annex** (none / one / many). |
| Vienovo Loan Agreement | `- quarterly`, `- quarter2months`, `- quarter2months 02.05.26`, `- quarter2months 02.20.26` + `Backup/` (4 distinct) | Client-specific customised agreement, quarterly / every-2-months cadence. Dated filenames = iterations, not separate docs. |
| Disclosure Statement | `DISCLOSURE.doc`, `Vienovo/DISCLOSURE - vienovo quarter.doc`, `- vienovo quarter2months.doc` | RA 3765 Truth-in-Lending sheet. Vienovo variants = quarterly cadence wording. |
| Promissory Note | `PN - MPL.doc` | Full MPL promissory note. |
| Chattel Mortgage | `CHATTEL MORTGAGE - 1 unit .doc` … `- 4 units` (4) | Identical except **N vehicle rows**. |
| Real Estate Mortgage | `REAL ESTATE MORTGAGE - 1 Property.doc`, `- 2 Properties.doc` (2) | Identical except **N property blocks** (TCT + technical description). |
| Cancellation of Chattel Mortgage | `CANCELLATION OF CHATTEL - {1..4} unit(s).doc`, `… Corp and DTI- {1..4} units.doc` + `Backup/` (8 distinct) | Identical except **N vehicle rows** and a Corp/DTI signatory variant. |
| Cancellation of REM | `CANCELLATION OF REM - 1 property.doc`, `- 2 properties.doc` (2) | Identical except **N property blocks**. |
| Voluntary Surrender + Deed of Sale (Auto) | `Voluntary and Deed Auto - Unit {1..4}.doc` (4) | "Annex C" — voluntary surrender + deed. Differ by **N vehicles**. |
| Voluntary Surrender + Deed of Sale (REM) | `Voluntary and Deed REM {1,2}.doc` (2) | Differ by **N properties**. |
| Demand Letter | `- SME`, `- SME No Address`, `- Co-borrower`, `- Co-borrower - no address`, `- Individual borrower`, `- Individual borrower No address`, `- without PDC - Individual`, `- without PDC - Individual - No Address`, `- without PDC 2024`, `- without PDC 2024 - no address - final` (10) | Differ by: **co-borrower block** y/n, **address line** y/n, **PDC vs non-PDC** wording. |
| Special Power of Attorney (mortgage cancellation) | `SPECIAL POWER OF ATTORNEY Cancellation of Mortgage.docx`, `… (1).docx` (near-identical) | Borrower authorises LSLGC to process RD/LTO cancellation. |
| Consent Form (Data Privacy) | `LSLGC CONSENT FORM 2025.docx` (+ `.pdf`), `- Corp..docx`, `- Individual.docx` | RA 10173 consent. Corp vs individual = signatory block only. |
| Agreement for Consolidation | `AGREEMENT FOR CONSOLIDATION.doc` | Consolidates **N prior loans** under one schedule. |
| Additional Agreement — check replacement | `Additional Agreement 1.23.23 - check replacement.docx` | Borrower swaps old PDCs; impound terms. |
| SME briefing | `NEW BRIEFING SME LSLG.pdf` | Static borrower briefing hand-out. |

---

## 2. Proposed template taxonomy

Collapsing the "N units / N properties / with-without block" variants into **one
template each** using `data-repeat` collections and `data-if` blocks (the system's
intended mechanism — see `src/lib/documents/templates/fields.ts`,
`src/lib/documents/render/merge.ts`).

**66 files → 16 templates.**

| # | slug | name | category | new / replace | source → mechanism | sme_generation |
|---|---|---|---|---|---|---|
| 1 | `loan_agreement` | Loan Agreement | `release` | **replace** (currently DEMO placeholder) | 9 LA variants → 1 body + `data-if` (`isDti`, `isIndividualBorrower`, `hasSecurityCheck`, `isBiMonthly`, `isPerDayInterest`) + `data-repeat="invoices"` | always |
| 2 | `loan_agreement_vienovo` | Loan Agreement (Vienovo — quarterly) | `release` | **new** | 4 Vienovo LA → 1 body + `data-if="isEvery2Months"` | optional |
| 3 | `disclosure_statement` | Disclosure Statement | `release` | **replace** (DEMO) | `DISCLOSURE.doc` + Vienovo variants → 1 body + `data-if="isQuarterly"` | always |
| 4 | `promissory_note` | Promissory Note (MPL) | `release` | **replace** (DEMO) | `PN - MPL.doc` | always |
| 5 | `deed_of_chattel_mortgage` | Deed of Chattel Mortgage | `release` | **replace** (DEMO/placeholder) | `CHATTEL MORTGAGE - {1..4}` → 1 body + `data-repeat="vehicles"` | optional |
| 6 | `real_estate_mortgage` | Real Estate Mortgage | `release` | **replace** (DEMO/placeholder) | `REAL ESTATE MORTGAGE - {1,2}` → 1 body + `data-repeat="properties"` | optional |
| 7 | `consent_form` | Data Privacy Consent Form (2025) | `release` | **new** | 3 consent files → 1 body + `data-if="isCorporateBorrower"` | always |
| 8 | `cancellation_of_chattel_mortgage` | Cancellation of Chattel Mortgage | `servicing` | **new** | 8 cancellation-chattel → 1 body + `data-repeat="vehicles"` + `data-if="isCorpOrDti"` | optional |
| 9 | `cancellation_of_real_estate_mortgage` | Cancellation of Real Estate Mortgage | `servicing` | **new** | 2 files → 1 body + `data-repeat="properties"` | optional |
| 10 | `voluntary_surrender_deed_auto` | Voluntary Surrender + Deed of Sale (Vehicle) | `servicing` | **new** | 4 files → 1 body + `data-repeat="vehicles"` | optional |
| 11 | `voluntary_surrender_deed_rem` | Voluntary Surrender + Deed of Sale (Real Property) | `servicing` | **new** | 2 files → 1 body + `data-repeat="properties"` | optional |
| 12 | `demand_letter` | Demand Letter | `collection` | **replace** (has a live template today) | 10 variants → 1 body + `data-if` (`hasCoBorrower`, `showBorrowerAddress`, `isNonPdc`) | optional |
| 13 | `spa_mortgage_cancellation` | Special Power of Attorney (Mortgage Cancellation) | `servicing` | **new** | 2 near-identical → 1 body + `data-repeat="vehicles"` | optional |
| 14 | `agreement_for_consolidation` | Agreement for Consolidation of Loan Releases | `servicing` | **new** | 1 file + `data-repeat="priorLoans"` | optional |
| 15 | `agreement_check_replacement` | Agreement for Replacement of Checks | `servicing` | **new** | 1 file + `data-repeat="replacementChecks"` | optional |
| 16 | `sme_briefing_sheet` | SME Borrower Briefing Sheet | `release` | **new** | `NEW BRIEFING SME LSLG.pdf` → static HTML body | always |

> New `category = 'servicing'` for the post-close / remedial instruments (#8–11,
> 13–15). It's a free-text column + an admin-list filter label — no schema change.
> `sme_generation = 'optional'` keeps them reachable from the LRA generate picker
> without auto-generating.

---

## 3. New merge fields / collections / flags required

Nothing below exists yet in `fields.ts` (211 keys today). Grouped for a single
additive edit to `FIELD_GROUPS` / `FIELD_COLLECTIONS` / `FIELD_FLAGS`.

### 3.1 New scalar fields (`FIELD_GROUPS`)

| key | label | used by |
|---|---|---|
| `borrowerRepresentative` | Borrower's authorised representative(s) | LA, consolidation, mortgages |
| `borrowerRepresentativeTitle` | Representative title (e.g. "President/Treasurer") | LA |
| `boardResolutionNo` | Board Resolution No. | LA (corp) |
| `corporateSecretary` | Corporate Secretary name | LA (corp) |
| `borrowerTin` | Borrower TIN | PN, LA acknowledgement |
| `coBorrowerTin` | Co-borrower TIN | PN |
| `lenderRepresentative` | LSLGC signatory (default: Kristoffer John C. Dela Cruz) | all |
| `lenderTin` | LSLGC TIN | acknowledgement blocks |
| `amountInWords` | Principal amount in words | PN, LA, mortgages |
| `totalLoanAmountInWords` | Total (principal+interest) in words | LA |
| `monthlyAmortizationInWords` | Monthly amortisation in words | PN, LA |
| `perCheckAmount` / `perCheckAmountInWords` | PDC face value | LA |
| `numberOfPdcs` / `numberOfPdcsInWords` | PDC count | LA |
| `interestRateInWords` | Monthly interest rate in words | PN, LA, mortgages |
| `termMonthsInWords` | Term in words ("Six (6)") | LA, mortgages |
| `loanStartDate` / `loanMaturityDate` | schedule bounds | LA |
| `notaryDocNo` / `notaryPageNo` / `notaryBookNo` / `notarySeries` | notary jurat block | PN, LA, mortgages, cancellations |
| `notaryName` / `notaryPlace` / `registryOfDeeds` | cancellation header | cancellations |
| `mortgageAmount` / `mortgageAmountInWords` | secured sum | mortgages, cancellations |
| `mortgageExecutedOn` | date the mortgage was executed | cancellations |
| `redemptionPeriod` | redemption period text | voluntary surrender |
| `demandCheckAccountNo` | drawee account no. | demand letter |
| `demandReason` | bank dishonour reason | demand letter |
| `spaVehicleDescription` block fields | see collection below | SPA |

### 3.2 New repeat collections (`FIELD_COLLECTIONS`)

| key | label | fields |
|---|---|---|
| `vehicles` | Mortgaged / surrendered vehicles | `makeYearModel, engineNo, chassisNo, plateNo, crNo, mvFileNo, registeredOwner` |
| `properties` | Mortgaged / surrendered real properties | `location, tctNo, areaSqm, areaSqmInWords, technicalDescription` |
| `priorLoans` | Prior loans (consolidation) | `loanNo, totalAmount, totalAmountInWords, releasedOn` |
| `invoices` | Sales invoices financed (LA — Invoice variants) | `invoiceNo, invoiceDate, invoiceAmount, payor` |
| `replacementChecks` | Old checks being replaced | `bankBranch, checkNumber, checkDate, amount` |
| `demandChecks` | Dishonoured checks (demand letter) | `bankName, checkNumber, checkDate, amount` |

### 3.3 New flags (`FIELD_FLAGS`)

`isCorporateBorrower`, `isDtiBorrower`, `isIndividualBorrower`,
`hasSecurityCheck`, `isBiMonthly`, `isQuarterly`, `isEvery2Months`,
`isPerDayInterest`, `isNonPdc`, `showBorrowerAddress`, `isCorpOrDti`,
`hasInvoiceAnnex`.

> `hasCoBorrower` and `isSme` / `isSeafarer` already exist.

### 3.4 `buildSampleContext()` additions

Every new key needs a sample value so the admin **Preview PDF** and the
`render.test.mts` sample render keep working. ~40 scalars + 6 collection arrays.

---

## 4. SME eligibility matrix (client rule applied)

All 16: `seafarer_generation = 'hidden'`.

| `sme_generation = 'always'` | `sme_generation = 'optional'` |
|---|---|
| loan_agreement, disclosure_statement, promissory_note, consent_form, sme_briefing_sheet | everything else (collateral-, situation-, or remedial-specific): vienovo LA, both mortgages, both cancellations, both voluntary-surrender, demand_letter, SPA, consolidation, check-replacement |

---

## 5. Migration strategy

- One SQL file per **batch** (not one 16-template monster), each byte-identical in
  **both** `loanstar/supabase/migrations/` and `supabase/migrations/`, applied via
  the Supabase MCP `apply_migration` (never `db push`, never a hand-picked
  timestamp — rename local files to the timestamp the MCP assigns).
- Pattern = the existing 17 template-seed migrations
  (`WITH t AS (INSERT … ON CONFLICT (slug) DO UPDATE …) INSERT INTO
  document_template_versions … WHERE NOT EXISTS (…)`), bodies in `$body$…$body$`.
- **Replacements** (`loan_agreement`, `disclosure_statement`, `promissory_note`,
  `deed_of_chattel_mortgage`, `real_estate_mortgage`, `demand_letter`): publish a
  **new version** — the app's publish flow archives the current published row; a
  raw migration must do the same in-transaction (`UPDATE … SET status='archived'
  WHERE template_id = t.id AND status='published'` before inserting the new
  `version_no = max+1` as `'published'`). The immutability trigger allows
  `published → archived` only.
- Set `seafarer_generation` / `sme_generation` in the same migration (they're
  columns on `document_templates`, added by
  `20260910015839_release_template_generation_eligibility.sql`).
- `merge_fields` jsonb on each version = the list of keys the body uses (the admin
  UI reads it; keep it accurate).

### Suggested batches

1. **fields.ts + buildSampleContext** (TypeScript, no migration) — all new
   scalars/collections/flags. Gate: `npm test`, `tsc`, admin preview still renders.
2. **Batch A — core release set (replacements):** loan_agreement,
   disclosure_statement, promissory_note. High legal sensitivity.
3. **Batch B — collateral instruments:** deed_of_chattel_mortgage (replace),
   real_estate_mortgage (replace), cancellation_of_chattel_mortgage (new),
   cancellation_of_real_estate_mortgage (new).
4. **Batch C — remedial / servicing:** voluntary_surrender_deed_auto,
   voluntary_surrender_deed_rem, spa_mortgage_cancellation,
   agreement_check_replacement, demand_letter (replace).
5. **Batch D — misc new:** consent_form, agreement_for_consolidation,
   loan_agreement_vienovo, sme_briefing_sheet.
6. **Verify:** render every new/updated slug through `renderTemplateToPdf` with
   `buildSampleContext()`; eyeball PDFs; confirm nothing seafarer-side changed.

---

## 6. Decisions — RESOLVED (client, 2026-09-10)

1. ✅ **Replace** the 6 colliding slugs — publish a new `version_no`, archive the
   current published row in-transaction. Already-signed documents keep their
   frozen storage PDFs; only the template changes.
2. ✅ **Consolidate** the Loan Agreement — one `loan_agreement` body with `data-if`
   switches (`isCorporateBorrower` / `isDtiBorrower` / `isIndividualBorrower`,
   `hasSecurityCheck`, `isBiMonthly`, `isPerDayInterest`, `hasInvoiceAnnex` +
   `data-repeat="invoices"`). No separate `_dti` / `_individual` slugs.
3. ✅ **Do not keep the literal sample data.** Strip every filled-in specific
   (borrower names, amounts, TINs, dates, plate nos, test junk like
   "FRANDASDASD" / "0" / "DHAN") and replace with `{{merge fields}}`. Fix obvious
   structural typos. Legal clause **text** stays; only the variables become
   tokens.
4. ✅ **Cancellation / Voluntary-Surrender / SPA / Check-Replacement / Consolidation
   / Vienovo LA** → seed as **admin-editable templates** only. New `category =
   'servicing'`. `sme_generation = 'optional'` so the LRA can still pull them from
   the generate picker if a situation needs one; not auto-generated.
5. ✅ **Consent Form** → **LRA-generated at release**. `category = 'release'`,
   `sme_generation = 'always'`, `seafarer_generation = 'hidden'`.
6. **SME Briefing** → seed as a static-HTML template (`category = 'release'`,
   `sme_generation = 'always'`), no merge fields. (Not raised as blocking; assumed.)

### Still to confirm during conversion (non-blocking, per-document)

- Any clause that reads as a placeholder rather than real legal text (e.g.
  `LOAN AGREEMENT - No Security check and termination fee` has `"0"` /
  `"PRES"` party data) — I'll seed the clause skeleton and mark
  `[VERIFY WORDING]` inline for Legal.
- Whether `consent_form` should appear in the borrower portal too (out of scope
  here — release generation only).

---

## 7. DO NOT

- Do not paraphrase or "clean up" legal clauses — tokenise values only.
- Do not `supabase db push`; do not invent migration timestamps; do not edit an
  applied migration.
- Do not touch `seafarer_generation` for any existing seafarer slug.
- Do not delete or hard-edit published `document_template_versions` rows — archive
  and supersede.
- Do not seed the test-junk `.doc` variants.
