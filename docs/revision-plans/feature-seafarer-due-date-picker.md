# Seafarer Due-Date Picker (5th / 15th / 25th)

**Source:** Item tracked as Feature #6 in [implementation-tracker-2026-08-25.md](../implementation-tracker-2026-08-25.md), validated word-for-word against the Fathom transcript of the 2026-08-25 meeting (https://fathom.video/calls/797296804).

## What this fixes

Seafarer loans get paid on a fixed payday — the 5th, 15th, or 25th of the month. CSA is supposed to pick whichever one matches the borrower's actual payday, and that becomes the recurring monthly due date for that loan.

**This picker does not exist anywhere in the system today.** The backend field it would feed (`dueDay`) already exists and works end-to-end, but nothing on screen lets anyone set it — so every Seafarer computation today silently gets `dueDay = 10`, a value that was never one of the three valid choices. Per the user's explicit decision, **existing loans stuck on the invalid default are NOT to be corrected** — this plan only stops new ones from happening.

## Decisions already made (do not re-litigate these)

1. Only Seafarer gets the 3-way restriction (5/15/25). SME/Individual keep their current behavior (optional `dueDay`, defaults to 10) — **untouched**.
2. The picker appears **only in CSA's and Committee's calculators** (`ComputationPanel.tsx`, used in both `mode="csa"` and `mode="committee"`). No borrower-facing UI, no other screen.
3. No backfill/correction of existing Seafarer loans currently sitting on `due_day = 10`.

## Constraints for whoever implements this (read before touching anything)

- **Touch only what's listed in each phase's Scope line.** If a phase says "add a field to X," don't also refactor X, rename things in X, or fix unrelated things you notice in X while you're in there.
- **SME and Individual segments must be provably unaffected.** Every phase that touches shared code (the `dueDay` schema field, `persistComputation`, `ComputationPanel.tsx`) must keep the non-Seafarer behavior byte-for-byte the same — same default (10), same optionality. If a test would need to change for SME/Individual because of this work, that's a sign scope has leaked — stop and flag it instead of proceeding.
- **No new abstractions.** This is a 3-option enum on one existing field, threaded through two existing API routes and one existing form. Don't introduce a generic "due-day config" system, a new table, or a new shared component beyond a plain `<Select>`.
- **No DB migration.** `computations.due_day` already exists as a plain integer column with no check constraint (confirmed via `pg_get_constraintdef` against the live DB on 2026-08-26). This work is validation + UI only.
- **Do not touch:** the addon-months logic, the offset/other-loan sections, penalty computation, release-date logic, or anything under `src/lib/ar`. None of those are in scope for this item.
- **After every phase:** run `npx tsc --noEmit -p .` and `npm test` from `loanstar/`. Both must be clean before moving to the next phase. If a pre-existing unrelated test failure is already present before your change, leave it — don't fix things outside this item's scope.
- **Final step (all phases done):** produce one combined summary covering every file touched across all phases (not just the last phase), per the standing validation workflow — Claude will check it against this plan and a real `git status`/diff before marking this item done.

---

## Phase 1 — Restrict the shared validation, Seafarer-only

**Goal:** Make it structurally impossible to save a Seafarer computation with any `dueDay` other than 5, 15, or 25 — and impossible to save one with no `dueDay` at all. SME/Individual must keep accepting `1–28` optional, exactly as today.

**Scope — files to touch:**
- [src/app/api/csa/applications/[id]/computation/route.ts](../../src/app/api/csa/applications/[id]/computation/route.ts) — the Zod schema currently has `dueDay: z.number().int().min(1).max(28).optional()` (line ~82). This is a flat, segment-blind rule today. Add a `.superRefine` (or equivalent) so that when the resolved segment is `"seafarer"`, `dueDay` must be present and must be one of `[5, 15, 25]`. Non-Seafarer segments keep the existing `1–28` optional rule unchanged.
- [src/lib/csa/computation.ts](../../src/lib/csa/computation.ts) — `const dueDay = input.dueDay ?? 10;` (line ~244). This silent `?? 10` fallback must not apply to Seafarer once the route guarantees the field is present and valid for that segment — but don't remove the fallback for SME/Individual, which still rely on it.

**Explicitly out of scope for this phase:** the Committee override route (separate phase below, since it doesn't have a `dueDay` field at all yet — that's a bigger gap than tightening an existing one). The frontend (separate phase). Any other field in either file.

**Done when:**
- A Seafarer computation POST with `dueDay: 10` (or any value not in `[5,15,25]`) is rejected with a clear validation error.
- A Seafarer computation POST with no `dueDay` at all is rejected.
- An SME or Individual computation POST with `dueDay` omitted still succeeds and still defaults to 10, identical to current behavior.
- An SME or Individual computation POST with `dueDay: 20` (currently legal) still succeeds — this phase must not narrow their range.

---

## Phase 2 — Add `dueDay` to the Committee override path

**Goal:** Committee's calculator uses a completely different route (`/api/committee/applications/[id]/override`) that doesn't carry a `dueDay` field at all today — confirmed by reading the route's Zod schema and the `OverrideInput` type it feeds. Without this phase, Phase 1's rule would only ever apply to CSA, and Committee could still silently produce a Seafarer computation with `dueDay` stuck at whatever it last was (or 10, if none existed yet).

**Scope — files to touch:**
- [src/app/api/committee/applications/[id]/override/route.ts](../../src/app/api/committee/applications/[id]/override/route.ts) — add `dueDay` to `overrideSchema`, with the same Seafarer-only `[5,15,25]`-required / else-optional-1–28 rule as Phase 1.
- [src/lib/negotiation/service.ts](../../src/lib/negotiation/service.ts) — `OverrideInput` type (line ~309) needs a `dueDay?: number` field. `persistOverrideComputation` (line ~329) needs to (a) select `due_day` alongside the other fields it already reads from `existingComp` (line ~338, currently doesn't include it), and (b) pass `dueDay` through to the `persistComputation(...)` call (line ~381+), following the exact same "explicit value wins, otherwise preserve what the active computation already had" pattern already used there for `addonMonths` and the rate fields. Do not invent a different fallback pattern for this one field.

**Explicitly out of scope for this phase:** `committeeAdjustPreDecision` and `committeeOverrideAmount` (the two callers) don't need their own signatures changed — they already forward whatever `OverrideInput` contains. Don't touch anything else in this file.

**Done when:**
- A Committee override POST for a Seafarer application behaves identically to Phase 1's CSA rule: `dueDay` required, must be 5/15/25.
- A Committee override POST that omits `dueDay` for a Seafarer application whose active computation already has a valid `due_day` preserves that existing value (same pattern as `addonMonths` today) rather than failing outright — mirroring the existing "omission preserves existing" convention, not a new one.
- SME/Individual override behavior is unchanged.

---

## Phase 3 — Add the picker to `ComputationPanel.tsx`

**Goal:** Give CSA and Committee staff an actual control to pick 5, 15, or 25 — Seafarer-only, using whatever this codebase's existing form-field conventions already are (`Label` + `Select`, matching how "Loan type" or "Input mode" are already built in this same file).

**Scope — files to touch:**
- [src/components/csa/ComputationPanel.tsx](../../src/components/csa/ComputationPanel.tsx) only.
  - Add a `dueDay` piece of state (string, matching how `addonMonths`/`terms` are already handled as strings in this component — don't introduce a different state-typing convention for this one field).
  - Render a `<Select>` with exactly three options (5, 15, 25) — no free-text input, no other values — gated on `segment === "seafarer"` (the same flag already used elsewhere in this file, e.g. `isSeafarer` at line ~405 area). It must not render at all for SME/Individual.
  - Make it a required field for Seafarer in the same way `Amount`/`Terms` are already required (red asterisk `Label` + client-side guard before submit), so staff get an immediate, clear error instead of discovering the problem only from the API's 400 response.
  - Wire it into the existing `handleCompute` POST body (~line 827 area) — add `dueDay: Number(dueDay)` to the payload only when `segment === "seafarer"`. Do not send it for other segments.
  - When editing/recomputing an existing computation, populate the picker from `computation.dueDay` if present (mirroring how `addonMonths` is already hydrated from the existing computation on load).

**Explicitly out of scope for this phase:** any other section of this file (Offset/Other Loan, rate fields, other deductions, the breakdown/summary panel). Do not reorganize the form layout beyond adding this one field in a sensible spot near Terms/Add-on Months.

**Done when:**
- Opening the calculator for a Seafarer application shows the 3-option due-date picker; opening it for SME/Individual does not show it at all.
- Attempting to submit a Seafarer computation with no due-date selected is blocked client-side with a clear message, before any network request fires.
- The value round-trips correctly: pick 15, save, reload the page, the picker still shows 15.

---

## Phase 4 — Tests

**Goal:** Lock in the Seafarer-only restriction and prove SME/Individual are unaffected, the same way the existing `aging-parity.test.mts` suite proved the penalty idempotency fix.

**Scope — files to touch:**
- Whichever `.test.mts` file already covers `src/lib/csa/computation.ts` (or a new one in the same `__tests__` folder if none exists yet — check first, don't assume) — add cases:
  - Seafarer + `dueDay` omitted → rejected.
  - Seafarer + `dueDay: 10` → rejected (10 is not a valid payday).
  - Seafarer + `dueDay: 5` / `15` / `25` → accepted, and the resulting `first_payment_date` calculation actually uses that day (reuse the existing `computeFirstPaymentDate` test fixtures/pattern already in this codebase rather than inventing new ones).
  - SME + `dueDay` omitted → still succeeds, still defaults to 10 (regression guard — this is the test that proves Phase 1 didn't leak scope).
  - Individual + `dueDay: 20` → still succeeds (regression guard for the currently-legal 1–28 range on non-Seafarer segments).
- Equivalent cases for the Committee override path from Phase 2, in whichever test file already covers `persistOverrideComputation`/`committeeOverrideAmount` (check first).

**Explicitly out of scope for this phase:** don't add tests for unrelated existing behavior in these files just because you're in there. Don't modify any existing test's assertions unless a prior phase's change genuinely requires it (and if it does, that's worth flagging back before proceeding, per the constraints above).

**Done when:** `npm test` from `loanstar/` passes, including the new cases, with the full existing suite still green (currently 1363 tests — that number should only go up, never down or change for unrelated reasons).

---

## Phase 5 — Manual verification (no code)

Walk through, in a real browser session, against a test Seafarer application:
1. Open the CSA calculator for a Seafarer application → confirm the due-date picker appears with exactly 5/15/25 as options, no other values selectable.
2. Try to submit without picking one → confirm it's blocked with a clear message.
3. Pick 15, submit → confirm the computation saves and the displayed first payment date matches the 22nd-cutoff rule (already correct) combined with the 15th (newly wired).
4. Open the same application in Committee's override view → confirm the same picker appears and behaves the same way.
5. Open a calculator for an SME or Individual application → confirm the picker does **not** appear, and the computation still saves fine with no due-date input (regression check).

---

## How to use this file

Each phase above is implemented one at a time. After each phase, produce a summary of exactly what changed (files, line ranges, what the tests now cover) for validation against this document before moving to the next phase. After **Phase 5**, produce one **combined summary** covering every phase together — every file touched, every migration (none expected, per the constraints above — flag immediately if one turns out to be needed), and the full final test count — for a single end-to-end validation pass before this item is marked Done on the tracker.
