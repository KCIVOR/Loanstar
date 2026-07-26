# CIG Hard Sequence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce workflow §3 CIG step order with CSA-style hard gates (UI + server), while keeping explicit Submit CI report and existing completeness fields.

**Architecture:** Add a pure sequence helper that derives the current stage from verification + checks. PATCH verification and POST checks reject out-of-order writes. CIG application page disables later cards from the same helper. Submit/`forwardToCommittee` stay as the final completeness gate.

**Tech Stack:** Next.js App Router, existing `verifications` + `cig_checks` APIs, Vitest/Jest unit tests matching repo style.

**Spec:** `docs/superpowers/specs/2026-07-24-cig-hard-sequence-design.md`

**Audit summary (2026-07-24):** Sequence = **partial**. Content OK; Submit completeness OK; **no** inter-step hard gates. Soft stepper only. Canvas 3.1–3.6 do not cover ordered §3 steps.

---

## File map

| File | Role |
|------|------|
| `src/lib/cig/sequence.ts` | Stage IDs, completion predicates, current stage, patch allowlist assert |
| `src/lib/cig/__tests__/sequence.test.ts` (or `.mts` per repo) | Unit tests for stage machine |
| `src/lib/cig/verification.ts` | Reuse field completeness predicates; do not duplicate ad hoc |
| `src/lib/cig/forward.ts` | Call sequence assert inside `saveVerificationPatch` (or before it from API) |
| `src/app/api/cig/applications/[id]/route.ts` | PATCH: enforce sequence before save |
| `src/app/api/cig/applications/[id]/checks/route.ts` | POST: require S1 complete before recording checks |
| `src/lib/cig/workspace.ts` | Stepper stages + next-step copy match real locks |
| `src/app/cig/applications/[id]/page.tsx` | Disable/lock cards by stage; honest “locked until …” copy |
| `src/components/cig/CiReferencesFormModal.tsx` | Disable open/save if S3 not unlocked (parent may gate Open button) |

**Do not touch:** auto-forward behavior, receipt hard-gate, Committee APIs, CSA endorse chain, migrations unless a real blocker appears (unlikely).

---

## Frozen sequence (do not invent)

1. **S1 `borrower_review`** — field completeness answered + borrower interview 3× confirmed  
2. **S2 `external_checks`** — all CIG checks pass/fail recorded  
3. **S3 `ci_references`** — PIC + ≥2 complete refs + checklist all true + PIC rating (same subset as Submit today)  
4. **S4 `crewing_manager`** — position, contract status, departure date, fit-to-work  
5. **S5 `finding`** — positive/negative  
6. **S6 `forward`** — existing Submit / `forwardToCommittee`

Within-stage partial saves OK. Cross-stage field writes → `400` with message naming the blocked stage and prerequisite.

Borrower **name** edit: always allowed in `for_verification` (not sequenced).

---

## Phase 0 — Audit lock (no product change)

### Task 0: Confirm baseline behavior

**Files:** none (verify only)

- [x] **Step 1:** Confirm PATCH can save `finding` with empty interview (current bug/gap we are fixing).
- [x] **Step 2:** Confirm Submit still requires full `assessVerificationCompleteness`.
- [x] **Step 3:** Note: no migration expected.

### Phase 0 results (2026-07-24) — DONE

| Check | Result | Evidence |
|-------|--------|----------|
| PATCH `finding` with empty interview | **Allowed** (gap confirmed) | `PATCH` → `assertCigVerificationStage` only (`status === for_verification`), then `saveVerificationPatch` with no sequence assert. `patchToRow` writes `finding` whenever present. |
| Checks Pass/Fail anytime in stage | **Allowed** | `checks/route.ts` POST: stage assert only; no S1 prerequisite. |
| Submit completeness gate | **Works** | `forwardToCommittee` calls `assessVerificationCompleteness`; returns `{ forwarded: false, missing }` if incomplete. |
| Migration needed for hard sequence? | **No** | Stage derived from existing `verifications` + `checks_recorded` columns. |
| Existing sequence helper? | **None** | No `sequence.ts`; only soft `workspace.ts` stepper. |
| Test style to mirror | `__tests__/*.test.mts` | e.g. `src/lib/cig/__tests__/workspace.test.mts` |

**Baseline locked.** Safe to start Phase 1 (pure `sequence.ts` + tests). No product code changed in Phase 0.

---

## Phase 1 — Pure sequence engine (TDD)

### Task 1: Create `sequence.ts` + failing tests

**Files:**
- Create: `src/lib/cig/sequence.ts`
- Create: `src/lib/cig/__tests__/sequence.test.mts`
- Modify: `src/lib/cig/verification.ts` (export shared section predicates)

- [x] **Step 1: Write failing tests** covering plan table
- [x] **Step 2: Run tests — expect fail** (`ERR_MODULE_NOT_FOUND` for `sequence`)
- [x] **Step 3: Implement `sequence.ts`** + export `isBorrowerReviewComplete` / `isCiReferencesComplete` / `isCrewingManagerComplete` / `isFindingRecorded` from `verification.ts`
- [x] **Step 4: Run tests — expect pass** (`npm test` → 362 pass / 0 fail, including sequence suite)
- [ ] **Step 5: Commit** `feat(cig): add hard sequence stage helpers` — *deferred until user asks to commit*

### Phase 1 results (2026-07-24) — DONE (commit pending)

| Deliverable | Status |
|-------------|--------|
| `src/lib/cig/sequence.ts` | Added — `getCigSequenceState`, `assertVerificationPatchAllowed`, `assertChecksRecordingAllowed` |
| `src/lib/cig/__tests__/sequence.test.mts` | Added — stage transitions + reject/allow cases |
| Shared predicates on `verification.ts` | Exported for reuse in Phase 2–4 |
| Product behavior change | **None** (helpers only; APIs not wired yet) |

---

## Phase 2 — Server enforcement

### Task 2: Gate verification PATCH

**Files:**
- Modify: `src/app/api/cig/applications/[id]/route.ts`
- Modify: `src/lib/cig/sequence.ts` (`CigSequenceError`)

- [x] **Step 1: Before `saveVerificationPatch`**, load verification + checks, `assertVerificationPatchAllowed`
- [x] **Step 2: On violation**, return **400** via `CigSequenceError`
- [x] **Step 3: Keep** `assertCigVerificationStage`
- [x] **Step 4: Covered by unit asserts** (finding/CM/CI rejected at wrong stage); live API smoke in Phase 3/4
- [ ] **Step 5: Commit** — deferred until user asks

Also: GET/PATCH responses include `sequence` for Phase 3 UI.

### Task 3: Gate checks POST

**Files:**
- Modify: `src/app/api/cig/applications/[id]/checks/route.ts`

- [x] **Step 1: After stage assert**, `assertChecksRecordingAllowed` (S1 required)
- [x] **Step 2: 400** if S1 incomplete (`CigSequenceError`)
- [ ] **Step 3: Commit** — deferred until user asks

### Phase 2 results (2026-07-24) — DONE (commit pending)

| Endpoint | Behavior |
|----------|----------|
| `PATCH .../cig/applications/[id]` | Rejects out-of-order verification fields with 400 |
| `POST .../cig/applications/[id]/checks` | Rejects Pass/Fail until S1 complete |
| Borrower name PATCH | Unaffected (separate `body.borrower` path) |
| UI locks | Still soft until Phase 3 (server is source of truth now) |

`npm test` → 362 pass / 0 fail

---

## Phase 3 — UI locks + honest stepper

### Task 4: Align workspace stepper with real stages

**Files:**
- Modify: `src/lib/cig/workspace.ts`
- Modify: `src/lib/cig/__tests__/workspace.test.mts`

- [x] **Step 1: Replace** `CIG_WORKSPACE_STAGES` with S1–S6 labels
- [x] **Step 2: Drive** stepper / next-step from `CigSequenceState`
- [x] **Step 3: Unit-test** next-step (no false “unlock finding” on crewing)
- [ ] **Step 4: Commit** — deferred

### Task 5: Lock CIG application page sections

**Files:**
- Modify: `src/app/cig/applications/[id]/page.tsx`

- [x] **Step 1: Load** `sequence` from GET
- [x] **Step 2: Disable** checks / CI / crewing / finding until unlocked
- [x] **Step 3: S1 cards** stay editable when `editable`
- [x] **Step 4: Locked hints** via `cigSequenceLockedHint`
- [x] **Step 5: Name edit + callbacks** unchanged
- [x] **Step 6: Filtered** `handleSaveForm` / gated `saveCiForm` / `recordCheck`
- [ ] **Step 7: Commit** — deferred

### Phase 3 results (2026-07-24) — DONE (commit pending)

Stepper: Borrower → Checks → CI & Refs → Crewing → Finding → Forward.  
UI + server both enforce sequence. `npm test` → 363 pass / 0 fail.

---

## Phase 4 — Hardening + docs

### Task 6: Parity with Submit completeness

**Files:**
- Modify: `src/lib/cig/verification.ts` (`assessVerificationCompleteness.complete` uses section predicates)
- Modify: `src/lib/cig/__tests__/sequence.test.mts` (parity suite)

- [x] **Step 1: Wire** `complete` to S1–S5 predicates + `checksComplete`
- [x] **Step 2: Regression tests** — S6 unlocked ⇒ assess complete; incomplete finding/checks ⇒ not complete
- [ ] **Step 3: Commit** — deferred until user asks

### Task 7: Verify + report

- [x] **Step 1:** `npm test` → **366 pass / 0 fail**
- [x] **Step 2–4:** Manual smoke left to user; post-submit still `editable` only when `for_verification` (3.3b unchanged)
- [x] **Step 5:** Canvas **3.7** Fixed
- [x] **Step 6:** Report below

### Phase 4 results (2026-07-24) — DONE (commit pending)

**Files touched (full feature Phases 1–4):**
- `src/lib/cig/sequence.ts` (new)
- `src/lib/cig/__tests__/sequence.test.mts` (new)
- `src/lib/cig/verification.ts` (shared predicates + complete parity)
- `src/lib/cig/workspace.ts` + `__tests__/workspace.test.mts`
- `src/app/api/cig/applications/[id]/route.ts`
- `src/app/api/cig/applications/[id]/checks/route.ts`
- `src/app/cig/applications/[id]/page.tsx`
- `docs/superpowers/specs/2026-07-24-cig-hard-sequence-design.md`
- `docs/superpowers/plans/2026-07-24-cig-hard-sequence.md`
- canvas: `workflow-compliance-audit.canvas.tsx` item **3.7**

**Skipped / out of scope:** `for_revision` re-edit unlock; auto-forward; hard receipt gate.

**How to test:** CIG app page — complete S1→S6 in order; try Pass on checks before S1 → locked/400; Submit when forward unlocked.

---

## Out of scope (explicit)

| Item | Why |
|------|-----|
| Auto-forward to Committee | Accepted as-is (3.3) |
| Hard receipt gate | Soft advisory kept |
| `for_revision` re-edit unlock | Pre-existing separate gap |
| Renaming DB bucket / other audit items (8.8, 7.1, …) | Unrelated |
| Changing required CI field list | Sequence only; completeness subset frozen |

---

## Suggested phase shipping order

1. **Phase 1** — mergeable alone (helpers + tests; no behavior change until wired)  
2. **Phase 2** — server truth (behavior change; UI still soft until Phase 3)  
3. **Phase 3** — UX matches server  
4. **Phase 4** — parity + canvas  

Do not ship Phase 3 without Phase 2 (UI-only locks are insufficient).

---

## Acceptance criteria

1. Cannot record external checks until S1 complete (UI + API).  
2. Cannot save CI & References / Crewing / Finding until prior stages complete (UI + API).  
3. Within S1 (and within an unlocked stage), partial draft saves still work.  
4. Submit still requires full completeness; negative finding still allowed.  
5. Borrower name edit and callbacks remain available.  
6. Unit tests cover stage transitions and reject cases.
