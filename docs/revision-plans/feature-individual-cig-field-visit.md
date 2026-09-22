# Individual segment — replace the CI & References Form with the Field CI Form (Field Visit)

**Written:** 2026-09-22 · **Status:** PLAN ONLY — nothing implemented.
**Workflow:** Claude plans, Cursor implements, Claude validates the summary.
**Supersedes:** `feature-individual-cig-field-visit-surgical.md` (deleted — it had 6 build/data defects found in validation; all corrected here).

**Source workbook:** `C:\Users\Rovick\Downloads\SYSTEM DEV\Step 2 - CIG\SME-IND\FIELD CI FORM (SME) revised.xlsx`
**Field spec already extracted:** `docs/sme-field-ci-form-extraction.md` (Residence Checking, Business Checking, Recommendation — 3,332/3,332 cells).

---

## 0. What is being asked

Today an **Individual** loan uses the *CI & References Form* (`CiReferencesFormModal`) — the same phone-verification form as Seafarer. The change: Individual instead uses the **Field CI Form from the workbook**, i.e. the `FieldVisitForm` that SME already uses, with the business-only parts hidden.

> ⚠️ **Confidence caveat:** the workbook never mentions "Individual", and `docs/individual-collateral-expansion-plan.md:155` records a 2026-08-18 decision that Individual uses phone/reference verification. The user chose to proceed anyway. Rollback is cheap (§7).

**Hard scope rule:** only Individual changes. Seafarer and SME behave identically to today. Collateral inspections (CM/REM) are untouched.

---

## 1. Audit — verified against code + live DB, 2026-09-22

### 1.1 Where the form choice is made today
| Concern | File:line | Today |
|---|---|---|
| Modal render | `src/app/cig/applications/[id]/page.tsx:2022` / `:2036` | `segment !== "sme"` → CI modal; `=== "sme"` → Field Visit modal |
| Section card | `page.tsx:1573` | `segment === "sme" ? <Field Visit card> : <CI card + Crewing card>` |
| Progress hint | `page.tsx:1336-1340` | Individual already has its own string |
| Sequence S3 | `src/lib/cig/sequence.ts:104-118` | Individual → `isCiReferencesComplete`; crewing slot auto-completes |
| Stage label | `sequence.ts:212-221` | `cigSequenceStageLabel` relabels for `sme` only |
| Submit missing-list | `src/lib/cig/verification.ts:472-539` | `sme` → field visit; **else** → PIC/refs/checklist/rating (Individual lands here) |
| Submit `complete` flag | `verification.ts:572-582` | Individual → `isCiReferencesComplete` |
| Forward to Committee | `src/lib/cig/forward.ts:49` | inherits `assessVerificationCompleteness` |
| Workspace chips + coaching | `src/lib/cig/workspace.ts:23`, `:113-127`, `:146-249` | hardcoded "CI & Refs" label; CI-specific `cigNextStep` copy |
| API zod | `src/app/api/cig/applications/[id]/route.ts:216-222` | `fieldVisit` accepts header/residence/business/recommendation — **no change needed** |

### 1.2 Every reader of the CI data
| Reader | File:line | Gate today |
|---|---|---|
| Committee — CI Report header badge + button | `src/app/committee/applications/[id]/page.tsx:1041` | `segment !== "sme"` |
| Committee — PIC/reference/checklist/rating summary | `page.tsx:1230-1460` | renders from `picVerification` |
| Committee — Field Visit summary | `page.tsx:1535-1585` | `fieldVisit` branch |
| Committee — CI modal | `page.tsx:1745` | `segment !== "sme"` |
| Committee — Field Visit modal | `page.tsx:1758` | `segment === "sme"` |
| Committee API | `src/app/api/committee/applications/[id]/route.ts:57-60,400-409` | selects **both** column sets → **no change needed** |
| Collector Remedial packet | `src/components/collection/OriginationPacketPanel.tsx:324-340`, `:500-626`, `:630-660` | `segment !== "sme"` / `=== "sme"` |
| Packet loader | `src/lib/collection/origination-packet.ts:44-47,170-179` | selects both → **no change needed** |
| Dev fake data | `src/lib/dev/fake-data.ts:453` (`fakeFieldVisit`), `:1004-1011` (segment branch) | SME-only field visit |
| **Not affected** (grep-verified) | LRA `collateral-context.ts` (reads only `cm_inspection`/`rem_inspection`); `dashboard/aggregates.ts` (reads `is_complete` + timestamps); `documents/templates/fields.ts` (only Seafarer `crewingManager` tokens); reports/bottlenecks | — |

### 1.3 The form being reused
`src/components/cig/FieldVisitForm.tsx` (885 lines): **Header**, **I. Residence checking** (`:235`), **II. Business checking** (`:477`), **Recommendation** (`:689`, incl. Business Income column ~`:801`). Types + completeness in `src/lib/cig/field-visit.ts`. Data lives in the existing `verifications.field_visit` jsonb (migration `20260727005404`). **No new column, no migration.**

### 1.4 ⚠️ Two code facts that shape the design

**(a) `ensureVisit` always writes a skeleton.** `FieldVisitForm.tsx:29-46` returns `header: {}`, `recommendation: {}`, and **both** `residence` and `business` with `informants: emptyInformants(3)` — three `{name:"",address:""}` rows. Consequences:
- Individual saves **will** contain a `business` object. Any claim that Individual "never writes business" is false. This is harmless (nothing reads it for Individual) but must not be relied upon.
- A truthiness test like `fieldVisit?.header` is **true for `{}`**. Any emptiness check must scan for real leaf values (§2.2).

**(b) Type shapes differ across the three readers.** `VerificationRecord` (`verification.ts:142-193`) has ~45 fields. Committee's `data.verification` is a narrower inline type (ends `page.tsx:146`) missing `id`, `loanApplicationId`, `fieldCompletenessOk`, `bi*`, `isComplete`, `forwardedAt` and more. `PacketVerification` (`origination-packet.ts:122-135`) types `fieldVisit`/`picVerification`/`referenceVerifications` as `unknown`. **A helper typed `(v: VerificationRecord)` will not compile at the Committee or Packet call sites.** Hence the structural signature in §2.2.

### 1.5 ⚠️ Live data (project `acopcwlhkovssjnrqygk`, queried 2026-09-22)
- **19 Individual applications. 18 carry `pic_verification`; 0 carry `field_visit`.** (11 `loan_active`, 3 `paid_off`, 1 `release_signing`, 1 `released`, 2 re-loans; plus 1 `submitted` with neither.)
- **None are in `for_verification`** — no Individual file is sitting in CIG right now. Nothing gets orphaned mid-flight.
- **All 18 must keep rendering their old CI & Refs data** in Committee and the Packet forever. Display readers therefore decide by *what data exists*, not by segment alone.
- SME for reference: 29 files with `field_visit`, 6 re-loans with `sme_reloan_verification` — none touched.

---

## 2. Design

### 2.1 Reuse, don't fork
- Reuse `FieldVisitForm` via a new optional `variant` prop (default `"sme"` — SME output must be byte-identical).
- Reuse `verifications.field_visit`. No migration.
- New `assessIndividualFieldVisitRequired` in `field-visit.ts`, separate from `assessFieldVisitRequired`, so Individual can diverge later without touching SME.

### 2.2 The resolver — structural param + real emptiness check
Lives in a **new, import-free** `src/lib/cig/individual-ci.ts` (no import from `verification.ts`, so there is zero circular-dependency risk when `verification.ts` imports it).

```ts
/**
 * Individual CI form resolution.
 *
 * Individual switched from the CI & References Form to the Field Visit form
 * (2026-09-22). 18 pre-switch applications hold `pic_verification` data and
 * must keep rendering it, so DISPLAY readers ask this which form's data a
 * given file actually holds. Live gates (sequence/submit/forward) always
 * require the Field Visit.
 *
 * Deliberately structural + `unknown`-typed: the three callers pass three
 * different shapes (CIG's VerificationRecord, Committee's narrower inline
 * type, and the Packet's `unknown`-typed projection).
 */
export type IndividualCiSource = {
  fieldVisit?: unknown;
  picVerification?: unknown;
  referenceVerifications?: unknown;
};

/**
 * True if `value` holds any real answer.
 *
 * NOT a truthiness test. `FieldVisitForm`'s `ensureVisit` always emits a
 * skeleton (`header: {}`, `recommendation: {}`, and three blank informant
 * rows under both `residence` and `business`), so `{}` and
 * `[{name:"",address:""}]` must both read as empty — otherwise one blank
 * draft save would hide a legacy file's PIC data.
 *
 * `0` and `false` count as content: they are deliberate answers.
 */
export function hasCiContent(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (typeof value === "number") return true;
  if (typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.some(hasCiContent);
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some(hasCiContent);
  }
  return false;
}

export function individualCiKind(
  verification: IndividualCiSource | null | undefined,
): "field_visit" | "ci_references" {
  if (!verification) return "field_visit";
  if (hasCiContent(verification.fieldVisit)) return "field_visit";
  if (
    hasCiContent(verification.picVerification) ||
    hasCiContent(verification.referenceVerifications)
  ) {
    return "ci_references";
  }
  return "field_visit"; // fresh file → new form
}
```

### 2.3 Gates vs. display
- **Live gates** (`sequence.ts`, `verification.ts`, `forward.ts`): Individual always requires the Field Visit. Safe because no Individual file is currently in CIG (§1.5) — Phase 0 re-confirms on the day, and checks the Revisit path.
- **Display readers** (Committee, Packet): route through `individualCiKind`.

### 2.4 Individual re-loans
No separate re-loan form — the SME re-loan form is business-centric. Individual re-loans use the plain Individual Field Visit. **The `isReloan` branch must be stripped when copying SME's card/modal blocks** (2 live Individual re-loans exist).

---

## 3. Decisions to acknowledge before Phase 1

| # | Question | Default implemented here | If the client disagrees |
|---|---|---|---|
| D1 | Include **Business Checking** for Individual? | **No** (Residence + Recommendation only) | Flip one `variant` condition in `FieldVisitForm` |
| D2 | Individual **re-loan** verification | Same Individual Field Visit | New Individual re-loan variant (new phase) |
| D3 | Recommendation's **Business Income** column | Hidden for Individual; **House Expenses kept** | Client must specify how Individual income is captured — do not guess |
| D4 | Header **Company Name / Address** | Kept, optional (employer of an employed Individual) | Hide behind `variant` |

---

## 4. Phases

Each phase ends green on `npm test` (**`*.mts` only** — the vitest `.test.ts` files are dead, there is no CI yaml) and `npm run build`. Work directly on `main`. No `.ts`-extension imports in lib files.

**Phase order matters — two hard constraints:**
1. **Phase 2 must land before Phases 6, 7 and 10**, which pass `variant` to `FieldVisitForm`.
2. **Phase 4 and Phase 12 must land in the same commit.** Phase 4 changes the Individual gate, which immediately fails the three existing Individual tests that Phase 12 rewrites. Splitting them would leave the suite red between commits, breaking the "every phase ends green" rule. Treat `3 + 4 + 12` as one atomic step. (Phase 12 is written last in this document only because it is easier to read after the gates it tests.)

### Phase 0 — Pre-flight, no code — ✅ COMPLETE 2026-09-22
- [x] **Live query re-run.** 19 Individual applications: 11 `loan_active`, 3 `paid_off`, 1 `release_signing`, 1 `released`, 1 `submitted`; 2 of these are re-loans. 18 carry `pic_verification`, **0 carry `field_visit`**, and all 18 have `forwarded_at` set. **Zero Individual applications are in `for_verification`** — nothing is mid-CIG, nothing gets orphaned.
- [x] **Committee Revisit / `for_revision` path traced — SAFE, no override needed.** Three independent guarantees:
  1. `forwarded_at` is only ever **set** (`forward.ts:79`) and never cleared, and `forwardToCommittee` returns early when it is set ("CI report already submitted"). A legacy Individual file can never re-run the CIG completeness gate.
  2. `completeRevision` (`negotiation/service.ts:~876-915`) requires `status = 'for_revision'`, resolves the revisit notice, and returns the file to **`for_approval`** — it never routes back through `for_verification`, and never calls `assessVerificationCompleteness`.
  3. **DB-level:** RLS policy `verifications_write` is `has_module_permission('verification','edit') AND EXISTS(… la.status = 'for_verification')`. Writes to `verifications` are blocked by Postgres outside `for_verification`, so a revisited legacy file cannot have a Field Visit skeleton saved onto it at all. (`editable` in the UI, `route.ts:369`, agrees: `status === "for_verification"`.)
  `hasCiContent` remains as defence in depth.
- [x] **RLS check — no gap.** `verifications_select` is `is_super_admin() OR has_module_permission('verification','view') OR has_module_permission('committee','view')`. It is **segment-agnostic and column-agnostic** — there is no segment predicate and no column restriction, so any role that can read an SME row's `field_visit` today can read an Individual row's `field_visit`. Committee and the Collector packet both render SME `field_visit` today, so both work for Individual. No migration needed.
- [x] **D1–D4:** user instructed implementation to proceed; plan defaults apply (no Business Checking, no separate Individual re-loan form, no Business Income column, Company fields kept).
- [x] **Baseline recorded:** `npm test` → **1778 pass / 0 fail / 7 skipped (1785 total)**, exit 0, before any change.
- [x] **Working-tree note:** 23 modified + 10 untracked files from a concurrent notifications-wiring session are present. **Zero overlap** with this plan's file list (their `src/lib/cig/forward.ts` is the closest, and this plan does not edit it). Therefore: **stage only this plan's files by explicit path — never `git add -A`/`git add .`** — and leave every other change untouched.

### Phase 1 — Library: Individual completeness
**File:** `src/lib/cig/field-visit.ts` — append after `assessSmeReloanRequired` (ends `:374`). Uses the module-local `filled` at `:317`. **Do not touch `assessFieldVisitRequired` or `assessSmeReloanRequired`.**

```ts
/**
 * Required subset to unlock Finding for Individual applications.
 *
 * Same seven items as SME's `assessFieldVisitRequired` today, but kept a
 * separate function so Individual can diverge without touching SME.
 * Messages keep the "Field visit: " prefix so `workspace.ts`'s next-step
 * regexes match.
 */
export function assessIndividualFieldVisitRequired(
  visit: FieldVisit | null | undefined,
): FieldVisitCompleteness {
  const missing: string[] = [];
  const header = visit?.header;
  const residence = visit?.residence;
  const recommendation = visit?.recommendation;

  if (!filled(header?.dateVisited)) missing.push("Field visit: date visited");
  if (!filled(header?.visitedBy)) missing.push("Field visit: visited by");
  if (!filled(header?.clientName)) missing.push("Field visit: client name");
  if (!residence?.residenceType) missing.push("Field visit: type of residence");
  if (!recommendation?.creditRealizationRisk) {
    missing.push("Field visit: credit realization risk");
  }
  if (!recommendation?.recommendation) {
    missing.push("Field visit: recommendation (approval/disapproval)");
  }
  if (!filled(recommendation?.preparedBy)) {
    missing.push("Field visit: prepared by");
  }

  return { complete: missing.length === 0, missing };
}

/** Thin wrapper mirroring `isSmeFieldStageComplete`'s call shape. */
export function isIndividualFieldVisitComplete(
  visit: FieldVisit | null | undefined,
): boolean {
  return assessIndividualFieldVisitRequired(visit).complete;
}
```

- [ ] Add the two functions above.
- [ ] **New file** `src/lib/cig/individual-ci.ts` — exactly the §2.2 code, **imports at the top of the file** (the superseded plan put one at the bottom; every other file in this repo imports first).
- [ ] Tests — `src/lib/cig/__tests__/field-visit.test.mts`: `assessIndividualFieldVisitRequired` on empty / partial / complete.
- [ ] Tests — **new** `src/lib/cig/__tests__/individual-ci.test.mts`:
  - `hasCiContent`: `null`, `{}`, `""`, `"  "`, `emptyInformants(3)`, and the full `ensureVisit(null)` skeleton → all `false`; `0`, `false`, `"x"`, `{a:{b:"x"}}` → all `true`.
  - `individualCiKind`: `null` → `field_visit`; skeleton-only `fieldVisit` + real `picVerification` → **`ci_references`** (the regression guard for §1.4a); real `fieldVisit` → `field_visit`; both real → `field_visit`; neither → `field_visit`.

### Phase 2 — Form variant (**must precede Phases 6, 7, 10**)
**File:** `src/components/cig/FieldVisitForm.tsx`

- [ ] Add to the `Props` type (`:20-27`) — not an inline intersection at the signature:
  ```ts
  /** "individual" hides Business checking + the Business Income column. */
  variant?: "sme" | "individual";
  ```
- [ ] Destructure with a default in the signature (`:100`): `variant = "sme"`.
- [ ] Wrap the **II. Business checking** `<section>` (opens `:477`, closes `:687`) in `{variant === "sme" ? ( … ) : null}`.
- [ ] In the Recommendation section (`:689`), hide the Business Income column and its help text (~`:801`) when `variant === "individual"`. Keep House Expenses.
- [ ] ~~Re-number the Recommendation heading~~ — **dropped 2026-09-22 during implementation.** The Recommendation heading was never numbered (`FieldVisitForm.tsx:696` reads plain `Recommendation`); the form numbers only `I. Residence checking` and `II. Business checking`. Numbering it would have been an SME-visible change, violating constraint 3. Hiding Section II simply leaves Individual with `Header → I. Residence checking → Recommendation`, which is consistent.
- [ ] Note: there is **no Business Income column in the Recommendation section's UI** — only a help-text line (~`:801`). `businessIncome` exists on the `FieldVisitRecommendation` type, but the business figures are rendered inside `II. Business checking`, which is already hidden for Individual. Hiding the help text is the whole of this step.
- [ ] Leave `ensureVisit` alone — it keeps writing the `business` skeleton, which is harmless (§1.4a) and keeps SME's save shape identical.
- [ ] **Regression guard:** SME render with the default `variant` must be unchanged — same DOM, same state, same save payload.

### Phase 3 — Sequence gate
**File:** `src/lib/cig/sequence.ts`

- [ ] Import `isIndividualFieldVisitComplete` from `./field-visit` (alongside the existing `assessFieldVisitRequired`/`assessSmeReloanRequired` import at `:1-4`).
- [ ] Individual branch (`:108-114`) — replace the `s3` line only:
  ```ts
  } else if (segment === "individual") {
    // Field Visit replaces the CI & References Form (2026-09-22). Individual
    // still has no Crewing manager step, so that slot auto-completes.
    s3 = s2 && isIndividualFieldVisitComplete(verification.fieldVisit);
    s4 = s3;
  }
  ```
- [ ] Leave `isCiReferencesComplete` exported and re-exported (`:39-44`) — Seafarer still uses it.

### Phase 4 — Submit gates (both of them)
**File:** `src/lib/cig/verification.ts`

- [ ] Import `assessIndividualFieldVisitRequired` and `isIndividualFieldVisitComplete` (extend the `./field-visit` import at `:1-7`).
- [ ] **Missing list** — insert a new branch between the `sme` block (closes `:477`) and the existing `} else {` (`:478`):
  ```ts
  } else if (segment === "individual") {
    missing.push(
      ...assessIndividualFieldVisitRequired(verification.fieldVisit).missing,
    );
  } else {
  ```
  This alone removes Individual from the PIC/refs/checklist/rating block (`:500-538`). **Do not edit that block** — Seafarer still needs it.
- [ ] **`complete` flag** (`:572-582`) — swap the Individual arm:
  ```ts
  : segment === "individual"
    ? isIndividualFieldVisitComplete(verification.fieldVisit)
  ```
- [ ] **Update the stale doc comment** on `VerificationScope.segment` (`:196-201`) — it currently states Individual "reuses Seafarer's phone/reference verification (CI & References Form, confirmed 2026-08-18)". Replace with the Field Visit decision + this plan's path. Keep the "no Crewing manager step" sentence, which is still true.
- [ ] Add a test asserting `assessVerificationCompleteness(...).complete` and `getCigSequenceState(...).unlocked.forward` **agree** for Individual (they are two implementations of one rule and have drifted before).

### Phase 5 — Workspace chips + coaching copy
**File:** `src/lib/cig/workspace.ts` — *absent from the superseded plan; this is user-visible text.*

`cigSequenceStageLabel` already handles a `segment` argument, but **all six call sites omit it** (`:253-258`), so widening that function alone is a no-op. Thread the segment instead:

- [ ] `sequence.ts:216` — widen the existing condition to `if (segment === "sme" || segment === "individual")`. (Needed, but not sufficient on its own.)
- [ ] `buildCigWorkspaceSteps` (`:113-127`) — add an optional `segment` to its input and use it when mapping `CIG_WORKSPACE_STAGES` (`:119`), so the hardcoded `"CI & Refs"` chip (`:23`) and `"Crewing"` chip render as `"Field Visit"` / `"Field Visit (complete)"` for Individual. Default (no segment) output must be unchanged.
- [ ] `cigNextStep` (`:146-153`) — add an optional `segment` to its input. In the `ci_references` branch (`:214-225`), keep today's wording for Seafarer and use Field Visit wording for Individual (title "Complete Field Visit"; body must not mention PIC, references, checklist, rating or Crewing). Widen the `missing.find` regex to also match `/Field visit:/`.
- [ ] `cigSequenceLockedHint` (`:251`) — **no change.** Its only live call site (`cig page:565`) passes `"external_checks"`, whose prerequisite is Borrower review, which is segment-independent.
- [ ] `cig/applications/[id]/page.tsx` — pass `segment` into the `cigNextStep` call (`:723`) and the `buildCigWorkspaceSteps` call (`:730`).
- [ ] `src/lib/cig/__tests__/workspace.test.mts` — the 4 existing `cigNextStep` calls (`:167`, `:177`, `:191`, `:203`) must keep passing with no segment (default = today's behaviour). Add Individual cases.

### Phase 6 — CIG page: section card
**File:** `src/app/cig/applications/[id]/page.tsx`

- [ ] Make the card block at `:1573` three-way: `sme` (unchanged) → `individual` → else (Seafarer: CI card + Crewing card, unchanged).
- [ ] Individual card = a copy of SME's `<Card>` (`:1574-1630`) with:
  - **the `isReloan` branching stripped** (§2.4) — title always "Field Visit", button always "Open/View Field Visit";
  - description "Site visit form — replaces PIC phone verification for Individual.";
  - badge from `assessIndividualFieldVisitRequired(verification.fieldVisit)`.
- [ ] Progress hint (`:1336-1340`) — Individual: "Complete sections in order: borrower review → checks → Field Visit → finding."
- [ ] Leave `ciUnlocked` (`:738`) as-is; it reads `sequence.unlocked.ci_references`, which stays `true` under Option B.

### Phase 7 — CIG page: modal
**File:** `src/app/cig/applications/[id]/page.tsx`

- [ ] `:2022` — narrow the CI modal to Seafarer: `showCiForm && segment === "seafarer"`.
- [ ] `:2036` — widen the Field Visit modal to `segment === "sme" || segment === "individual"`, with the title `"Field Visit"` for Individual and SME's existing `isReloan` title logic preserved for SME.
- [ ] Inside: SME keeps its `isReloan ? <SmeReloanVerificationForm> : <FieldVisitForm>` split. Individual always renders `<FieldVisitForm variant="individual" …>` — never the re-loan form.
- [ ] Keep `saveVerification({ fieldVisit: next })` as the save path; the API zod already accepts it.

### Phase 8 — Committee page
**File:** `src/app/committee/applications/[id]/page.tsx` (the Committee API needs no change)

- [ ] Import `individualCiKind` and `assessIndividualFieldVisitRequired`.
- [ ] Header badge + button (`:1041-1089`) — three-way. For Individual, branch on `individualCiKind(data.verification)`:
  - `field_visit` → Field Visit badge, button "View full Field Visit Form" wired to **`setShowFieldVisitForm(true)`**;
  - `ci_references` → today's CI badge and button, wired to `setShowCiForm(true)`.
  **Wire the correct setter** — the superseded plan relabelled the button without saying which state it toggles.
- [ ] Summary body (`:1230-1585`) — Individual + `field_visit` → the Field Visit summary fields (date visited, visited by, client, residence type, credit realization risk, recommendation, prepared by). Individual + `ci_references` → today's PIC/reference/checklist/rating block, unchanged. Seafarer and SME blocks untouched.
- [ ] **CI modal (`:1745`)** — currently `segment !== "sme"`. Keep it reachable for Individual so legacy files still open, but it must only be openable when the resolver says `ci_references`.
- [ ] Field Visit modal (`:1758`) — widen to `sme || individual`; Individual passes `variant="individual"` and `readOnly`.
- [ ] `completeness.items` comes from the API (`assessVerificationCompleteness`) and self-corrects via Phase 4 — no change here. Grep this file for any other `ciFormCompletionBadge` / segment-based CI use and align.

### Phase 9 — Collector Remedial origination packet
**File:** `src/components/collection/OriginationPacketPanel.tsx` (loader needs no change)

- [ ] Import `individualCiKind`, `assessIndividualFieldVisitRequired`.
- [ ] `ciBadge` (`:325-334`) and `smeComplete` (`:336-340`) — add the Individual path via `individualCiKind(verification)`; note the panel's fields are `unknown`, so pass `asFieldVisit(verification.fieldVisit)` into `assessIndividualFieldVisitRequired`. `individualCiKind` itself takes the raw object (structural, `unknown`-typed — §2.2).
- [ ] CI block (`:500-626`) vs Field Visit block (`:630-660`) — choose by resolver for Individual; legacy keeps the CI block; new renders `<FieldVisitForm variant="individual" readOnly>`.
- [ ] `smeUsesReloanForm` (`:137`) stays SME-only.
- [ ] `src/lib/collection/__tests__/origination-packet.test.mts` — extend if it asserts on segment gating.

### Phase 10 — Dev data
**File:** `src/lib/dev/fake-data.ts` — *absent from the superseded plan; without it the dev "fill" button produces an Individual app that cannot pass the new gate.*

- [ ] Add `fakeIndividualFieldVisit()`: reuse `fakeFieldVisit()`'s header + residence + recommendation (house expenses), **omit `business` and `recommendation.businessIncome`**.
- [ ] Segment branch in the full-fill helper (`:1004-1011`): add an `individual` arm returning `base` + `{ fieldVisit: fakeIndividualFieldVisit() }` instead of falling through to the Seafarer arm (`:1013-1040`), which currently supplies PIC + crewing data.
- [ ] CIG page dev menu (`:2422-2437`) — the current `segment === "sme"` gate must also offer Individual a "Fill Field Visit" action; drop the Individual "Fill CI Form" action if one is reachable.

### Phase 11 — Docs
- [ ] `docs/individual-collateral-expansion-plan.md:155` — the line asserting Individual gets "the same phone/reference-verification approach as Seafarer" is now wrong. Add a dated superseding note pointing here. Do not delete the history.
- [ ] `docs/cig-references-form-plan.md` — header note: the CI & References Form is Seafarer-only as of 2026-09-22.
- [ ] Append an implementation log to this file (phases done, test counts, live-test result).

### Phase 12 — Test rewrites (explicit, not "update assertions")
**File:** `src/lib/cig/__tests__/sequence.test.mts` — the `describe("getCigSequenceState — Individual segment …")` block at `:265`. Its helper `s3Complete()` (`:118-128`) sets **only** PIC, references, checklist and rating — no `fieldVisit` — so **three tests fail after Phase 4.** Each needs a specific rewrite:

- [ ] **Add a helper** `individualS3Complete(overrides)` = `s1Complete({ fieldVisit: <minimal complete visit>, ...overrides })`, where the minimal visit satisfies the seven items in Phase 1 (dateVisited, visitedBy, clientName, residence.residenceType, recommendation.creditRealizationRisk, recommendation.recommendation, recommendation.preparedBy).
- [ ] `"S1–S3 complete (CI & References only) → jumps straight to S5/finding"` (`:266`) — rename to reference the Field Visit and switch `s3Complete()` → `individualS3Complete()`. Keeps asserting crewing auto-completes.
- [ ] `"crewing manager fields are never required for Individual completeness"` (`:276`) — switch to `individualS3Complete({ finding: "positive" })`; the `complete === true` and no-crewing-gap assertions then hold.
- [ ] `"Individual still requires CI & References Form fields (unlike SME's Field Visit swap)"` (`:288`) — **this test's intent is now inverted; rewrite it, don't patch it.** Replace with two tests:
  1. *Individual requires Field Visit fields* — `s1Complete({ finding: "positive" })`, assert `complete === false` and `missing.some(m => /Field visit: date visited/.test(m))`.
  2. *Individual no longer requires PIC/reference fields* — `individualS3Complete({ finding: "positive" })`, assert `complete === true` and `!missing.some(m => /PIC name|reference/i.test(m))`.
- [ ] `"Seafarer still requires crewing manager fields (regression guard)"` (`:295`) — must pass untouched. If it changes, the Seafarer path was broken.

### Phase 13 — Verification
- [ ] `npm test` and `npm run build` clean. Record the test count.
- [ ] **Live UI click-through** (unit tests missed real bugs on the last two features — do not skip): new Individual app → CIG borrower review → checks → Field Visit (save draft, reopen, complete) → finding → Submit → open in Committee → open in Collector packet.
- [ ] **Legacy check:** open one of the 18 pre-switch Individual files in Committee **and** the Packet. Old PIC/reference data must still render, with no Field Visit badge.
- [ ] **Skeleton-save guard (the §1.4a trap):** on a *legacy* Individual file, if the Revisit path allows it, open and save the Field Visit form **without entering anything**, then re-open Committee. The PIC block must still render. If it vanishes, `hasCiContent` is wrong.
- [ ] **Regression:** one SME new-loan, one SME re-loan, one Seafarer file — CIG, Committee and Packet all unchanged.
- [ ] Individual **with collateral** (CM and REM): inspection cards and the Submit gate still work.

---

## 5. Constraints

1. **Segment isolation.** Every edit is an `individual`-only branch. No refactor of SME or Seafarer paths, no renaming of shared symbols, no reordering of existing conditionals beyond inserting the Individual case.
2. **Do not edit** `assessFieldVisitRequired`, `assessSmeReloanRequired`, `assessCiReferencesRequired`, `isCiReferencesComplete`, `CiReferencesFormModal.tsx`, `SmeReloanVerificationForm.tsx`, `CmInspectionForm`, `RemInspectionForm`, `collateral-inspection.ts`, `ensureVisit`.
3. **`FieldVisitForm` default is frozen.** `variant` defaults to `"sme"`; SME DOM, state and save payload must be identical.
4. **No migration, no column change, no RLS change** unless Phase 0's RLS check proves a gap — then a separate reviewed migration, applied via the Supabase MCP, not `db push`.
5. **Never delete or overwrite `pic_verification` on legacy Individual rows.** Display falls back to it via the resolver.
6. **Emptiness, never truthiness.** Any "does this form have data" check goes through `hasCiContent`. `{}` and blank informant rows are empty.
7. **`individualCiKind` stays structurally typed.** Do not narrow it to `VerificationRecord` — it has three callers with three shapes (§1.4b).
8. **Submit is the sole completeness gate** (Option B, `feature-cig-ci-form-always-available.md`). Keep the form openable and savable in any order; do not re-add stage locks.
9. **Two completeness implementations must agree.** `assessVerificationCompleteness` (both the missing list *and* the `complete` flag) and `getCigSequenceState` change in the same phase, with a test asserting agreement.
10. **Committee API and Packet loader already select both column sets.** Do not "fix" them.
11. **Tests:** only `*.mts` runs under `npm test`. No `.ts`-extension imports in lib files.
12. **Wording:** "Field Visit". Use the extraction doc's labels; invent nothing.
13. Small commits per phase on `main`, each green on `npm test` + `npm run build`.

---

## 6. Risks

| Risk | Mitigation |
|---|---|
| Blank Field Visit save hides a legacy file's PIC data | `hasCiContent` (§2.2) + the Phase 13 skeleton-save guard |
| Committee Revisit re-gates a legacy Individual file onto the new form | Phase 0 traces the path before any gate change |
| Helper typed too narrowly → build breaks at Committee/Packet | Structural `unknown` signature, constraint 7 |
| `variant` used before it exists | Phase 2 precedes Phases 6, 7, 10 |
| Individual re-loan hits SME's business-centric re-loan form | `isReloan` stripped in Phases 6–7 (§2.4) |
| RLS blocks Committee/Collector reads of `field_visit` on Individual rows | Phase 0 RLS check |
| Seafarer wording leaking into Individual screens | Phase 5; grep Individual-visible strings for "PIC", "Crewing", "allottee", "CI & Ref" |
| Client reverses D1–D4 | Each decision isolated to one condition |

---

## 7. Rollback

Revert the Individual branches in: `field-visit.ts`, `sequence.ts`, `verification.ts`, `workspace.ts`, `cig/applications/[id]/page.tsx`, `committee/applications/[id]/page.tsx`, `OriginationPacketPanel.tsx`, `fake-data.ts`. Delete `individual-ci.ts`. Restore the Phase 12 tests.

No data migration to undo. Any `field_visit` rows written for Individual become inert, and `pic_verification` was never touched, so legacy files keep rendering either way.
