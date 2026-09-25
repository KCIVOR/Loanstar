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
| 9 | `cash_voucher` | release | v1 | No source |
| 10 | `check_voucher` | release | v1 | No source |
| 11 | `ar_cash_voucher` | release | v1 | No source |
| 12 | `ar_check_voucher` | release | v1 | No source |
| — | `demand_letter_sme` | lra | *(draft v1, unpublished)* | Fixed — new template, source was `Demand Letter - SME.doc` |

## Tier 2 — Moderate
A real table + repeat block, or several distinct sections.

| # | Slug | Category | Published | Status |
|---|------|----------|-----------|--------|
| 13 | `ar_atm_voucher` | release | v7 | Fixed |
| 14 | `final_computation_sheet` | computation | v1 | No source |
| 15 | `consent_form` | release | v2 | Fixed |
| 16 | `agreement_check_replacement` | release | v2 | Confirmed OK |
| 17 | `agreement_for_consolidation` | release | v2 | Confirmed OK |
| 18 | `blri` | release | v1 | |

## Tier 3 — Complex
Legal instrument: notarization block, witness/acknowledgment tables, precise
formatting (e.g. Disclosure's checkbox-grid tab-stops).

| # | Slug | Category | Published | Status |
|---|------|----------|-----------|--------|
| 19 | `disclosure_statement` | release | v9 | Fixed (redone 2026-09-25 against a true visual comparison, not just text) |
| 20 | `promissory_note` | release | v4 | Fixed — **draft pending** (unrelated to this project, check before touching) |
| 21 | `spa_mortgage_cancellation` | release | v3 | Fixed |
| 22 | `cancellation_of_chattel_mortgage` | release | v3 | Fixed |
| 23 | `cancellation_of_real_estate_mortgage` | release | v2 | No source |
| 24 | `deed_of_chattel_mortgage` | release | v4 | Fixed |
| 25 | `real_estate_mortgage` | release | v3 | No source |
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
- `application_form` and `promissory_note` each have an unpublished draft that predates this project — inspect before assuming it's related to fidelity work.
- The "Upload a Word file" feature (real `.docx` uploaded, `{{field}}`/`{{#field}}...{{/field}}` tags inserted directly in Word, rendered via docxtemplater + Gotenberg's LibreOffice route) is the more accurate alternative to hand-rebuilding a document as HTML — see `src/lib/documents/render/docx-merge.ts`, `src/lib/documents/render/gotenberg-office.ts`, and `src/components/admin/DocxTemplateEditor.tsx`. Prefer it over further HTML rebuilds when a real source file is available; the demand_letter_sme entry above is the one document actually built as HTML after that upload path was tried first and set aside by request, not because the feature failed.
