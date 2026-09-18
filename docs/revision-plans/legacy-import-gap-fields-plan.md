# Close the SF/SME legacy-import gap fields — phase plan

Adds a home for the fields the September 12 audit
(`docs/revision-plans/legacy-data-import-audit-sf-sme.md`) found genuinely
missing from the schema, so the import template can eventually collect them
instead of listing them on the "Not Captured" tabs. **User decision
(2026-09-12): add all of them, except PIN — see DO NOT.**

**Grounding done before writing this plan:** every field below was already
checked against the live schema and the relevant TypeScript types while
writing the audit doc — table/column/jsonb-key names here are taken from
that verified pass, not re-guessed. Two exceptions are flagged explicitly
below as **unverified shape — confirm before writing code**.

**Work location:** new branch off `main` (per the project's current
single-branch-on-main convention — confirm this is still the rule before
branching; if so, small enough to do as direct commits on `main` per field
group, gated the same way).

---

## DO NOT

- **Do not add a PIN field anywhere.** User explicitly excluded it
  (2026-09-12) — storing customer ATM PINs is a security liability with no
  legitimate use here. If asked again later, point back to this line rather
  than re-adding it.
- Do not touch `seafarer_generation` template eligibility or any unrelated
  document-template column while in `business_info` / `fields.ts`.
- Do not invent migration timestamps or use `db push` — apply via Supabase
  MCP `apply_migration`, same file byte-identical in both
  `loanstar/supabase/migrations/` and `supabase/migrations/` (established
  convention, see `[[project-document-template-system]]`).

---

## Phase 1 — `borrowers` table (individual/seafarer identity)

**Migration**, new nullable columns:

| Column | Type | Covers audit item |
|---|---|---|
| `tin` | `text` | SF #68 / SME "TIN No." |
| `notary_id_number` | `text` | SF #38 "ID For Notary (Borrower)" |
| `notary_id_place_date` | `text` | SF #39 "Id place/date" |

Co-borrower's notary ID (SF #40-41) goes on the `co_borrowers` jsonb entry
instead (Phase 2) — a co-borrower isn't a full `borrowers` row.

**Files:** new migration only; add the 3 keys to wherever `borrowers` is
typed for forms (`src/lib/borrowers/types.ts` — confirm exact export name
before editing, don't assume it mirrors `FinancialInfo`'s pattern blindly).

---

## Phase 2 — `loan_applications.co_borrowers` jsonb (`CoBorrower` type)

**No migration — jsonb.** Extend the type in
`src/lib/applications/co-borrower.ts`:

```ts
export type CoBorrower = {
  fullName: string;
  address: string;         // already exists — was miscategorized as a gap
                            // in the first audit pass, corrected 2026-09-12
  notaryIdNumber?: string;  // new — SF #40
  notaryIdPlaceDate?: string; // new — SF #41
};
```

Grep every consumer of `CoBorrower` before editing (form, display, PDF
merge context) so the two new optional fields don't break a narrower type
assumption somewhere.

---

## Phase 3 — `borrowers.financial` jsonb (`FinancialInfo` type)

**No migration — jsonb.** In `src/lib/borrowers/types.ts`:

```ts
export type FinancialInfo = {
  // existing: bankName, accountNumber, accountType, ...
  initialBalance?: number;     // new — SF #56
  bankNameUnder?: string;      // new — SF #51, meaning still fuzzy; capture
                                // verbatim under this name until the client
                                // clarifies what it actually means
};
```

---

## Phase 4 — `computations` table + `other_deductions` jsonb

**Migration**, new nullable columns on `computations`:

| Column | Type | Covers |
|---|---|---|
| `interest_period_start` | `date` | SF #44 "Interest from" |
| `interest_period_end` | `date` | SF #45 "Interest to" |
| `addon_interest_amount` | `numeric` | SF #18 "Add-on Interest" — the peso figure; `addon_months` (already stored) is the month count, this is new and separate |

**No migration — jsonb.** `OtherDeductions` in
`src/lib/computation/types.ts`:

```ts
export type OtherDeductions = {
  // existing: otherLoan, advancePayment, previousLoanBalance, accountOpening, ...
  cashCard?: number;   // new — SF #31, meaning unconfirmed; capture verbatim
};
```

---

## Phase 5 — `masterlist` table

**Migration**, new nullable columns:

| Column | Type | Covers |
|---|---|---|
| `remarks` | `text` | SF #57 |
| `additional_remarks` | `text` | SF #58 |
| `branch` | `text` | SF #37 "Branch Office" — only if the client actually confirms a use; cheap enough to add regardless per the "add it just in case" decision |
| `legacy_prepared_by` | `text` | SF #74 "Prepared By" — **labeled `legacy_` deliberately**: this is a historical-import value only, not a live audit field. Do not wire any current UI flow to write to this column — the system's real "who did this" trail is `created_by`/`updated_at`/audit logging elsewhere. |
| `legacy_date_modified` | `timestamptz` | SF #75 "Date Modified" — same `legacy_` labeling rule as above |

---

## Phase 6 — `pdc_checks` table

**Migration**, new nullable columns:

| Column | Type | Covers |
|---|---|---|
| `issued_by` | `text` (free text, not enum yet — sheet's exact values unconfirmed) | SF #49 "Borrower Issued Check" |
| `legacy_check_issued_no` | `text` | SF #72 "Check Issued No." |
| `legacy_blank_check_issued_no` | `text` | SF #73 "Blank Check Issued No." |

---

## Phase 7 — `loan_applications.sub_agent`

**Migration**, one nullable column:

| Column | Type | Covers |
|---|---|---|
| `sub_agent_name` | `text` | SF #70 "Sub-Agent" — **text, not a `uuid` FK to `profiles`** like `agent_user_id`. Legacy sub-agents from old records won't reliably map to a real system user account; keep this a free-text label, not a relation. |

---

## Phase 8 — SME `business_info` jsonb (`BusinessInfo` type)

**No migration — jsonb.** In `src/lib/borrowers/business-info.ts`:

```ts
export type BusinessInfo = {
  // existing: companyName, tin, natureOfBusiness, companyOfficers, ...
  tinIdDate?: string;              // new — "Id Date" (company), col 39
  representativeTin?: string;      // new — "Representative Tin / Id", col 40
  representativeIdDate?: string;   // new — "Id Date" (representative), col 41
  corporateSecretary?: string;     // new — col 43
  boardResolutionNo?: string;      // new — col 44
};
```

**Then wire the two document-template placeholders that are currently
hardcoded blank.** In `src/lib/lra/template-context.ts`:

```ts
// before (confirmed hardcoded, 2026-09-12 audit):
boardResolutionNo: "",
corporateSecretary: "",

// after:
boardResolutionNo: isSme ? (borrower.businessInfo?.boardResolutionNo ?? "") : "",
corporateSecretary: isSme ? (borrower.businessInfo?.corporateSecretary ?? "") : "",
```

This closes a real document-generation gap, not just an import gap — SME
corporate documents (Loan Agreement, etc.) currently render these two
fields empty regardless of what's on file.

---

## Phase 9 — SME collateral: `RemLegalDescription` (real-estate mortgage)

**No migration — jsonb**, inside `verifications.rem_inspection`. In
`src/lib/cig/collateral-inspection.ts`:

```ts
export type RemLegalDescription = {
  location?: string | null;
  tctNo?: string | null;
  areaSqm?: number | null;
  technicalDescription?: string | null;
  taxDeclarationNo?: string | null;  // new — SME col 101
  floorAreaSqm?: number | null;      // new — SME col 103; `areaSqm` above
                                      // is treated as "Lot Area" (col 102)
                                      // going forward — document that split
                                      // clearly wherever areaSqm is labeled
                                      // in the CIG form and any document
                                      // template that renders it
};
```

Check `RemInspectionForm.tsx` and every document template using
`{{areaSqm}}` before relabeling it as "Lot Area" — if a live template
already prints it as a generic "Area," relabeling the *form* without
touching the *template* text would be confusing; both need to agree.

---

## Phase 10 — Not on this plan: two items that need a client answer, not code

These stay unresolved regardless of schema work — don't build against a
guess:

- **Bank Name Under** (Phase 3) and **Cash Card** (Phase 4) are being added
  as verbatim free-text/number fields per the "add it just in case"
  decision, but their actual meaning is still unconfirmed. Flag both to the
  client the next time an open-questions list goes out.
- **Loan Number ambiguity** (`application_no` vs. `loan_account_no`) is not
  a new-field problem — no action here closes it. Still needs a client
  answer.

---

## Unverified shapes — confirm before writing code

- **SME "Representative/Co-Borrower" (col 5) and "Position" (col 6)**: the
  audit guessed `business_info.companyOfficers[0]`, matching what
  `template-context.ts` already does for `borrowerRepresentative`. Before
  adding an import column for this, confirm with a real SME record whether
  `companyOfficers[0]` is actually reliably "the" representative, or whether
  a dedicated `businessInfo.representative` field should be added instead
  of overloading the officers list.
- **Months/Days Of Interest** (SME col 45): audit marked this "Partial"
  against `computations.terms`/`addon_months`. Confirm exactly what unit
  the client's column holds (days? months? something else?) before deciding
  whether it needs its own new column or truly is one of the existing two.

---

## Gate every phase

`npm test`, `tsc`, `next build` clean, same as every other change in this
codebase (per `[[project-test-runner-mts-only]]` — only `*.mts` tests run).
Migrations applied live via Supabase MCP `apply_migration`, both migration
folders kept byte-identical.

## After this lands

Move the now-fillable fields from each "Not Captured" tab into the
corresponding "SF Import" / "SME Import" tab in
`docs/Loanstar_Legacy_Data_Import_Template.xlsx`, and update
`legacy-data-import-audit-sf-sme.md`'s status column from Gap → Fillable for
each one closed.
