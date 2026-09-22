# Client Document Template Fidelity Design

## Goal

Make every generated Admin and LRA document visually and textually faithful to the client's retained Loan Star source document for its product, borrower type, collateral count, and document variant.

## Source Authority

The retained originals are the only layout and wording authority:

- SME and Individual: `C:\Users\Rovick\Downloads\LSLGC Calculator and Docs`
- SF: `C:\Users\Rovick\Downloads\SFCalculator`

The existing Disclosure Statement is an implementation example only. It is not a substitute authority for another document family. A document may be compacted to one page only when its matching source document fits on one page with the same supported data shape.

## Fidelity Contract

For each source variant, the generated output must match the source in these respects:

- page size, orientation, margins, header and footer positions, and page count;
- wording, clauses, labels, capitalization, numbering, and conditional sections;
- font family, size, weight, alignment, indentation, spacing, and line-height;
- exact position, width, border, and column/row geometry of genuine tables;
- underline-based entry fields where the source uses underlines, with no replacement table/grid;
- location and dimensions of signature, witness, acknowledgement, notarial, and annex blocks;
- supported one-to-many collateral sections, using the source layout for the actual count;
- populated Chromium/Gotenberg output, including wrapping and page breaks.

The source is allowed to use tables. The migration must not invent tables as a general field-layout tool. It must preserve an underline, plain-text, or table treatment exactly as the source does.

## Variant Model

The system will use an explicit document-variant resolution layer rather than one generic body per document type. A resolved variant is determined from the document family and applicable facts such as borrower type, product, security type, collateral type, and collateral/property count.

This preserves the source's wording and geometry while still allowing the system to generate documents from structured borrower and collateral data.

| Family | Retained source variants to map | Required resolution dimensions |
| --- | --- | --- |
| Chattel mortgage | 1, 2, 3, and 4 units | borrower/company form, unit count |
| Chattel cancellation | individual and Corp/DTI; 1, 2, 3, and 4 units | borrower form, unit count |
| Real-estate mortgage | 1 property and 2 properties | property count |
| REM cancellation | 1 property and 2 properties | property count |
| Voluntary surrender and deed | Auto units 1-4; REM 1-2 | asset type, count |
| Loan agreement | base, bi-monthly, per-day, invoice, multiple-invoice, DTI, no-security, auto/individual, and Vienovo variants | product/payment/security variant |
| Demand letter | SME, individual, co-borrower, address/no-address, and PDC state | borrower form, address availability, collection state |
| Consent form | corporate and individual | borrower form |
| SF documents | disclosure, promissory note, demand notice, AR ATM with/without spouse | SF product and spouse state |

The mapping pass will identify which of the 31 existing published templates are covered by these sources, which need a new explicit branch, and which have no retained original. No unreferenced current template will be restyled on assumption.

## Implementation Components

1. **Source inventory and evidence registry**
   - Convert retained legacy `.doc` originals in a read-only copy for inspection.
   - Record path, SHA-256, document family, variant dimensions, page count, and provenance.
   - Distinguish active originals from duplicate/backup copies by content comparison, not filename alone.

2. **Per-variant fidelity manifest**
   - For every source, capture page geometry, styles, exact field treatment, tables, fixed text, variable text slots, signatures, acknowledgements, annexes, and page-break rules.
   - Use measurements from rendered originals. Unknown mapping or ambiguity is a blocker, not a reason to guess.

3. **Variant resolver and context contract**
   - Extend document selection so it resolves the exact source-derived branch before rendering.
   - Define test data for 1/2/3/4 collateral units, 1/2 properties, corporate, individual, SF, spouse, address/no-address, and applicable product/payment branches.
   - Keep reusable data tokens, but permit a variant to have source-specific static wording and markup.

4. **Source-faithful template conversion**
   - Replace generic grids with source-matching underlines, paragraphs, tables, and fixed-position sections.
   - Use the source's own compact page treatment. Reduce space only through the source's typography and layout rules, never by arbitrary shrinking.

5. **Render, compare, and regress**
   - Render both representative and boundary-length populated samples through the configured Docker Chromium/Gotenberg renderer.
   - Compare source and generated pages visually, then verify text and selection behavior through automated tests.
   - A variant passes only when unexplained geometry, pagination, wording, or field-treatment differences are absent.

## Delivery Sequence

Work is grouped by source family, with a completed family requiring all variants, populated render comparison, and regression coverage before moving on:

1. Disclosure and SF foundation (prove underline/fixed-layout strategy).
2. SME/Individual application and consent forms.
3. Loan agreement, promissory note, and demand-letter families.
4. Chattel and real-estate security families, including count-specific variants.
5. Servicing, receipt, voucher, and remaining release documents that have a retained source.

## Non-Negotiable Validation

- Admin Preview and LRA release must use the same Chromium/Gotenberg render path for review.
- The fallback renderer is not acceptable visual evidence.
- Every changed variant is rendered and manually inspected at full page size.
- Automated tests prove deterministic selection for every registered variant and its count boundaries.
- A source-without-a-mapping entry remains explicitly blocked until identified; it must not silently inherit a similar template.

## Scope Boundaries

This work aligns document rendering and selection. It does not reinterpret legal content, invent source variants, or alter the retained originals. If an original contains a legal/content inconsistency, it will be recorded for client confirmation rather than silently corrected.
