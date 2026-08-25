# SME Application Form Alignment

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The user runs **one phase at a time** and reviews the summary before the next phase starts.

**Goal:** Align on-screen SME Individual and SME Corporate application forms to the verified client PDFs, with add/remove repeating rows, and keep every page that renders or validates those forms in sync — without touching Seafarer, Individual-segment, or unrelated modules.

**Architecture:** One shared component (`ApplicantProfileFields`) already branches on `segment` + `entityType`. Keep that. Gate Seafarer-only fields behind `segment === "seafarer"`. Store new scalars in existing JSONB (`borrowers.business_info`, `borrowers.profile_data`). Reuse `permanent_address` as the Individual PDF **Provincial** address (print already maps it that way). Print templates already `data-repeat` Corporate tables — variable row counts work without a migration if merge context stays additive.

**Tech Stack:** Next.js App Router, existing UI kit (`Field` / `Button` / `Select`), `borrowers` JSONB, node:test (`.mts`). No new npm packages. **No Postgres migration.**

---

**Ground rules (every phase):**
- Closed **Allow** / **Do not touch**. If another file is required, stop and flag before editing it.
- After each phase, `git diff --stat` — every changed path must be on that phase's Allow list.
- Do not commit unless the user explicitly asks.
- `npx tsc --noEmit` no worse than known pre-existing test-file errors; run the tests named in the phase.
- One phase at a time. Do not start Phase N+1 until Phase N Verify passes.

This plan **supersedes** optional Phase E of `docs/sme-dedicated-application-forms-implementation-plan.md` (on-screen capture). Do not reopen that file's print-slug work. Do not treat `docs/sme-application-forms-extraction.md` as stale — it matches the verified PDFs; use **this plan's locked inventory** if the two ever disagree.

**Plan verified 2026-08-21** against PDF widget extracts (`docs/_tmp_pdf_extract/`), `ApplicantProfileFields`, completeness/print callers, borrower profile GET consumers, and RLS. Corrections from that pass are already inlined below (Phase 3 `companyName` collision, Phase 6 `noOfDependents` print, Phase 7 GET-profile consumers).

---

## How to use this file

1. Read **Audit**, **Locked product decisions**, and **Hard constraints** before touching code.
2. Execute phases in order.
3. Seafarer completeness `missing[]` is frozen byte-identical (existing test). Individual-segment completeness is frozen for this plan.

---

## Audit (verified 2026-08-21)

### Source of truth (client PDFs)

Path: `C:\Users\Rovick\Downloads\SYSTEM DEV\Step 1 - Processing-CSA\SME - Individual\`

| Form | File | Fillable data fields |
|---|---|---|
| Individual / Sole Prop | `Individual Application Form LSLG v.4.pdf` | 89 (90 widgets minus Reset) |
| Corporate / Business | `Business Application LSLG v.4.pdf` | 103 (104 widgets minus Reset) |

Paper row counts (3 officers, 5 stockholders, 3 trade/credit/banks, 4 dependents, 4 references) are **visual defaults, not caps**. Digital tables use Add / Remove like today's References block.

### Live data (Supabase MCP)

| Segment / entity | Application count |
|---|---|
| `sme` + `individual` | 9 |
| `sme` + `corporate` | 7 |
| `seafarer` | 52 |
| `individual` segment | 2 |

`borrowers.business_info`, `profile_data`, `dependents`, `references_data`, `present_address`, `permanent_address` are **JSONB**. `borrowers.landline` already exists as `text`. Additive keys need **no migration**.

Published print templates (do not edit in this plan):

| Slug | Name |
|---|---|
| `application_form` | Loan Application Form (Seafarer — freeze) |
| `application_form_sme_individual` | SME Individual Loan Application |
| `application_form_sme_corporate` | SME Corporate Loan Application |

Corporate print body already uses `data-repeat` for `companyOfficers`, `majorStockholders`, `tradeCustomers`, `tradeSuppliers`, `creditReferences`, `bankAccounts`. Individual print already labels Provincial as `{{permanentAddress}}` and has `{{landline}}` / `{{noOfDependents}}`.

### What the UI does today

Single component: `src/components/borrowers/ApplicantProfileFields.tsx`

| Flag | Meaning |
|---|---|
| `isSme` | `segment === "sme"` |
| `isCorporate` | SME + `entityType === "corporate"` |
| `isIndividualSme` | SME + `entityType === "individual"` |

Problems vs PDFs:

1. **Seafarer leftovers on SME.** Header still has Terms + Purpose of loan. Personal block still has Age, Viber, Teams, Roaming, Facebook, Education, Mortgage, “Permanent address same as present”. Present/Permanent labels instead of Present/Provincial. Ownership options are Seafarer (`Owned / Rented / With Parents / Company-provided`) not PDF (`Owned / Owned (Mortgage) / Rented / Parent Owned / Used free`). Type of loan options are wrong (`Housing loan / Personal loan` instead of RE Mortgage / MPL / REMortgage).
2. **Missing PDF header fields.** Date Applied (`business_info.dateApplied` exists, not wired). Type Of Loan (`profile_data.typeOfLoan` already read by print, not wired). Applicant Landline (`borrowers.landline` exists, not shown). No. of dependents (print derives from `dependents.length`).
3. **Section mix-up.** Sole-prop employment is labeled **Business Application**. Corporate facts sit under the same heading. Spouse + income only render for `isIndividualSme`, so a Corporate representative cannot fill Individual-form spouse/income even though SME Corporate is two paper sheets.
4. **Fixed `padRows(..., 3|5)`** on officers, stockholders, customers, suppliers, credit refs, bank accounts — no Add/Remove. References and dependents already have Add/Remove (the pattern to copy). Dependents still show a 4th **Tel / CP** column the Individual PDF does not have.
5. **Office address** is one line; Corporate PDF has two lines.

### Callers of `ApplicantProfileFields` (must stay correct after alignment)

| File | Today | Needed |
|---|---|---|
| `src/app/csa/applications/[id]/page.tsx` | Passes `segment` + `entityType` | No prop change if component API stays |
| `src/app/borrower/applications/[id]/page.tsx` | Passes both | Same |
| `src/app/committee/applications/[id]/page.tsx` | Passes both | Same |
| `src/app/cig/applications/[id]/page.tsx` | Passes both (two mounts) | Same |
| `src/components/cig/EditApplicationFormModal.tsx` | Passes both | Same |
| `src/components/collection/OriginationPacketPanel.tsx` | Passes both, `readOnly` | Same |
| `src/app/borrower/profile/page.tsx` | **Does not pass segment** (defaults seafarer). PATCH omits `businessInfo` even though the API accepts it | **Must fix** so SME borrowers see/save the SME form |

Endorse gate: `src/lib/csa/application-form-completeness.ts` (called from `src/lib/csa/application.ts`). SME still requires Seafarer leftovers **requested terms** and **purpose of loan**.

Print merge: `src/lib/documents/generators/application-form-context.ts` already emits SME keys. Autofill: `src/lib/dev/fake-data.ts` `fakeBorrowerProfile` SME arms.

### Storage mapping (no new columns)

| PDF field | Store |
|---|---|
| Date Applied | `business_info.dateApplied` |
| Type Of Loan | `profile_data.typeOfLoan` |
| Loan Desired | `profile_data.loanDesired` (already) |
| Sales Agent | `business_info.salesAgent` (already) |
| Present address + ownership + yrs | `present_address` |
| Provincial address + ownership + yrs | `permanent_address` (relabel on SME only) |
| Landline | `borrowers.landline` |
| No. of dependents | `profile_data.noOfDependents` (today print uses table length because `0` is falsy; Phase 6 prefers this key then length) |
| Dependents | `dependents` JSONB — SME columns: name, age, occupation |
| References | `references_data` — SME columns: name, address, relationship, phone |
| Spouse / income / employment / company tables | `business_info` |
| Office address line 2 | `business_info.officeAddressLine2` (new optional key) |

---

## Locked product decisions

| # | Decision |
|---|---|
| P1 | **SME first.** Do not change Individual-segment capture or print in this plan. Individual-segment still has no application-form template; leave that failure path alone. |
| P2 | SME Individual (`entityType=individual`) = **Individual PDF only**. Employment / spouse / income / dependents / references belong on that sheet. Do **not** show Corporate tables (officers, stockholders, trade, credit, banks). |
| P3 | SME Corporate (`entityType=corporate`) = **both PDFs on one screen**: Individual / Representative half (full Individual PDF fields) then Business Application half (Corporate PDF). Representative gets spouse, income, dependents, references, and personal employment. Company facts + repeating tables stay Corporate-only. |
| P4 | Repeating tables: **Add / Remove** like References. Paper 3/4/5 is not a maximum and not a required starting count. Persist the actual array (do not keep `padRows` on save). Empty existing padded `{}` rows may be removed by the user. |
| P5 | Allowed UX deviations: Civil status stays a **dropdown** (PDF Status is free text). Type of loan stays a dropdown with the PDF option lists. “Other” on ownership/nature/account-type is OK. |
| P6 | Hide Seafarer-only fields when `isSme`: Terms, Purpose of loan, Rank, Age, Viber, Teams, Others, Roaming, Facebook, Education, Mortgage, same-as-present checkbox, USD/PHP financial, manning, allottee, PIC work. Do not delete those fields from the Seafarer path. |
| P7 | Print: **additive merge context only**. Join `officeAddress` + `officeAddressLine2` into existing `businessAddress`. Do **not** insert a new `document_template_versions` row unless a later plan asks. Do **not** edit published `application_form`. |
| P8 | Completeness: SME must **stop requiring** requested terms and purpose of loan. Keep identity + PDF business-minimum checks. Do not add Date Applied / Type Of Loan as endorse blockers. Seafarer and Individual-segment `missing[]` stay frozen. |

---

## Hard constraints — violating any of these fails the phase

### Never break existing behavior

1. When `segment !== "sme"`, `ApplicantProfileFields` must remain behavior-identical (same fields, same labels, same completeness).
2. Seafarer `application_form` published body and slug resolution for `segment === "seafarer"` must stay identical.
3. Individual-segment form, completeness, and “no template” print error must stay identical.

### Never touch these paths

- `src/lib/computation/**` and `src/lib/computation/sf.ts`
- LRA / AR / collector / remedial / reports / LoanBot
- Checklist seeds, `stage_check_mapping`, NCL, `sme_duplication`
- Release / PN / BLRI / demand / computation-sheet generators
- `src/middleware.ts`, `src/lib/permissions/server.ts`
- Any file under `supabase/migrations/`
- MCP `apply_migration` / DDL
- Published Seafarer template body (`application_form`)
- `docs/sme-dedicated-application-forms-implementation-plan.md` (historical)

### Data / migrations

- **No new Postgres tables or columns.** JSONB additive keys only.
- Do not rewrite existing SME `business_info` rows. New keys are optional; old keys keep working.
- Do not rename `dateEstablished` (PDF typo “Date Establised” is display-only).

### Scope fence

- Do not rebuild `ApplicantProfileFields` as a new app or split it into a form builder.
- A small `RepeatingRows` helper next to it is allowed. Do not extract a generic form framework.
- Do not add payment, QR, scanner, analytics, or marketplace features.
- Do not change CIG/Committee **workflow** — only the form they already embed.

---

## File map

| File | Role in this work |
|---|---|
| `src/components/borrowers/RepeatingRows.tsx` | **Create.** Add/Remove list used by Corporate tables (and optionally dependents). |
| `src/components/borrowers/ApplicantProfileFields.tsx` | **Modify.** SME layout, field gates, remove `padRows` for Corporate tables. |
| `src/lib/borrowers/business-info.ts` | **Modify.** Add `officeAddressLine2?: string`. |
| `src/lib/csa/application-form-completeness.ts` | **Modify.** SME no longer requires terms/purpose. |
| `src/lib/csa/__tests__/application-form-completeness.test.mts` | **Modify.** SME tests; freeze Seafarer + Individual. |
| `src/lib/documents/generators/application-form-context.ts` | **Modify.** Join office line 2 into `businessAddress`; fix `noOfDependents`. |
| `src/lib/documents/generators/__tests__/application-form-context.test.mts` | **Modify** only if context output for SME changes. |
| `src/lib/dev/fake-data.ts` | **Modify.** SME autofill: `typeOfLoan` PDF values, `officeAddressLine2`, landline, no padded-only tables. |
| `src/app/borrower/profile/page.tsx` | **Modify.** Pass segment/entityType; include `businessInfo` in PATCH. |
| `src/app/api/borrower/profile/route.ts` | **Modify.** GET returns latest application `segment` + `entityType` (additive JSON). |

**Callers — expected no edits** (they already pass `segment`/`entityType`):

- `src/app/csa/applications/[id]/page.tsx`
- `src/app/borrower/applications/[id]/page.tsx`
- `src/app/committee/applications/[id]/page.tsx`
- `src/app/cig/applications/[id]/page.tsx`
- `src/components/cig/EditApplicationFormModal.tsx`
- `src/components/collection/OriginationPacketPanel.tsx`

If a caller change is truly required, stop and extend that phase's Allow list in this file before editing.

---

## Phase 0 — Inventory lock (docs only)

**Allow:** this plan file only (already written).

- [ ] Confirm with the implementer: P2/P3/P4/P6/P8 are locked. If product wants Corporate **without** spouse/income, stop — that contradicts P3.

**Verify:** no code diff.

---

## Phase 1 — Types + repeating-row helper

**Allow:**
- `src/lib/borrowers/business-info.ts`
- `src/components/borrowers/RepeatingRows.tsx`

- [ ] Add `officeAddressLine2?: string` next to `officeAddress` in `BusinessInfo`. Do not rename existing keys.

```ts
  officeAddress?: string;
  /** Corporate PDF second office-address line. Joined into print `businessAddress`. */
  officeAddressLine2?: string;
```

- [ ] Create `RepeatingRows` matching the References pattern (Add secondary button, Remove danger-soft, optional column header row). Persist the array the parent passes — **no padding**.

```tsx
"use client";

import { Button } from "@/components/ui";
import type { ReactNode } from "react";

export function RepeatingRows<T extends object>({
  title,
  addLabel,
  rows,
  emptyRow,
  columnsClassName,
  headers,
  onChange,
  renderRow,
  disabled = false,
}: {
  title: string;
  addLabel: string;
  rows: T[] | undefined;
  emptyRow: () => T;
  columnsClassName: string;
  headers: string[];
  onChange: (next: T[]) => void;
  renderRow: (row: T, index: number, update: (patch: Partial<T>) => void) => ReactNode;
  disabled?: boolean;
}) {
  const list = rows ?? [];
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-navy-900">{title}</h2>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={disabled}
          onClick={() => onChange([...list, emptyRow()])}
        >
          {addLabel}
        </Button>
      </div>
      <div
        className={`mb-2 hidden gap-3 text-xs font-semibold uppercase tracking-wide text-ink-400 sm:grid ${columnsClassName}`}
      >
        {headers.map((h) => (
          <span key={h}>{h}</span>
        ))}
        <span className="w-[72px]" aria-hidden />
      </div>
      {list.map((row, i) => (
        <div
          key={i}
          className={`mb-3 grid gap-3 border-b border-line-soft pb-3 ${columnsClassName}`}
        >
          {renderRow(row, i, (patch) => {
            const next = [...list];
            next[i] = { ...row, ...patch };
            onChange(next);
          })}
          <Button
            type="button"
            variant="danger-soft"
            size="sm"
            className="w-[72px] self-center justify-self-end"
            disabled={disabled}
            aria-label={`Remove row ${i + 1}`}
            onClick={() => onChange(list.filter((_, idx) => idx !== i))}
          >
            Remove
          </Button>
        </div>
      ))}
    </div>
  );
}
```

**Verify:** `git diff --stat` is only the two Allow files. `npx tsc --noEmit` (ignore pre-existing test-file noise).

---

## Phase 2 — SME header + applicant data (Individual PDF)

**Allow:**
- `src/components/borrowers/ApplicantProfileFields.tsx`

Do **not** change the `!isSme` branches of header / personal / financial / manning / allottee.

- [ ] Add option constants (SME-only):

```ts
const SME_INDIVIDUAL_TYPE_OF_LOAN = [
  "Business Loan",
  "Auto Loan",
  "RE Mortgage",
  "MPL",
];
const SME_CORPORATE_TYPE_OF_LOAN = [
  "Business Loan",
  "Auto Loan",
  "REMortgage",
];
const SME_OWNERSHIP_OPTIONS = [
  "Owned",
  "Owned (Mortgage)",
  "Rented",
  "Parent Owned",
  "Used free",
];
```

- [ ] Header when `isSme`: **Date Applied** (`biz.dateApplied`, `type="date"`), **Type Of Loan** (dropdown from the two lists above, write `profileData.typeOfLoan`), **Loan Desired**, **Sales Agent**. Do **not** render Terms or Purpose of loan for SME.
- [ ] Personal card when `isSme`:
  - Names in PDF order: **Last / First / Middle**, then Status (existing civil-status dropdown). Seafarer keeps First / Middle / Surname.
  - Present address, ownership (`SME_OWNERSHIP_OPTIONS`), yrs of stay. **No Mortgage field.**
  - Provincial address = existing `permanentAddress` fields, labels **Provincial address / Ownership / Yrs of stay**. **No** “same as present” checkbox.
  - Place of birth, birth date. **No Age.**
  - Landline (`profile.landline`) + Mobile + Email.
  - **No. of dependents** → `setProfileData({ noOfDependents: v })`.
  - Hide Viber, Teams, Others, Roaming, Facebook, Education.
- [ ] Keep Seafarer personal block exactly as it is under `!isSme` (or `isSeafarer`). Prefer an `isSme ? (<>SME fields</>) : (<>existing personal block</>)` split so Seafarer is a copy-paste of today's JSX, not a field-by-field ternary soup.

**Verify:** Open a **Seafarer** application in CSA — Terms, Purpose, Viber, Permanent, Mortgage still present. Open SME Individual — Date Applied, Type Of Loan (includes MPL), Provincial, Landline, no Terms/Viber.

---

## Phase 3 — SME Individual sheet remainder (employment, spouse, income, dependents, refs)

**Allow:**
- `src/components/borrowers/ApplicantProfileFields.tsx`

- [ ] Relabel: for `isIndividualSme`, employment card is **I. Applicant data — employment** (or keep “II. Business / employment” **without** the “Business Application” group header). Remove the “Business Application” heading on sole-prop.
- [ ] Sole-prop employment fields stay: company/employer, address, contact, position, yrs of stay, yrs of operation, company email, website, previous employer block. These already exist — only heading/placement.
- [ ] Show spouse + income for **all SME** (`isSme`), not only `isIndividualSme`. Corporate representative fills the same Individual PDF blocks.
- [ ] Dependents when `isSme`: three columns **Name / Age / School Attended / If Working Employer's Name** mapped to `name`, `age`, `occupation`. Keep Add/Remove. Do **not** show Tel/CP on SME. Seafarer dependents keep four columns including `contactNo`.
- [ ] References when `isSme`: keep current four columns + relatives-in-province block. Show relatives-in-province for **all SME**, not only `isIndividualSme`.
- [ ] Corporate personal employment: when `isCorporate`, still show the Individual employment block **above** Facts about the company (position, yrs of stay, yrs of operation, previous employer, company email/website). **Name of company** (Facts) and **Company or employer's name** (Individual employment) are the **same stored key** `business_info.companyName` — two labels, one value. Do not add `representativeEmployerName`. Previous-employer keys stay separate and still show for the Corporate representative.

**Collision rule (locked):** one `companyName`. Sole-prop uses it as employer/business name. Corporate uses it as the legal company name on both halves. Editing either label updates the same JSONB key.

**Verify:** SME Individual has no officers/banks. SME Corporate has spouse + income + dependents (3 col) + refs + relatives in province + employment + company facts.

---

## Phase 4 — Corporate facts + add/remove tables

**Allow:**
- `src/components/borrowers/ApplicantProfileFields.tsx`

- [ ] Group header **Business Application** only when `isCorporate`.
- [ ] Facts about the company: existing fields + **Office address line 2** bound to `officeAddressLine2`. Keep “Date established” label (not the PDF typo).
- [ ] Replace every `padRows(...)` Corporate table with `RepeatingRows` **inside the existing Card**. Do not keep a separate Card `<h2>` plus RepeatingRows `title` — RepeatingRows owns the heading + Add button.

| Title | Add label | Empty row | Columns |
|---|---|---|---|
| Company officers | Add officer | `{ name: "", address: "", position: "" }` | Name, Address, Position |
| Major stockholders | Add stockholder | `+ equity` | Name, Address, Position, Equity |
| Customers / clients | Add customer | TradeParty | Customer / Client, Address, Contact person, Contact no. |
| Suppliers | Add supplier | TradeParty | Supplier, Address, Contact person, Contact no. |
| Credit references | Add credit reference | CreditReference | Creditors / Banks, Type of loan, Outstanding balance, Monthly payment, Contact no. |
| Bank accounts | Add bank account | BusinessBankAccount | Bank name, Branch, Account no., Account type, Contact no. |

- [ ] Keep bank authorization account field after the bank table.
- [ ] Delete `padRows` from this file if nothing else uses it.
- [ ] Do not show these tables when `isIndividualSme`.

**Verify:** On SME Corporate, Bank Accounts starts from stored rows (possibly empty). Add creates a row; Remove deletes it; Save persists `business_info.bankAccounts.length`. Print still loops `data-repeat="bankAccounts"` for however many rows exist.

---

## Phase 5 — Completeness (endorse gate)

**Allow:**
- `src/lib/csa/application-form-completeness.ts`
- `src/lib/csa/__tests__/application-form-completeness.test.mts`

- [ ] Write the failing SME tests first. A complete SME individual fixture that **omits** `requestedTerms` and `purposeOfLoan` must pass. Empty / null SME `missing[]` must **not** include those two keys (today the null-profile SME branch injects them). Existing SME tests that spread `completeProfile()` still include terms/purpose in `profileData` — they will keep passing and are not enough coverage. Seafarer empty `missing[]` must stay byte-identical. Individual-segment empty `missing[]` must stay byte-identical (still includes terms/purpose).

```ts
it("does not require requested terms or purpose of loan for SME individual", () => {
  const profile = {
    ...completeProfile(),
    manningAgency: {},
    picWork: {},
    profileData: { loanDesired: "150000" },
    businessInfo: {
      companyName: "Ana Trading",
      companyAddress: "123 Market St",
      yearsOfOperation: "5",
    },
  };
  const result = assessApplicationFormCompleteness(profile, {
    segment: "sme",
    entityType: "individual",
  });
  assert.equal(result.complete, true);
});
```

- [ ] Implement: wrap the `requestedTerms` / `purposeOfLoan` pushes in `if (segment !== "sme")`. Also update the SME `!profile` null branch so those two labels are not injected.

**Verify:**

```
node --test src/lib/csa/__tests__/application-form-completeness.test.mts
```

Expected: pass. Seafarer still requires terms + purpose.

---

## Phase 6 — Print context + merge palette (additive)

**Allow:**
- `src/lib/documents/generators/application-form-context.ts`
- `src/lib/documents/generators/__tests__/application-form-context.test.mts`

Do **not** add `officeAddressLine2` as its own merge token in `fields.ts`. Production templates use `{{businessAddress}}` only; a palette key with no context emitter would be a dead token.

- [ ] Join office lines (only the `businessAddress` assignment; do not change how Individual `companyAddress` is chosen):

```ts
const businessAddress = [
  str(biz.officeAddress ?? biz.companyAddress),
  str(biz.officeAddressLine2),
]
  .filter(Boolean)
  .join("\n");
```

Individual has no line 2; empty `officeAddressLine2` → no behavior change.

- [ ] Fix `noOfDependents` so an explicit count wins, then fall back to table length (today `length || profileData` treats `0` dependents as empty because `0` is falsy):

```ts
noOfDependents:
  str(profileData.noOfDependents) ||
  String((borrower.dependents ?? []).length),
```

- [ ] Add a test that Corporate context `businessAddress` contains both lines when `officeAddressLine2` is set. Do not edit `fields.ts`.

**Verify:**

```
node --test src/lib/documents/generators/__tests__/application-form-context.test.mts
```

Seafarer context tests unchanged. No SQL. No template version insert.

---

## Phase 7 — Connected borrower profile page

**Allow:**
- `src/app/api/borrower/profile/route.ts`
- `src/app/borrower/profile/page.tsx`

CSA / CIG / Committee / origination packet / borrower **application** pages already pass segment — do not edit them in this phase.

- [ ] GET `/api/borrower/profile`: after loading the borrower, select the latest `loan_applications` row for that borrower (`created_at desc`, limit 1) and return `{ profile, segment, entityType }`. If no application, `segment` defaults `"seafarer"` and `entityType` `null` (same as today's component default). **Best-effort:** if the applications query fails, still return `{ profile }` plus those defaults — do not 500. Extra keys are additive; `src/app/borrower/page.tsx` and `src/app/borrower/applications/[id]/page.tsx` already GET this route and only read `profile`. Application-detail must keep using **that application's** `segment`/`entityType`, not the profile GET latest (reloan can differ).
- [ ] Profile page: pass GET `segment`/`entityType` into `ApplicantProfileFields`. Include `businessInfo: profile.businessInfo` in the existing PATCH body (API already accepts it). Autofill overlay: use the loaded segment/entityType instead of hardcoding `"seafarer"`. Change the page description that currently says “SF Application Form” so it is not Seafarer-only.
- [ ] Do not change PATCH zod besides what's already there. Do not add new routes. RLS already allows a borrower to `SELECT` their own `loan_applications` (`applications_select` via `borrowers.user_id = auth.uid()`).

**Verify:** SME borrower `/borrower/profile` shows Date Applied / Type Of Loan / no Viber. Save persists `business_info`. Seafarer borrower profile still shows Rank / Terms.

---

## Phase 8 — Fake data + caller smoke

**Allow:**
- `src/lib/dev/fake-data.ts`

- [ ] SME `typeOfLoan` picks from the PDF lists (`Business Loan`, `Auto Loan`, `RE Mortgage` / `MPL` for individual; `REMortgage` for corporate) — not `Housing loan`. Put it on `profile.profileData.typeOfLoan` (header), not only on credit-reference rows.
- [ ] Set a non-empty `profile.landline` and `profile.profileData.noOfDependents` for SME. Do **not** fill Viber/Teams/Facebook/Education on the SME arm (those stay Seafarer-only in the `!isSme` block).
- [ ] Corporate: `officeAddressLine2` sample string. Do not force table lengths to 3; 1–2 rows is enough.
- [ ] Spouse + income remain filled for both SME entity types (P3).

**Verify:** `git diff --stat` is only `fake-data.ts`. CSA SME Individual autofill fills Provincial + Date Applied. CSA Seafarer autofill unchanged.

Manually click each caller (no code edits expected):

1. CSA application form modal
2. Borrower application form modal
3. CIG view + Edit application form modal
4. Committee read-only form
5. Origination packet “View application form”
6. Borrower profile

---

## Manual QA checklist (after Phase 8)

SME Individual:
- [ ] Header is Date Applied, Type Of Loan (MPL present), Loan Desired, Sales Agent — no Terms / Purpose
- [ ] Provincial (not Permanent); ownership list matches PDF; no Mortgage / Viber / Age
- [ ] Landline + No. of dependents
- [ ] Dependents 3 columns, Add/Remove
- [ ] References Add/Remove + relatives in province
- [ ] Employment / spouse / income present
- [ ] No bank accounts / officers

SME Corporate:
- [ ] Individual/Representative half matches Individual PDF fields (including spouse/income)
- [ ] Business half: office address 2 lines, facts, Add/Remove on officers, stockholders, customers, suppliers, credit, **bank accounts**
- [ ] Type Of Loan list is Business Loan / Auto Loan / REMortgage (no MPL)

Seafarer (regression):
- [ ] Terms, Purpose, Rank, Viber, Permanent, Mortgage, USD income still there
- [ ] Endorse still requires terms + purpose

Individual segment (regression):
- [ ] Still the stripped personal form (not this SME Individual PDF)
- [ ] Completeness still requires terms + purpose

Print:
- [ ] Generate SME Individual / Corporate application form — tables follow stored row counts
- [ ] Seafarer generate still uses slug `application_form`

---

## Explicitly out of scope (later plans)

- Individual **segment** sharing the Individual PDF (confirmed desired, deferred)
- Pixel-perfect PDF clone / new `document_template_versions`
- Printing two PDFs for one Corporate application (on-screen is both; print slug is still Corporate-only)
- Changing computation, checklists, duplication, AR, LRA
- Migrating historical `padRows` empty objects automatically

---

## Progress log

| Phase | Date | Result |
|---|---|---|
| 0 Inventory | 2026-08-21 | Plan written; decisions locked |
| 1 Types + RepeatingRows | 2026-08-21 | Done — `officeAddressLine2` + `RepeatingRows.tsx` |
| 2 SME header + applicant | 2026-08-21 | Done — SME header/personal split; presentAddress no longer mirrors |
| 3 Individual sheet remainder | 2026-08-21 | Done — employment/spouse/income on SME; dependents 3-col |
| 4 Corporate add/remove | 2026-08-21 | Done — RepeatingRows; office line 2 |
| 5 Completeness | 2026-08-21 | Done — 17/17 completeness tests |
| 6 Print context | 2026-08-21 | Done — 11/11 context tests |
| 7 Borrower profile | 2026-08-21 | Done — GET segment/entityType; PATCH businessInfo |
| 8 Fake data + smoke | 2026-08-21 | Done — fake-data SME arm; callers already pass segment |
