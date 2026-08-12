# Borrower Self-Serve SME — Implementation Plan

**Created:** 2026-08-07 · **Depends on:** SME Phases 0–9 (`docs/sme-segment-implementation-plan.md`) + borrower draft/submit (`docs/borrower-draft-submit-plan.md`).
**Mode:** SURGICAL — smallest change that lets a borrower choose SME at Start, fill business fields, and submit with the correct SME checklist — without breaking Seafarer self-serve, CSA create, or reloan inherit.
**Scope:** Borrower portal create + profile/form wiring for SME Individual / Corporate. CSA/leads paths are out of scope (already work).

> **For agentic workers:** Work phases in order. Mark checkboxes as you go; update the Progress Log after each phase. Do not start Phase N+1 until Phase N Verify passes. Prefer `superpowers:subagent-driven-development` or `executing-plans` for execution.

---

## How to use this file

1. Read **Audit** + **Hard constraints** before touching code.
2. Confirm the **product decision** (self-declare SME) is still yes.
3. Execute phases in order; each phase lists exact files.
4. Seafarer regression is mandatory after every phase that touches create or profile.

---

## Product decision (locked for this plan)

| # | Decision | Rationale |
|---|---|---|
| P1 | Borrowers **may** self-declare SME (Individual or Corporate) on first "Start application" | Explicitly reversed from prior code comment in `resolveReloanSegment` ("Borrowers cannot self-declare SME") |
| P2 | Reloan **inherits** parent `segment` + `entity_type` as a pair (unchanged) | Avoids silent Seafarer checklist for existing SME customers; no segment-switch UI in v1 |
| P3 | Resume draft **ignores** any new segment in the POST body | Draft already has slots; changing segment mid-draft would orphan wrong docs |
| P4 | Segment is **immutable** after create in v1 (no borrower PATCH on `loan_applications.segment`) | Wrong pick → CSA recreates or staff corrects later; out of scope here |
| P5 | Borrower submit gate stays **documents-only** in the core phases (same as draft/submit plan) | Form completeness remains a CSA endorse gate; optional Phase D can tighten |
| P6 | Account registration stays segment-agnostic | Segment is per-application (SME plan already rejected locking accounts to one segment) |

If P1 is reversed later, delete this plan's create-path changes and restore first-app → Seafarer only.

---

## Audit (verified 2026-08-07)

### Feasibility

**Yes, with caveats.** Downstream SME pipeline (checklist, computation, duplication, Field Visit, release context, AR identity) already exists for CSA-created SME apps. Borrower first-create is the missing entry point; form persistence of `business_info` is the second gap.

### Current create path

| Step | Location | Behavior today |
|---|---|---|
| UI Start | `src/app/borrower/page.tsx` → `handleStartApplication` | Blind `POST /api/borrower/applications/reloan` — no body |
| Resume | `reloan/route.ts` + `findResumableDraft` | Returns existing `draft` without insert |
| Segment resolve | `src/lib/borrowers/reloan.ts` → `resolveReloanSegment` | **First app always `{ seafarer, null }`**; reloan inherits SME pair from parent |
| Insert | `reloan/route.ts` | Writes `segment` + `entity_type` on draft; `ensureDocumentSlots` uses that scope |
| CSA create (contrast) | `src/lib/csa/create-application.ts` | Accepts `segment` / `entityType`; status `submitted`; upserts `application_details` |

### Form / profile gaps

| Surface | Segment-aware UI? | Writes `business_info`? |
|---|---|---|
| `ApplicantProfileFields` | Yes, when `segment` / `entityType` props passed | Via `profile.businessInfo` in memory |
| Borrower application page | **No** — props omitted → Seafarer fields | PATCH body omits `businessInfo` |
| `PATCH /api/borrower/profile` | N/A | Schema has manning/allottee/picWork — **no `businessInfo`** |
| `GET /api/borrower/applications/[id]` | — | **Does not return** `segment` / `entityType` |
| CSA application PATCH | Yes | Writes `businessInfo` |

### Submit / checklist (already OK if row is SME)

| Gate | Segment-aware? | Notes |
|---|---|---|
| Checklist GET | Yes — loads app segment/entity | SME docs appear when row is SME |
| Submit POST | Yes — same scope | Docs uploaded ≥ required only |
| Form completeness | Not on borrower submit | CSA endorse uses `assessApplicationFormCompleteness` |

### Reloan inherit (partial)

- Inheritance of segment + checklist for SME parents: **works**.
- Borrower UI for inherited SME: **broken** (still Seafarer form; cannot save business fields).
- Tests explicitly encode "first application always Seafarer (no self-declared SME)" — those tests must be **updated with new cases**, not deleted (see constraint H2).

### DB / RLS

| Item | Finding |
|---|---|
| `loan_applications_entity_type_sme_only` | SME requires non-null `entity_type` |
| `segment` default | `'seafarer'` |
| `borrowers.business_info` | jsonb NOT NULL default `{}` |
| RLS | Row-level ownership; no column deny-list. Borrower can write `business_info` and insert own apps with segment **if the API allows it**. |
| Draft submit policy | Already allows borrower `draft → documents_pending` — do not widen `is_csa_editable_status` |

### Explicitly unaffected today (must stay so)

- CSA create / lead convert / NCL vs `sme_duplication`
- `src/lib/computation/sf.ts`
- CIG Field Visit, release templates, AR penalty rates (consume segment from the row)
- Register / claim flow (no per-account segment)

### Risks

1. Wrong segment at create + immutable → wrong checklist until staff intervention.
2. Resume draft after abandoning Seafarer draft never re-asks segment (by design P3).
3. SME doc list is heavier (~20 intake slots) — UX must show entity type clearly.
4. Empty `business_info` after submit still blocks CSA endorse — expected; optional Phase D can prevent that earlier.
5. Phase 2 entity-type doc split still operator-flagged — self-serve amplifies wrong-checklist risk if client reverses that list.

---

## Hard constraints — violating any of these fails the phase

### Never break existing behavior

1. **Seafarer first-app without a body stays Seafarer.** `POST` with empty/omitted segment must behave exactly as today (default `seafarer`, `entityType` null). Existing dashboard one-click Start with no modal must not become a 400.
2. **Never change an existing Seafarer test to make it pass.** Extend `reloan.test.mts` with new cases; keep "omitted segment → seafarer" coverage. If a Seafarer assertion fails, fix the code.
3. **Never modify `src/lib/computation/sf.ts`.**
4. **Never alter CSA create / lead convert** (`create-application.ts`, CSA new page) except if a shared zod helper is extracted additively.
5. **Reloan inherit stays the default for `isReloan === true`.** Do not let a request body override parent segment in v1 (P2). Body segment applies only when `kind === "first"`.
6. **Resume draft must ignore segment body** (P3). Do not delete/recreate slots on resume.
7. **Do not widen `is_csa_editable_status`** or rewrite draft-submit RLS. Profile writes use existing borrower UPDATE on `borrowers`.
8. **No new npm dependencies** without asking.
9. **No formatter/linter sweeps** on files you did not otherwise edit.
10. **No renames** of existing exports (`canStartReloan`, `findResumableDraft`, route paths). Additive params / new helpers only.
11. **No "while I'm here" fixes** outside this file's phase file list — log them in Progress Log instead.
12. **Car Refinancing / REM** remain out of scope — do not add collateral enums or scaffolding.
13. **Segment is not set on `borrowers` / register.** Per-application only.
14. **Do not backfill** existing draft rows' segments.
15. **Migrations:** none expected for this feature. If a migration becomes necessary, additive only; apply via Supabase MCP; never edit old migration files.

### Stop-and-ask triggers

Stop and ask the user if:

- A change needs a file outside the phase's Files list.
- Seafarer regression tests fail.
- Product wants reloan segment override or mid-draft segment change.
- Submit should hard-block on SME form completeness (Phase D) before client confirms UX.

---

## Architecture (target)

```
Borrower dashboard
  └─ Start application
       ├─ Modal: Segment (Seafarer | SME) + if SME → Entity (Individual | Corporate)
       └─ POST /api/borrower/applications/reloan
            body?: { segment?, entityType? }
            ├─ resume draft → ignore body, return draft
            ├─ first → resolveCreateSegment(body)  // NEW; default seafarer
            └─ reloan → resolveReloanSegment(parent)  // UNCHANGED inherit

Borrower application page
  └─ GET app includes segment + entityType
  └─ ApplicantProfileFields(segment, entityType)
  └─ PATCH /api/borrower/profile includes businessInfo
  └─ Checklist / Submit unchanged (already segment-aware)
```

Shared validation: mirror CSA refine rule — `entityType` required iff `segment === "sme"`. Prefer a small shared helper (e.g. `parseApplicationSegmentScope`) under `src/lib/borrowers/` or reuse pattern from `createApplicationSchema` without coupling borrower routes to CSA module internals.

---

## File map

| Path | Role |
|---|---|
| `src/lib/borrowers/reloan.ts` | Add first-app create scope resolver; keep reloan inherit |
| `src/lib/borrowers/__tests__/reloan.test.mts` | New first-app SME cases + keep default Seafarer |
| `src/app/api/borrower/applications/reloan/route.ts` | Parse optional body; wire first vs reloan |
| `src/app/borrower/page.tsx` | Segment/entity picker before Start (mirror CSA new) |
| `src/app/api/borrower/applications/[id]/route.ts` | GET returns `segment`, `entityType` |
| `src/app/api/borrower/profile/route.ts` | PATCH accepts `businessInfo` |
| `src/app/borrower/applications/[id]/page.tsx` | Pass segment/entityType; save `businessInfo` |
| `src/app/borrower/profile/page.tsx` | Optional Phase C: only if open app is SME — otherwise leave Seafarer form |
| `src/lib/borrowers/types.ts` | No change expected (`businessInfo` already mapped) |
| `src/components/borrowers/ApplicantProfileFields.tsx` | No change expected (already segment-aware) |

**Do not modify (unless a later phase explicitly lists them):** CSA routes, `sf.ts`, CIG/LRA/AR libs, checklist seed migrations, draft-submit RLS migrations, register route.

---

## Phase 0 — Re-confirm audit (read-only)

- [x] **0.1** Re-read `resolveReloanSegment` + `reloan/route.ts` insert — confirm first-app still forces Seafarer and reloan still inherits.
- [x] **0.2** Confirm `PATCH /api/borrower/profile` still omits `businessInfo`.
- [x] **0.3** Confirm borrower app GET still omits `segment` / `entityType`.
- [x] **0.4** Confirm checklist + submit already pass app segment into `ensureDocumentSlots` / `getStageChecklist`.
- [x] **0.5** Confirm product decision P1 still approved by the user.

**Files:** none. **Risk:** none.

---

## Phase 1 — Create-time segment API (no UI yet)

**Target:** `POST /api/borrower/applications/reloan` accepts optional JSON `{ segment?, entityType? }` for **first** applications only; omitted body = Seafarer (byte-compatible with current clients).

- [x] **1.1** Add a pure helper (name suggestion: `resolveBorrowerCreateSegment`) in `reloan.ts`:
  - Input: `{ kind: "first" \| "reloan", bodySegment?, bodyEntityType?, parentSegment?, parentEntityType? }`
  - `reloan` → existing `resolveReloanSegment` (ignore body)
  - `first` → if body segment omitted/null → `{ seafarer, null }`; if `sme` → require valid entityType or throw/return error shape; if `seafarer` → force `entityType: null`
- [x] **1.2** Update `reloan/route.ts`:
  - Change `POST()` to `POST(request)` and `request.json().catch(() => ({}))`
  - Loosely typed body reader (`readSegmentBody`) instead of zod — resolver itself validates and returns `{ok:false, error}`; on validation failure → 400 with clear message
  - Resume path unchanged (no body use)
  - Insert + `ensureDocumentSlots` use resolved scope
  - Return `segment` + `entityType` on the application payload (create + resume)
- [x] **1.3** Tests in `reloan.test.mts`:
  - Keep: first with no input → Seafarer
  - Keep: all reloan inherit cases
  - Add: first + sme + individual/corporate
  - Add: first + sme without entityType → reject
  - Add: first + seafarer with entityType → entityType nullified
  - Add: reloan ignores body segment (both SME and Seafarer parent cases)
  - Add: first with invalid segment string → reject
- [x] **1.4** Verify: `npm test` green (529 pass / 0 fail); `npx tsc --noEmit` and `npm run build` clean.

**Files:** `reloan.ts`, `reloan.test.mts`, `reloan/route.ts`. **Risk:** medium — wrong default breaks all existing Start clicks.

---

## Phase 2 — Dashboard picker UI

**Target:** Borrower must choose segment (and entity type if SME) before a **new** first application is created. Reloan and resume skip the picker (or show read-only inherited segment).

- [x] **2.1** On `src/app/borrower/page.tsx`, before calling Start for `kind === "first"`, open a small dialog/modal (pattern from `csa/applications/new/page.tsx`):
  - Segment: Seafarer (default) | SME
  - If SME: Individual | Corporate (required)
  - Confirm → POST with body
- [x] **2.2** Reloan Start: `handleStartClick` calls `handleStartApplication()` with **no** body when `appKind !== "first"` (inherit). Caption skipped in v1 (list API scope unchanged, per plan).
- [x] **2.3** Resume draft: unaffected — resume happens server-side before segment resolution runs; no client picker needed since `appKind` is only "first"/"reloan" for genuinely new applications.
- [ ] **2.4** Verify browser: Seafarer Start → seafarer checklist; SME Individual → SME docs; abandoned draft Continue does not re-prompt. **(operator manual check — not run from here)**

**Files:** `borrower/page.tsx` (+ tiny presentational pieces only if needed in same file). **Risk:** low-medium UX; API already safe from Phase 1.

---

## Phase 3 — Form wiring (business_info + segment props)

**Target:** Borrower can view/edit SME business fields on the application draft and persist them.

- [x] **3.1** `GET /api/borrower/applications/[id]` — select + return `segment`, `entityType` (normalized like other routes).
- [x] **3.2** `PATCH /api/borrower/profile` — added optional `businessInfo: z.record(z.string(), z.unknown()).optional()` (matches CSA looseness); passed through `borrowerProfileToRow`.
- [x] **3.3** `src/app/borrower/applications/[id]/page.tsx`:
  - Load segment/entityType from app GET (`ApplicationDetail` type extended)
  - `<ApplicantProfileFields segment={application?.segment} entityType={application?.entityType} … />`
  - Included `businessInfo: profile.businessInfo` in PATCH body
- [ ] **3.4** Verify: SME draft shows company fields; save persists `borrowers.business_info`; Seafarer draft still shows manning/allottee; Seafarer PATCH without businessInfo unchanged. **(operator manual check — not run from here)**

**Files:** application `[id]/route.ts`, `profile/route.ts`, applications `[id]/page.tsx`. **Risk:** medium — profile is shared with `/borrower/profile`; ensure Seafarer profile page still works (omit SME props → seafarer UI).

**Optional 3.5 (same phase or skip):** If `/borrower/profile` is used while an open SME draft exists, pass segment from latest open app; otherwise leave as Seafarer-only. Do not invent account-level segment.

---

## Phase 4 — Tests + regression gate

- [x] **4.1** Unit suite: `reloan.test.mts` + any new schema tests; full `npm test` green (529 pass / 0 fail). `npx tsc --noEmit` and `npm run build` clean (pre-existing unrelated failures in unrelated test files only).
- [ ] **4.2** Browser E2E checklist (operator):
  - [ ] New borrower → Seafarer Start → Seafarer docs + manning form → submit docs gate
  - [ ] New borrower → SME Individual Start → SME docs + business form → save business_info → submit
  - [ ] New borrower → SME Corporate Start → corporate-only docs present
  - [ ] Resume Seafarer draft → no segment re-prompt
  - [ ] After CSA SME paid_off → borrower reloan → inherits SME (no picker override)
  - [ ] CSA create Seafarer / SME still works unchanged
- [x] **4.3** Update Progress Log; note any file-list expansions. No file-list expansions were needed — implementation matched the plan's file map exactly.

**Files:** tests + this plan's Progress Log. **Risk:** low.

---

## Phase D (optional) — Submit form-completeness for SME

**Only if product wants borrowers blocked until business fields are filled.**

- [ ] Call `assessApplicationFormCompleteness(profile, { segment, entityType })` in submit route when segment is SME; return 400 with `missing[]`.
- [ ] Keep Seafarer submit docs-only (do not suddenly require full seafarer form on submit — that would break existing borrower UX from draft/submit plan decision #1).

**Stop-and-ask** before implementing D.

---

## Explicitly NOT in scope

| Item | Why |
|---|---|
| Borrower changing segment after create | P4; slot/doc integrity |
| Reloan segment override UI | P2 |
| CSA drafts view / SME staff tools | Separate |
| Register-time segment | Per-application model |
| New Field Investigator role / CIG check remapping | SME plan provisional items |
| Separate SME published PDF templates | Phase 8 provisional; content decision |
| Car Refinancing / REM | Out of product scope |
| Auto-filling business_info from leads | Speculative |

---

## Verification gate (after Phase 4)

- [ ] First-app Seafarer self-serve identical to pre-change (checklist slugs, form fields, submit). **(operator manual check)**
- [ ] First-app SME Individual + Corporate self-serve reach CSA queue with correct docs and persisted `business_info`. **(operator manual check)**
- [x] Reloan inherit still correct; body cannot force Seafarer onto SME parent. (unit-tested: `resolveBorrowerCreateSegment` reloan branch ignores body)
- [x] Resume draft ignores segment body. (route resume path never reads `body`)
- [x] CSA create + endorse paths untouched / regression-pass. (no CSA files modified; full suite green)
- [x] Full unit suite green. (529 pass / 0 fail)

---

## Progress Log

| Date | Phase | Status | Notes |
|---|---|---|---|
| 2026-08-07 | Plan + audit | Written | Full audit captured above. Implementation not started. Awaiting execution. |
| 2026-08-07 | Plan validation | Verified | Re-checked every audit claim against live source files (reloan.ts, reloan/route.ts, profile/route.ts, applications/[id]/route.ts, checklist/route.ts, submit/route.ts, ApplicantProfileFields, RLS migrations, entity_type constraint, csa new page, reloan.test.mts). No discrepancies found. |
| 2026-08-07 | Phase 1 | Done | Added `resolveBorrowerCreateSegment` to `reloan.ts` (reloan branch delegates unchanged to `resolveReloanSegment`; first branch validates body, defaults to Seafarer). `reloan/route.ts` POST now reads an optional JSON body (`request.json().catch(() => ({}))`), ignores it on resume, uses the new resolver, and returns `segment`/`entityType` on create + resume payloads. Added 9 new tests to `reloan.test.mts`; all existing Seafarer-default tests untouched and still pass. |
| 2026-08-07 | Phase 2 | Done | `borrower/page.tsx`: added a segment/entity-type picker `Modal` (mirrors `csa/applications/new/page.tsx` pattern) shown only when `appKind === "first"`; reloan "Apply for reloan" still calls the API with no body (inherits parent segment, P2 unchanged). `handleStartApplication` now optionally POSTs a JSON body. |
| 2026-08-07 | Phase 3 | Done | `GET /api/borrower/applications/[id]` now selects and returns `segment`/`entityType`. `PATCH /api/borrower/profile` accepts optional `businessInfo` (loose record, same convention as CSA's schema) and passes it through `borrowerProfileToRow`. `borrower/applications/[id]/page.tsx` passes `segment`/`entityType` from the loaded application into `ApplicantProfileFields` and includes `businessInfo` in the profile PATCH body. |
| 2026-08-07 | Phase 4 | Done | Full unit suite green (529 pass / 0 fail, includes 9 new Phase 1 tests). `npx tsc --noEmit` and `npm run build` both clean (pre-existing unrelated failures in `account/preferences*.test.mts` and `borrowers/claim.test.mts` predate this change and were not touched). Browser E2E checklist (4.2) still needs an operator pass — not automatable from here. |

---

## Suggested implementation order (summary)

1. Phase 0 confirm  
2. Phase 1 API + tests (Seafarer default sacred)  
3. Phase 2 dashboard picker  
4. Phase 3 GET segment + PATCH businessInfo + form props  
5. Phase 4 verify  
6. Phase D only with explicit go-ahead  
