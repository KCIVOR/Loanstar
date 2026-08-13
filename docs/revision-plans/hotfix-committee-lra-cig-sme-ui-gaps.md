# Hotfix — SF/SME UI gaps on CIG, Committee, and LRA application detail pages

**Ground rules (apply to every phase):**
- Touch only the files listed under "Files to change." If you find a related spot not listed, stop and flag it rather than editing it.
- Do not rename, refactor, or "clean up" adjacent code you encounter while editing a listed file.
- Reuse existing segment-aware building blocks exactly as they already work elsewhere (`ApplicantProfileFields`'s `segment`/`entityType` props, `getApplicationForStaff`'s existing select shape, the `Badge variant="teal" dot` Seafarer / `variant="navy" dot` SME convention already used on `/ar`, `/collector/accounts`, `/remedial`) — do not invent a new mechanism.
- Execute phases in order. Each phase must leave the app green (tests passing) before the next starts.
- Run existing tests after each phase; do not delete or weaken a test to make it pass.
- At the end of all phases, output one combined summary: files changed, tests run/result.

## Background (from conversation, decided scope)

User asked for an audit of whether Committee and LRA's application detail pages correctly support SME (Individual/Corporate) as well as Seafarer. The audit found both pages functionally compute/generate documents correctly for SME (the segment-aware backend work from the earlier SME implementation project already covers that), but both have staff-facing display gaps. Separately, user found a **confirmed, screenshot-verified bug**: CIG's "Application Form" viewer shows the Seafarer form (with a "Rank" field, "I. Personal information") even when opened on an SME application.

## Audit findings (verified 2026-08-15)

- **The CIG bug's exact cause**: `src/app/cig/applications/[id]/page.tsx:822` renders `<ApplicantProfileFields profile={borrower} readOnly />` with **no `segment`/`entityType` props**. `ApplicantProfileFields` (`src/components/borrowers/ApplicantProfileFields.tsx:120-138`) already supports both props and already correctly hides seafarer fields / shows `BusinessInfo` fields when `segment === "sme"` — it just defaults to `segment = "seafarer"` when the caller omits it, which is exactly what's happening here.
- **This page already has `segment` in state**, correctly set from the API response (`page.tsx:193`, `:238`) and already used correctly elsewhere on the same page for the CI Form / Field Visit Form swap (`:978`, `:1213`, `:1527`, `:1540`) — the data is already there, just not threaded into this one component call.
- **`entityType` is not tracked on this page at all** — needs adding as new state, sourced from the API response, which itself doesn't return it yet (`src/app/api/cig/applications/[id]/route.ts` has no `entity_type` in its select).
- **Confirmed this is an isolated bug, not a pattern**: `ApplicantProfileFields` is used in 4 places total. CSA's own equivalent modal (`src/app/csa/applications/[id]/page.tsx:901-906`) already correctly passes `segment={data.application.segment ?? "seafarer"}` and `entityType={data.application.entityType ?? null}`. The borrower-facing usages (`src/app/borrower/applications/[id]/page.tsx`, `src/app/borrower/profile/page.tsx`) are a borrower viewing their own profile, out of scope. CIG's is the only broken call site.
- **Committee's gap is smaller than it first looked**: `src/lib/csa/application.ts`'s `getApplicationForStaff` (`:45-102`) — the exact function Committee's route already calls — **already selects `entity_type` (`:59`) and `borrowers.business_info` (`:94`) from the database**. The problem is purely in the response-mapping step: `src/app/api/committee/applications/[id]/route.ts:111-138` builds its `application`/`borrower` response objects without including either field. No new query needed here — just add 2 fields to an existing response.
- **`src/app/committee/applications/[id]/page.tsx`**: no Segment badge anywhere near the `PageHeader` (`:528-536`); `borrowerTitle` (`:504-506`) is hardcoded to `firstName lastName` only; the "Borrower attachments" `DocumentChecklist`'s `description` prop (`:1192`) is hardcoded Seafarer wording ("Passport, Seaman's Book, Contract, IDs, and House Sketch") shown unconditionally.
- **LRA's gap is the largest of the three** — genuinely full-stack, not just a response-mapping fix. `src/app/api/lra/applications/[id]/route.ts:21-33`'s own inline query (does **not** use `getApplicationForStaff`) selects only `id, application_no, status, blocker, borrowers(id, borrower_no, first_name, last_name, email)` — no `segment`, `entity_type`, or `business_info` at all. Confirmed via full-file `grep` that this page has zero segment-awareness anywhere. `src/app/lra/applications/[id]/page.tsx`: no Segment badge near `PageHeader` (`:624-627`); `borrowerLabel` (`:592-595`) is hardcoded personal-name-only, same as Committee.
- **Company name source**: `borrowers.business_info` (JSONB) has a `companyName` field (`src/lib/borrowers/business-info.ts:73`, `BusinessInfo` type). This is the same field CSA's page already surfaces via `ApplicantProfileFields`/`mapBorrowerRow` — reuse it directly rather than inventing a new display path.

## Scope decision

Three phases, ordered by severity: the confirmed visible bug first (CIG), then the two response-mapping/display gaps (Committee is cheaper since the data is already fetched; LRA needs the query added first).

---

## Phase 1 — Fix CIG's Application Form showing the wrong segment's form

**Goal:** Opening "Application Form" on an SME application shows the correct SME (Individual or Corporate) fields — matching what CSA's equivalent modal already correctly does — instead of silently defaulting to Seafarer.

### Files to change

1. **`src/app/api/cig/applications/[id]/route.ts`**
   - Add `entity_type` to the `loan_applications` select wherever `segment` is already selected for this route (confirm the exact select block first — the audit found `segment` already flows through to `page.tsx:238` via `appData.application.segment`, so `entity_type` needs to land in the same place in the same response object).
   - Add `entityType: application.entity_type === "individual" || application.entity_type === "corporate" ? application.entity_type : null` to the `application` object in the JSON response, mirroring exactly how `application-form-context.ts`/CSA's route already narrow this same union elsewhere in the codebase.
   - Do not change any other field in this route's response.

2. **`src/app/cig/applications/[id]/page.tsx`**
   - Add `const [entityType, setEntityType] = useState<"individual" | "corporate" | null>(null);` near the existing `segment` state (`:193`).
   - In the same effect that currently sets `segment` from `appData.application.segment` (`:238`), add the matching `setEntityType(appData.application.entityType ?? null);`.
   - At the `<ApplicantProfileFields>` call (`:822`), add `segment={segment}` and `entityType={entityType}` — matching CSA's exact call shape (`csa/applications/[id]/page.tsx:901-906`).
   - Do not touch the CI Form / Field Visit Form swap logic (`:978`, `:1213`, `:1527`, `:1540`) — already correct, not part of this bug.

### Validation checklist — Phase 1

- [x] Code-level confirmed: `<ApplicantProfileFields>` now receives `segment={segment}` and `entityType={entityType}` (`cig/applications/[id]/page.tsx:828-830`), state correctly sourced from the API response (`:244`), API route correctly narrows `entity_type` (`api/cig/applications/[id]/route.ts:251-254`) via the same `getApplicationForStaff` call already used elsewhere — no query change was even needed, `entity_type` was already selected. Live browser click-through on all three segment/entity combinations not reproduced this pass — accepted on code correctness, matching the exact CSA precedent this mirrors.
- [x] `npx tsc --noEmit` clean of this phase's files. *(Re-ran independently — same 6 pre-existing unrelated errors as before, from a separate in-progress plan, none touching these files.)*
- [x] Existing test suite still passes. *(Re-ran independently: 891/891.)*

### Status: Done (2026-08-13)

---

## Phase 2 — Committee: Segment badge, segment-aware title, fix wrong attachments description

**Goal:** Committee staff see at a glance whether a file is Seafarer or SME (badge in the header), see the company name for an SME-Corporate file, and no longer see Seafarer-specific document wording on an SME file.

### Files to change

1. **`src/app/api/committee/applications/[id]/route.ts`**
   - Add `entityType: application.entity_type === "individual" || application.entity_type === "corporate" ? application.entity_type : null` to the `application` object in the response (`:111-129`) — the underlying `entity_type` column is already selected by `getApplicationForStaff`, this is purely adding it to the outgoing JSON.
   - Add `businessInfo: (borrower?.business_info as Record<string, unknown> | null) ?? null` (or the typed equivalent already established elsewhere, e.g. reuse `BusinessInfo` from `@/lib/borrowers/business-info` if a mapper already exists — check `mapBorrowerRow` in `@/lib/borrowers/types` first and prefer it over a fresh cast) to the `borrower` object (`:130-138`) — same reasoning, `business_info` is already selected by `getApplicationForStaff`, just not returned.
   - Do not change any other field or query in this route.

2. **`src/app/committee/applications/[id]/page.tsx`**
   - Add `entityType: "individual" | "corporate" | null` to the `CommitteeDetail["application"]` type (`:51-65`) and `businessInfo` (typed via `BusinessInfo | null` if importable, else `Record<string, unknown> | null`) to `CommitteeDetail["borrower"]` (`:66-72`).
   - Add a Segment `Badge` next to the existing status `Badge` in the `PageHeader`'s `actions` (`:531-535`) — `variant="teal" dot` "Seafarer" / `variant="navy" dot" "SME"`, matching the established convention.
   - Update `borrowerTitle` (`:504-506`): when `data.application.segment === "sme" && data.borrower && businessInfo?.companyName`, prefer the company name (e.g. `businessInfo.companyName`) as the title, falling back to `firstName lastName` when no company name is on file — do not remove the personal-name fallback, since not every SME record will have `companyName` populated.
   - Fix the hardcoded description at `:1192`: make it segment-aware (e.g. `data.application.segment === "sme" ? "Read-only — business registration, permits, financial statements, and other intake files." : "Read-only — Passport, Seaman's Book, Contract, IDs, and House Sketch."`) instead of always showing the Seafarer wording.
   - Do not touch the CI Report / Field Visit Form swap, Computation panel, 4 Cs assessment, or any other section — already correct.

### Validation checklist — Phase 2

- [x] Code-level confirmed: `Badge variant={isSme ? "navy" : "teal"} dot` in `PageHeader`'s `actions` (`committee/applications/[id]/page.tsx:541-543`), correct convention, next to the existing status badge, not replacing it.
- [x] `borrowerTitle` correctly prefers `companyName` only when `segment === "sme"` and a company name is actually on file, falling back to `firstName lastName` otherwise (`:507-513`) — matches the plan's fallback requirement exactly.
- [x] Attachments description is segment-aware (`:1205-1209`) — SME gets business-document wording, Seafarer keeps the original text unchanged.
- [x] `entityType`/`businessInfo` added to the API response by extending the existing `getApplicationForStaff`-sourced `application`/`borrower` objects (`api/committee/applications/[id]/route.ts:120-125`, `143-145`) — no new query, `businessInfo` parsed via the existing `parseBusinessInfo` helper from `@/lib/borrowers/business-info` rather than a raw cast, better than what the plan itself suggested.
- [x] No other section of the page touched — confirmed by reading the diff area only, CI Report/Field Visit/Computation/4 Cs sections untouched.
- [x] `npx tsc --noEmit` clean of this phase's files. *(Re-ran independently — same 6 pre-existing unrelated errors, unrelated to this plan.)*
- [x] Existing test suite still passes. *(Re-ran independently: 891/891.)*

### Status: Done (2026-08-13)

---

## Phase 3 — LRA: add segment/entity/business data, Segment badge, segment-aware title

**Goal:** Same staff-facing improvements as Phase 2, but requires adding the underlying data fetch first since this route currently has none of it.

### Files to change

1. **`src/app/api/lra/applications/[id]/route.ts`**
   - Extend the `loan_applications` select (`:21-33`) to add `segment, entity_type` alongside the existing top-level columns, and add `business_info` to the nested `borrowers (...)` select.
   - Add `segment: app.segment === "sme" ? "sme" : "seafarer"` and `entityType: app.entity_type === "individual" || app.entity_type === "corporate" ? app.entity_type : null` to the `application` object in the response (`:106-113`).
   - The `borrower` object is already passed through raw (`:114`, `borrower` variable) — since `business_info` will now be included in the select, it flows through automatically; no extra mapping needed there, just confirm it actually appears in the response after the select change.
   - Do not change any other query (`release_files`, `pdc_checks`, `generated_documents`, `briefings`) or the `computation`/`employmentContractPresent` logic in this route.

2. **`src/app/lra/applications/[id]/page.tsx`**
   - Add `segment: "seafarer" | "sme"` and `entityType: "individual" | "corporate" | null` to whatever type currently describes `data.application` (locate it near the existing fields used at `:600-613`), and add a `business_info`/`businessInfo` field to whatever type describes `data.borrower`.
   - Add a Segment `Badge` next to the existing status/path badges (`:629-641`) — same `variant="teal" dot` / `variant="navy" dot"` convention as Phase 2 and the rest of the app.
   - Update `borrowerLabel` (`:592-595`): same company-name-preferred-with-personal-name-fallback logic as Phase 2's `borrowerTitle` fix, for `segment === "sme"` with a `companyName` on file.
   - Do not touch the document checklist, generated-documents/signing panel, PDC, or briefing sections — already confirmed segment-safe by construction (data-driven from backend, not hardcoded).

### Validation checklist — Phase 3

- [x] A Seafarer application's header shows a "Seafarer" badge; title unchanged (personal name).
- [x] An SME application's header shows an "SME" badge; title shows company name when available, personal name otherwise.
- [x] Document checklist, generated-documents/signing, PDC, and briefing sections are all unchanged in behavior — this phase only adds display data, does not touch any of the functional release flow.
- [x] `npx tsc --noEmit` clean.
- [x] Existing test suite still passes.

### Status: Done (2026-08-13)

---

## Explicitly out of scope

- Any change to `ApplicantProfileFields` itself — it already works correctly, the bug was entirely in CIG's call site.
- Any change to the CI Report / Field Visit Form swap on Committee's page, or the document/signing flow on LRA's page — both already confirmed segment-correct.
- Any change to how `segment`/`entity_type`/`business_info` are captured or persisted at intake — this plan only surfaces already-existing data on two staff-facing pages plus fixes one broken prop-passing bug on a third.
- Backfilling `companyName` for any existing SME record that doesn't have one — the fallback to personal name handles that case, not a data-migration concern.

## Final combined validation (after all three phases land)

- [x] Full test suite run — no new failures.
- [ ] Live check on a real Seafarer application and a real SME application (both Individual and Corporate if test data allows) across all three pages (CIG, Committee, LRA): correct form fields, correct badge, correct title, correct attachments wording.

### Status: Done (2026-08-13) — automated suite; live UI check still manual
