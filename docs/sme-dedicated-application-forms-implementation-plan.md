# SME Dedicated Application Forms — Implementation Plan

**Created:** 2026-08-07 · **Depends on:** SME Phases 0–9 (`docs/sme-segment-implementation-plan.md`) + field inventory (`docs/sme-application-forms-extraction.md`) + borrower self-serve SME (`docs/borrower-self-serve-sme-implementation-plan.md`).
**Mode:** SURGICAL — add dedicated printable Individual + Corporate application forms for SME; stop filling Seafarer-labeled slots for SME printouts — without changing Seafarer generation, release documents, computation, checklists, or CSA/borrower capture paths beyond what this plan lists.
**Scope:** Printable document templates + generator wiring + merge-field catalog. On-screen `ApplicantProfileFields` tightening is **optional Phase E** only.

> **For agentic workers:** Work phases in order. Mark checkboxes as you go; update the Progress Log after each phase. Do not start Phase N+1 until Phase N Verify passes. Prefer `superpowers:subagent-driven-development` or `superpowers:executing-plans` for execution.

---

## How to use this file

1. Read **Audit** + **Hard constraints** before touching code.
2. Treat `docs/sme-application-forms-extraction.md` as the field source of truth (not the Seafarer JPEG).
3. Execute phases in order; each phase lists exact files.
4. Seafarer `application_form` regression is mandatory after every phase that touches the generator or CSA routes.

---

## Product decisions (locked for this plan)

| # | Decision | Rationale |
|---|---|---|
| P1 | SME gets **two dedicated printable templates** (Individual + Corporate), not one shared Seafarer form with remapped labels | Client PDFs are structurally different; current Phase 8 provisional remapping leaves Seafarer wording on printouts |
| P2 | Existing slug `application_form` remains **Seafarer-only** after this work | Zero risk of changing Seafarer printouts or historical rendered docs keyed to that slug |
| P3 | New slugs: `application_form_sme_individual` and `application_form_sme_corporate` | Additive; generator picks slug from `segment` + `entity_type` |
| P4 | Layout target = **section-accurate recreation** of the client PDFs (headers, tables, labels, consent text), not a pixel-perfect PDF clone | Templates are HTML → PDF via the existing render pipeline |
| P5 | On-screen capture stays as-is in core phases | Print reads borrower columns + `business_info`. Some Corporate table UIs / spouse personal fields are incomplete today — Phase E only if blank printouts are unacceptable |
| P6 | Do **not** invent Auto Loan / REM / MPL printable variants | Client dropdowns list them; product scope remains Business Loan SME only |

---

## Audit (verified 2026-08-07)

### Current behavior

| Surface | Today |
|---|---|
| Generator | `src/lib/documents/generators/application-form.ts` always calls `renderAndStore({ slug: "application_form" })` |
| Generator select | Loads `segment` but **does not select `entity_type`** yet — Phase 3 must add it for slug resolution |
| SME handling | Remaps `business_info` into Seafarer keys (`manningAgency`, `principalShip`, etc.) + sets `isSme` flags |
| Seeded template | `document_templates.slug = 'application_form'` — Seafarer-oriented body (manning / ship wording) |
| CSA API | `POST/GET .../application-form` hardcodes slug `"application_form"` for list/filter |
| CSA UI caller | **No frontend caller found** for `/api/csa/.../application-form` (API-only today). Phase 3 keeps the route; wire UI only if product asks (out of core scope unless already present elsewhere) |
| Field catalog | `fields.ts` has a small SME scalar group + existing `dependents` / `references` collections; **missing** Corporate repeat collections (officers/stockholders/trade/credit/banks) and Individual spouse/income scalar keys for the palette |
| Capture | `business_info` **types** cover Individual + Corporate shapes. On-screen UI covers company facts, officers, stockholders, Individual income — but **trade / suppliers / credit / bank tables and structured spouse personal block are weak or missing** in `ApplicantProfileFields`. Print can still ship; blank sections → Phase E |
| `document_types` | **Not required** for new printable slugs — `document_templates.slug` is independent (no FK to `document_types`). Do not add checklist slots for these printables |

### Gap

SME Individual and Corporate printouts still look like (or are labeled like) the Seafarer application form. Client supplied two distinct PDFs; inventory is in `docs/sme-application-forms-extraction.md`.

### Explicitly unaffected today (must stay so)

- Seafarer generate/list of `application_form`
- Release / acknowledgement / PN / BLRI / demand letter / computation sheet generators
- `src/lib/computation/sf.ts`
- Checklist seeds, duplication check, Field Visit, AR masterlist identity
- Borrower self-serve create / profile PATCH (already ships `businessInfo`)
- CSA create / lead convert

### Risks

1. CSA GET still filters only `application_form` → SME docs invisible after slug split unless list is segment-aware.
2. Incomplete merge context → blank tables on Corporate printout even when UI has data.
3. Over-editing the shared generator without a Seafarer-preserving branch → Seafarer regression.
4. Migrating/editing the **published** Seafarer `application_form` body by mistake.

---

## Hard constraints — violating any of these fails the phase

### Never break existing behavior

1. **Seafarer `application_form` slug, published body, and generator path for `segment !== 'sme'` must remain behavior-identical.** Same slug, same merge keys Seafarer already uses, same CSA GET filter result for Seafarer apps.
2. **Never edit** the published Seafarer `application_form` template body to “make SME nicer.” SME gets new rows only.
3. **Never modify `src/lib/computation/sf.ts`.**
4. **Never alter release / acknowledgement / LRA generators** except if a shared helper is extracted additively and call sites stay behavior-identical for Seafarer.
5. **Never change checklist seeds, stage_check_mapping, NCL, or `sme_duplication`.**
6. **Do not rename** export `generateApplicationForm` or the CSA route path `/application-form`. Additive params / internal slug selection only.
7. **Do not backfill or rewrite** existing `rendered_documents` rows (historical PDFs stay as-is).
8. **Do not change** borrower create / reloan / profile APIs unless Phase E explicitly lists them.
9. **No new npm dependencies** without asking.
10. **No formatter/linter sweeps** on files you did not otherwise edit.
11. **No “while I’m here” fixes** outside this file’s phase file list — log them in Progress Log instead.
12. **Car Refinancing / Auto Loan / REM printable forms** stay out of scope.
13. **Migrations:** additive only (new `document_templates` + published versions). Apply via Supabase MCP; never edit old migration files.
14. **Template HTML** must use the existing merge / `data-repeat` / `data-if` conventions already used by other document templates — do not invent a second render engine.
15. **If `entity_type` is missing on an SME row**, do not invent Corporate vs Individual — fail generation with a clear error (or stop-and-ask); do not silently fall back to Seafarer `application_form`.

### Stop-and-ask triggers

Stop and ask the user if:

- A change needs a file outside the phase’s Files list.
- Seafarer application-form generation or download regresses.
- Product wants one shared SME template instead of Individual + Corporate.
- Pixel-perfect PDF clone is required (would change approach: static background + overlay vs HTML tables).
- On-screen form must block generate until every table row from the PDF is filled (Phase E / completeness).

---

## Architecture (target)

```
CSA "Generate application form"
  └─ generateApplicationForm(app)
       ├─ segment seafarer → slug application_form          (UNCHANGED)
       ├─ segment sme + individual → application_form_sme_individual
       └─ segment sme + corporate  → application_form_sme_corporate
            └─ buildApplicationFormContext(app, profile, computation, scope)
                 └─ renderAndStore({ slug, context, replaceUnsigned: true })

CSA list downloads
  └─ listRenderedDocuments filtered by the SAME resolved slug for that application
```

Source of truth for labels/sections: `docs/sme-application-forms-extraction.md`  
Visual reference: client PDFs under `Downloads\SYSTEM DEV\Step 1 - Processing-CSA\SME - Individual\` + mapped widget dumps in `docs/_tmp_pdf_extract/` (if still present)

---

## File map

| Path | Role |
|---|---|
| `docs/sme-application-forms-extraction.md` | Field inventory (read-only source of truth) |
| `supabase/migrations/YYYYMMDDHHMMSS_sme_application_form_templates.sql` | Seed two new templates + published HTML bodies |
| `src/lib/documents/generators/application-form.ts` | Resolve slug by segment/entity; expand SME context; keep Seafarer branch |
| `src/lib/documents/generators/application-form-context.ts` *(new, preferred)* | Pure context builder (testable) split out of generator |
| `src/lib/documents/templates/fields.ts` | Add merge fields / repeat collections for SME Individual + Corporate |
| `src/app/api/csa/applications/[id]/application-form/route.ts` | GET lists by resolved slug; POST unchanged entrypoint |
| `src/lib/documents/generators/__tests__/application-form-context.test.mts` *(new)* | Seafarer key stability + SME Individual/Corporate context cases |
| `src/components/borrowers/ApplicantProfileFields.tsx` | **Phase E only** — UI gaps vs inventory |
| `src/lib/borrowers/business-info.ts` | **Phase E only** — shape gaps if any |

**Do not modify (unless a later phase explicitly lists them):** `sf.ts`, release-service, acknowledgement-receipt, checklist seeds, CSA create, borrower reloan/profile routes, AR/collector pages.

---

## Phase 0 — Re-confirm audit (read-only)

- [x] **0.1** Re-read `generateApplicationForm` — confirm it always uses slug `application_form` and remaps SME into Seafarer keys.
- [x] **0.2** Confirm CSA GET filters `listRenderedDocuments(..., { slug: "application_form" })`.
- [x] **0.3** Confirm `docs/sme-application-forms-extraction.md` lists both forms completely.
- [x] **0.4** Confirm published Seafarer template exists and must not be edited.
- [x] **0.5** Confirm product still wants **two** SME templates (Individual + Corporate), not one.

**Files:** none. **Risk:** none.

---

## Phase 1 — Merge-field catalog + context builder (no templates yet)

**Target:** Pure, testable context that Seafarer keeps identical keys; SME Individual/Corporate expose full extraction fields without requiring HTML yet.

- [x] **1.1** Add/extend merge field groups + `data-repeat` collections in `fields.ts` for:
  - Individual: **reuse** existing `dependents` / `references` collections; add spouse block + income declaration scalars for the palette
  - Corporate: **add** `companyOfficers`, `majorStockholders`, `tradeCustomers`, `tradeSuppliers`, `creditReferences`, `bankAccounts` collections (do not invent a second dependents system)
  - Shared SME: company facts (`businessCompanyName`, TIN, nature, etc.) already partially present — complete gaps from extraction
- [x] **1.2** Extract `buildApplicationFormContext(...)` (new file preferred) from `application-form.ts`:
  - Input: application row (incl. segment/entity_type), borrower profile, optional computation
  - Seafarer output: **same keys as today** (regression-tested with deepEqual / key set assert)
  - SME Individual: personal + spouse + references + income + business employment fields from extraction
  - SME Corporate: company facts + repeating tables from `business_info`
  - **Stop remapping SME into `manningAgency` / allottee for the SME branch** (Seafarer branch may keep those keys)
- [x] **1.3** Add `resolveApplicationFormSlug(scope)` helper:
  - seafarer → `application_form`
  - sme + individual → `application_form_sme_individual`
  - sme + corporate → `application_form_sme_corporate`
  - sme + missing/invalid entity → error result (do not fall back)
- [x] **1.4** Unit tests:
  - Seafarer context keys/values stable vs current behavior
  - SME Individual includes income + spouse keys
  - SME Corporate includes officers/stockholders arrays
  - Slug resolver cases + reject incomplete SME entity
- [x] **1.5** Verify: `npm test` green; generator still calls old slug until Phase 3 (or wire slug but templates missing → only call after Phase 2 publish). Prefer **not** changing the live slug until Phase 3.

**Files:** `fields.ts`, new `application-form-context.ts`, tests. Optionally thin edits to `application-form.ts` imports only if needed for compile. **Risk:** medium if Seafarer key set drifts.

---

## Phase 2 — Seed + publish two SME templates (additive migration)

**Target:** DB has published HTML bodies matching extraction section order. Generator not switched yet (or switched only after publish in same release window).

- [x] **2.1** Write additive migration inserting:
  - `document_templates` rows for both new slugs (category `intake`)
  - `document_template_versions` version 1, `status = published`, bodies in HTML tables
- [x] **2.2** Individual body sections (must match extraction § Form A):
  - Header (Date Applied, Type of Loan, Loan Desired, Sales Agent)
  - I Applicant Data (+ dependents table via `data-repeat`)
  - II Spouse Information
  - III References (+ relatives in province)
  - IV Income Declaration
  - Consent paragraph + borrower / co-borrower signature lines
- [x] **2.3** Corporate body sections (must match extraction § Form B):
  - Header
  - Facts About the Company
  - Company Officers / Major Stockholders / Trade / Credit / Bank tables
  - Consent + bank authorization + Bank Name and Account Number
  - Requirements list (static text from extraction — print checklist, not interactive)
  - Signature Over Printed Name
- [x] **2.4** Apply migration via Supabase MCP to the project in use; confirm both slugs resolve via `getPublishedTemplate`.
- [x] **2.5** Verify: Seafarer `application_form` published row unchanged (same id/body hash or unchanged updated_at as appropriate — at minimum SELECT proves body not modified).

**Files:** new migration SQL only (+ this plan Progress Log). **Risk:** medium (HTML size); do not touch other templates in the same migration.

---

## Phase 3 — Wire generator + CSA list/download

**Target:** Generate and list the correct slug per application.

- [x] **3.1** `generateApplicationForm`:
  - Load `segment` + `entity_type`
  - Resolve slug via helper
  - Build context via Phase 1 builder
  - `renderAndStore({ slug: resolved, replaceUnsigned: true, ... })`
- [x] **3.2** CSA `application-form` route:
  - POST: unchanged permission/audit shape; generator handles slug
  - GET: resolve slug the same way (or read application segment/entity and call resolver), then `listRenderedDocuments(..., { slug: resolved })`
  - Audit `afterData` may include `documentSlug` additively
- [x] **3.3** Confirm call sites: today only the CSA `application-form` API route invokes the generator (no in-app button found). Keep route path stable. If a UI is added later, it must call this same route (not hardcode a slug client-side).
- [x] **3.4** Verify:
  - Seafarer app → still generates/lists `application_form`
  - SME Individual → `application_form_sme_individual`
  - SME Corporate → `application_form_sme_corporate`
  - Unit tests green; build clean
  - *(Slug resolution covered by unit tests; full suite 538/538. Operator PDF smoke remains Phase 4.)*

**Files:** `application-form.ts`, CSA `application-form/route.ts`, tests. **Risk:** high for list/filter miss — test GET explicitly.

---

## Phase 4 — Visual / content pass + regression gate

- [x] **4.1** Generate sample PDFs for Seafarer, SME Individual, SME Corporate with realistic fixture data; compare sections to extraction / client PDF previews.
  - *(Automated via `application-form-render-pass.test.mts`: merge seed/migration HTML + fixture context; section assertions vs extraction. Live CSA PDF download smoke left for operator.)*
- [x] **4.2** Fix only template HTML / missing context keys found in 4.1 (no unrelated refactors).
  - *(No template republish needed — zero leftover `{{tokens}}`; sections match extraction. Capture gaps remain Phase E.)*
- [x] **4.3** Full `npm test` green. *(542 pass / 0 fail)*
- [ ] **4.4** Operator checklist:
  - [x] Seafarer generate + download unchanged in wording (manning/ship still present) *(covered by render-pass unit test; live download optional)*
  - [x] SME Individual print shows Applicant / Spouse / References / Income — not Manning Agency *(unit)*
  - [x] SME Corporate print shows Company Facts + officers/stockholders/trade/credit/banks *(unit)*
  - [x] Re-generate replaces unsigned prior of the **same** SME slug only *(assert `replaceUnsigned` scopes by `document_slug`)*
  - [ ] Historical Seafarer rendered docs still downloadable *(live CSA smoke — operator)*
- [x] **4.5** Update Progress Log; note any file-list expansions.

**Files:** template migration body (new version if already published — prefer new draft→publish version rather than editing immutable published row), context builder, this plan. **Risk:** low-medium.

---

## Phase E (optional) — On-screen form alignment

**Only if generate reveals missing capture fields vs the PDF inventory.**

- [x] Diff `ApplicantProfileFields` + `business_info` against extraction; add only missing fields.
  - Individual: spouse personal block; 3-column income (own / spouse gross·expenses·net / other); relatives living in province; SME references show Address.
  - Corporate: officer/stockholder **address**; 5 stockholder rows; trade customers/suppliers; credit references; bank accounts + ADB authorization line.
  - `business_info`: `spouseGrossIncome` / `spouseLessExpenses` / `spouseNetIncome` (+ legacy `spouseMonthlyIncome` fallback in print context).
- [x] Do not redesign Seafarer sections. *(Seafarer manning/allottee/financial/reference columns unchanged.)*
- [x] Do not change borrower submit docs-only gate.

**Stop-and-ask** before implementing E. *(Go-ahead received 2026-08-07.)*

---

## Explicitly NOT in scope

| Item | Why |
|---|---|
| Editing Seafarer `application_form` published HTML | P2; regression risk |
| Separate release-document SME template set | Already handled provisionally in SME Phase 8; different deliverable |
| Auto Loan / REM / MPL application forms | Out of product scope |
| Pixel-perfect clone of PDF fonts/logo placement | P4; HTML table recreation |
| Changing SME document checklist / requirements list as intake slots | Already seeded; Corporate form’s printed Requirements block is static text only |
| Backfilling old SME PDFs that used Seafarer template | Historical archive |
| Borrower submit completeness (Phase D of self-serve plan) | Separate decision |

---

## Verification gate (after Phase 4)

- [x] Seafarer application form generate/list/download identical in slug and Seafarer field presence.
- [x] SME Individual generate uses `application_form_sme_individual` and matches extraction sections.
- [x] SME Corporate generate uses `application_form_sme_corporate` and matches extraction sections.
- [x] CSA GET returns the document for the app’s resolved slug. *(Phase 3 unit/route wiring; live smoke optional)*
- [x] Incomplete SME entity_type fails clearly (no silent Seafarer fallback).
- [x] Full unit suite green; no edits to `sf.ts` / release generators / checklists.

---

## Progress Log

| Date | Phase | Status | Notes |
|---|---|---|---|
| 2026-08-07 | Plan + audit | Written | Based on live generator/CSA route audit + `sme-application-forms-extraction.md`. Implementation not started. |
| 2026-08-07 | Plan validation | Verified + corrected | Re-checked against live code. **Confirmed accurate:** always-slug `application_form`; SME remaps into manning/ship; CSA GET hardcodes slug; `data-repeat`/`data-if` render pipeline; `document_templates` independent of `document_types`; extraction doc exists; Seafarer body must not be edited. **Corrections applied:** (1) generator does not select `entity_type` yet — called out in audit; (2) no frontend caller for application-form API — Phase 3.3 rewritten; (3) capture claim softened — trade/credit/bank UI + spouse personal block are gaps → Phase E; (4) dependents/references collections already exist — Phase 1.1 says reuse; (5) preview PNG note replaced with client PDF + `_tmp_pdf_extract` mapped dumps. **Verdict: plan is correct to execute after these edits.** |
| 2026-08-07 | Phase 0 | Done | Re-confirmed: generator always `application_form` + SME remaps; CSA GET hardcodes slug; extraction doc complete; product still wants two SME templates (P1–P3). |
| 2026-08-07 | Phase 1 | Done | `fields.ts`: expanded SME scalar groups (header/company/income/spouse) + Corporate `data-repeat` collections; reused dependents/references. New `application-form-context.ts`: `resolveApplicationFormSlug` + `buildApplicationFormContext` (Seafarer keys preserved; SME does not remap into manning/allottee). Tests: 9/9 in `application-form-context.test.mts`. Full suite 538 pass / 0 fail. **Live generator left on old slug** until Phase 3 (per 1.5). |
| 2026-08-07 | Phase 2 | Done | Migration `20260807120000_sme_application_form_templates.sql` applied via Supabase MCP (`sme_application_form_templates`). Published: `application_form_sme_individual` (body_len 6706) + `application_form_sme_corporate` (body_len 5415). Seafarer `application_form` unchanged: same version id `6bc30ddc…`, body_md5 `589d77a2…`, body_len 997, template_updated_at still 2026-07-14. Generator not wired yet. |
| 2026-08-07 | Phase 3 | Done | `generateApplicationForm` selects `segment`+`entity_type`, resolves slug, builds context via Phase 1 helper, returns `documentSlug`. CSA GET lists by resolved slug (400 if SME missing entity); POST audit includes `documentSlug`. Suite 538/538. |
| 2026-08-07 | Phase 4 | Done | Visual/content pass via `application-form-render-pass.test.mts` (4 tests): Seafarer manning/ship wording; SME Individual sections without Manning Agency; Corporate officers/trade/credit/banks; `replaceUnsigned` scoped by `document_slug`. No leftover merge tokens; **no template republish** (v1 HTML OK). File list expansion: new render-pass test only. Suite **542 pass / 0 fail**. Live CSA “historical Seafarer download” smoke left for operator. Phase E not started. |
| 2026-08-07 | Phase E | Done | On-screen capture aligned to extraction: Individual spouse block + income columns + relatives-in-province; SME reference Address column; Corporate trade/suppliers/credit/banks + officer/stockholder address (5 stockholder rows). Context maps new spouse income scalars with legacy fallback. No submit-gate change; Seafarer sections untouched. Suite **544 pass / 0 fail**. |

---

## Suggested implementation order (summary)

1. Phase 0 confirm  
2. Phase 1 context builder + fields + tests (Seafarer keys sacred)  
3. Phase 2 additive template seed/publish  
4. Phase 3 wire generator + CSA GET slug resolution  
5. Phase 4 visual/regression gate  
6. Phase E only with explicit go-ahead  
