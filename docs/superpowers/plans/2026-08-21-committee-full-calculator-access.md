# Committee Full Calculator Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The user runs **one phase at a time** and reviews the summary before the next phase starts.

**Goal:** Give Committee the exact same rich calculator CSA has — active-loan dropdowns, the offset month-checkbox modal, multi-loan rows, everything from `ComputationPanel.tsx` — instead of their current narrow "Override" form (amount/terms/mode only, no Other Loan/Offset). Editable under the **same safety window Override already uses today**: only pre-decision (`for_approval`) or during negotiation (`negotiating_terms`) — never after the borrower has signed, never after release.

**Context — why this is safe to build on top of what exists:** Committee already has a working, audited, status-gated path for changing computation numbers: `POST /api/committee/applications/[id]/override` → `committeeAdjustPreDecision` / `committeeOverrideAmount` in `src/lib/negotiation/service.ts`. That route already:
- Gates on `app.status ∈ {"for_approval", "negotiating_terms"}` (`route.ts:37`) — reject otherwise.
- Dispatches to the right negotiation side-effects (no status change pre-decision; full negotiation-record update + audit trail during negotiation).
- Clears the prior signature so the borrower must re-sign the new numbers.
- Writes an audit event (`route.ts:52-65`).

**We reuse all of that.** This plan does NOT create a parallel safety mechanism — it extends the *existing* override schema/service to also accept `otherDeductions` (fixed in the prior session to preserve existing values when omitted — this plan makes it accept new values too), and swaps Committee's cramped inline form for the same `ComputationPanel` component CSA uses, pointed at the override endpoint instead of CSA's endpoint.

**Architecture:**
- **No schema migration** — `otherDeductions`/`other_deductions` JSONB, same as prior plans.
- **`ComputationPanel.tsx` becomes endpoint-agnostic**: add a `mode: "csa" | "committee"` prop that selects which API base path it talks to, instead of hardcoding `/api/csa/...`.
- **Committee's compute call goes through `override`, not a new endpoint** — same status gate, same audit trail, same negotiation side-effects CSA/Committee already trust.
- **Design System:** Deep Harbor / Meridian, reuse `Modal`/`Checkbox`/`Select`/`Button` from `@/components/ui` (already used by `ComputationPanel`).

**Tech Stack:** Next.js App Router, React Client Components, TypeScript, Zod, Supabase.

---

## Ground Rules (Every Phase)

- **Closed Allow / Do Not Touch lists.** If an edit is needed outside the Allow list, STOP and flag before editing.
- After each phase, check `git diff --stat` — only files on that phase's Allow list may be touched.
- **Do not commit** unless the user explicitly requests.
- Run the tests specified in each phase before moving on.
- **One phase at a time.** Do not proceed to Phase N+1 until Phase N verification passes.

---

## Hard Constraints (AI Protection Rules)

### Never Modify
- `src/lib/ar/*`, `src/lib/lra/*`, `src/lib/cig/*` (unrelated modules)
- `src/app/borrower/*` (borrower portal — out of scope)
- Any database schema or migration files
- `sumHalfUp` / `halfUp` in `src/lib/computation/money.ts`
- The status gate itself (`app.status ∈ {"for_approval", "negotiating_terms"}` in `override/route.ts`) — this is the safety boundary the user explicitly asked to keep matching Override's existing behavior. Widening it is out of scope for this plan.

### Touch With Extreme Care
- `src/lib/negotiation/service.ts` (already has the override side-effects other flows depend on — additive changes only)
- `src/lib/computation/sf.ts` / `sme.ts` — should need **zero** changes this plan; if a task seems to require touching them, STOP, that's a sign of scope creep.

---

## Locked Product Decisions

| # | Feature | Behavior |
|---|---|---|
| 1 | **Same calculator** | Committee's computation card becomes the live, editable `ComputationPanel` (same active-loan selector, same offset modal with multi-loan support) when editable; read-only summary (today's existing rendering) otherwise. |
| 2 | **Same safety window as Override** | Editable only when `application.status` is `for_approval` or `negotiating_terms`. Once the borrower has signed / application has moved past that, it reverts to the existing read-only view — no new editing window is being opened. |
| 3 | **Reuses Override's plumbing** | Submitting from Committee's panel calls `POST /api/committee/applications/[id]/override`, not a new endpoint — inherits the existing status gate, audit event, signature-clear, and negotiation-record side effects unchanged. |
| 4 | **otherDeductions becomes settable, not just preservable** | The negotiation service already (from the prior fix) *preserves* existing `otherDeductions` when the caller omits it. This plan extends that so Committee actively *setting* new Other Loan/Offset values also flows through — explicit input wins, omission falls back to the previous value. |
| 5 | **Active loans + loan types for Committee** | Committee needs the same "which of the borrower's other loans are active" list and loan-type list CSA's panel fetches. New minimal endpoints reusing the existing masterlist/loan-types read logic, gated by `committee` permission instead of `computation`/`intake`. |

---

## Phase 1: Negotiation Service — Accept Explicit `otherDeductions`

### Scope
Let the override input actually carry a new `otherDeductions` value (not just preserve the old one).

### Allow List
- `src/lib/negotiation/service.ts`
- `src/lib/negotiation/__tests__/*` (add tests only if a reasonable lightweight test is feasible without heavy Supabase mocking — otherwise rely on Phase 5's manual verification)

### Tasks
- [x] In `OverrideInput` (already has `otherDeductions?: OtherDeductions` from the prior session's bug fix), no type change needed — confirm it's still there.
- [x] In `persistOverrideComputation`, change:
  ```ts
  otherDeductions: (existingComp?.other_deductions as OtherDeductions | null) ?? undefined,
  ```
  to:
  ```ts
  otherDeductions:
    input.otherDeductions ??
    (existingComp?.other_deductions as OtherDeductions | null) ??
    undefined,
  ```
  (explicit input wins; omission still preserves the existing value — this is additive on top of the prior fix, not a revert of it)

### Verification
- [x] `npx tsc --noEmit` — baseline unchanged (13 pre-existing, unrelated).
- [x] `npm run test` — 0 failures.

---

## Phase 2: Override Endpoint — Accept the Full Deduction Shape

### Scope
Extend the Zod schema so the override route accepts everything CSA's compute schema does for deductions (legacy singular fields + the multi-loan arrays).

### Allow List
- `src/app/api/committee/applications/[id]/override/route.ts`

### Tasks
- [x] Extend `overrideSchema` with an optional `otherDeductions` object mirroring CSA's `computeSchema.otherDeductions` exactly (same fields: `otherLoan`, `otherLoanAccountNo`, `offset`, `offsetAccountNo`, `offsetMonths`, `otherLoans[]`, `offsets[]`, `advancePayment`, `previousLoanBalance`, `accountOpening`).
- [x] No change to the status-gate check, dispatch logic, or audit event — `body` already flows straight into `committeeAdjustPreDecision`/`committeeOverrideAmount` unchanged, so once the schema accepts the field, it reaches Phase 1's code automatically.

### Verification
- [x] `npx tsc --noEmit` — baseline unchanged.
- [ ] POST to `/api/committee/applications/[id]/override` with `otherDeductions.otherLoans` populated on a `for_approval` application — confirm 200 and the saved computation reflects it.
- [ ] Confirm the existing status-gate rejection (any other status) still returns 400 with the same message — unchanged behavior.

---

## Phase 3: Read Access — Active Loans & Loan Types for Committee

### Scope
Committee's panel needs the borrower's active loan accounts (for the Other Loan/Offset pickers) and the loan-type list (for the loan-type dropdown), same data CSA's panel already gets, via committee-appropriate permission checks.

### Allow List
- `src/app/api/committee/applications/[id]/route.ts` (add `activeLoans` to the existing GET response — same pattern as the CSA computation route's fix from the prior session: `createServiceClient()` for the masterlist read, since Committee has neither `accounting_ar` nor `super_admin`)
- `src/app/api/committee/loan-types/route.ts` (new file — mirrors `src/app/api/csa/loan-types/route.ts` exactly, except `requireModulePermission("committee", "view")` instead of `("intake", "view")`)

### Tasks
- [x] In the committee application GET route, add the same `borrower_id` → `masterlist` (`account_status = 'active'`) query the CSA computation route uses, via `createServiceClient()`, and include `activeLoans` in the JSON response alongside the existing `computation`/application data.
- [x] Create `src/app/api/committee/loan-types/route.ts`: copy `src/app/api/csa/loan-types/route.ts` verbatim except the permission check.

### Verification
- [x] `npx tsc --noEmit` — baseline unchanged.
- [ ] GET `/api/committee/applications/[id]` on an application whose borrower has an active loan — confirm `activeLoans` is populated (not silently empty from RLS, per the pattern already fixed once this session).
- [ ] GET `/api/committee/loan-types` — confirm it returns the same list CSA's endpoint does.

---

## Phase 4: `ComputationPanel` — Endpoint-Agnostic Mode

### Scope
Make the component usable from both CSA and Committee without duplicating ~700 lines of UI.

### Allow List
- `src/components/csa/ComputationPanel.tsx`

### Tasks
- [x] Add a `mode?: "csa" | "committee"` prop, default `"csa"`.
- [x] Replace every hardcoded `/api/csa/applications/${applicationId}/computation` fetch with a computed base: `` `/api/${mode}/applications/${applicationId}/${mode === "committee" ? "override" : "computation"}` `` for the POST, and `` `/api/csa/applications/${applicationId}/computation` `` stays as the GET source for `activeLoans`/`computation` **only when `mode === "csa"`**; for `mode === "committee"`, GET `` `/api/committee/applications/${applicationId}` `` instead and read `activeLoans`/`computation` off that response shape (adjust the response-parsing type locally, the two payloads carry the same fields per Phase 3).
- [x] Replace the hardcoded `/api/csa/loan-types` fetch with `` `/api/${mode}/loan-types` ``.
- [x] The committee override response shape is `{ computation }` (no `coverage` field) — `handleCompute`'s `data.coverage?.message` handling should just no-op gracefully (already optional-chained, no change needed) — confirm this rather than assume.
- [x] No visual/behavioral change for `mode === "csa"` — this phase must be a no-op for the existing CSA screen. Verify by diffing the CSA panel's rendered behavior before/after.

### Verification
- [x] `npx tsc --noEmit` / `npm run test` — baseline unchanged.
- [ ] CSA Computation Panel still works exactly as before (open it, compute, confirm no regressions) — this is the highest-risk step since it's a shared component.

---

## Phase 5: Committee Page — Swap in the Live Panel

### Scope
Replace Committee's current read-only computation card + separate narrow override form with the same `ComputationPanel`, editable only in the locked status window.

### Allow List
- `src/app/committee/applications/[id]/page.tsx`

### Tasks
- [x] Compute `const computationEditable = ["for_approval", "negotiating_terms"].includes(data.status)` (or whatever the existing status field is called on this page) — this must match the override route's own gate exactly, so the UI never offers an action the backend will reject.
- [x] Render `<ComputationPanel mode="committee" applicationId={...} loanTypeId={...} editable={computationEditable} computation={data.computation} onUpdated={...} />` in place of the current static computation card. Keep the existing read-only rendering (with the multi-loan Other Loan/Offset lines from the prior plan) as the fallback when `!computationEditable`, OR pass it through `ComputationPanel`'s own non-editable rendering if that already covers the same display needs — check `ComputationPanel`'s non-editable JSX path before deciding which to keep, to avoid duplicate rendering logic.
- [x] Remove (or keep, per what's cleanest given what Phase 5 finds) the old narrow inline override form fields for amount/terms/mode now that the full panel supersedes them — do not remove the negotiation-specific UI (counter-offer, accept/reject) which is a separate concern from computation editing.

### Verification
- [ ] Open Committee review on an application in `for_approval` — confirm the full editable calculator renders (active-loan dropdowns, offset modal with multi-loan support), and submitting recomputes + updates the display.
- [ ] Open Committee review on an application `negotiating_terms` — same, and confirm the existing negotiation status-transition side effects still fire (check `negotiations` table / status history, same as today's Override).
- [ ] Open Committee review on an application in any OTHER status (e.g. `approved`, `for_release`) — confirm the panel renders read-only, matching today's behavior, and no edit controls are exposed.

---

## Phase 6: Automated Test Sweep & Regression Check

### Scope
Full regression pass, confirm zero out-of-scope breakage across CSA and Committee.

### Allow List
- No source changes — verification only.

### Tasks
- [x] `npx tsc --noEmit` — error count matches the pre-existing baseline exactly.
- [x] `npm run test` — full suite, 0 failures.
- [x] `git diff --stat` — confirm only files on the Allow lists above were touched across all phases.
- [ ] Manual walk-through (or ask the user to confirm): CSA panel unaffected, Committee panel gains full editing pre-decision/during-negotiation, Committee panel stays read-only outside that window.
