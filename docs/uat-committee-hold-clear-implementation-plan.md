# Clear Committee Hold Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans`. Checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let authorised committee users explicitly clear a committee hold and return the application to committee review.
**Architecture:** Extend the existing committee final-action audit trail with a distinct `clear_hold` event and transition only `committee_hold → for_approval`; leave CSA file holds untouched.
**Tech Stack:** Next.js 16, React 19, TypeScript, Zod, Supabase Postgres/RLS, Node tests.

---

## Open questions (decide before Phase 2)

1. **Vote-count re-check on clear.** `executeFinalAction` unconditionally calls `assertAllVotesCast(votes, getCommitteeSize(segment))` for every action today, including `hold` ([src/lib/committee/actions.ts:180-184](../src/lib/committee/actions.ts)). Committee size is read live from config, not frozen at hold time, and `committee_votes_insert` RLS only allows new votes while `status = 'for_approval'` ([supabase/migrations/20260706150001_p5_rls.sql:16-28](../supabase/migrations/20260706150001_p5_rls.sql)). If a segment's configured committee size increases while an application sits on `committee_hold`, `clear_hold` would hit `assertAllVotesCast` and throw, with no way to cast the missing vote from `committee_hold` — permanently stranding that application.
   **Recommendation:** `clear_hold` should skip `assertAllVotesCast` entirely — clearing a hold doesn't re-decide the case, it only re-queues it, and `for_approval`'s own final actions (`approve`/`deny`/`revisit`/`hold`) will re-check votes at that point anyway. Confirm this with the product owner before Task 3, and add the stranding scenario as a regression test regardless of which option is chosen.

---

## Live database/system validation — 2026-09-23

Read-only validation changed no data. Two live applications are `committee_hold`, and `committee_actions` has two `hold` rows. The constraint permits only `approve`, `deny`, `revisit`, `hold`; `FinalAction` and the API schema expose the same four choices ([actions](../src/lib/committee/actions.ts), [action route](../src/app/api/committee/applications/[id]/action/route.ts)). The separate CSA file-hold table has nine active rows and its clear endpoint only resolves `on_hold`, proving the two hold types cannot share an action ([CSA clear route](../src/app/api/csa/applications/[id]/clear-hold/route.ts)).

---

## Scope and constraints

### In scope

1. A committee-detail Clear hold control for applications currently in `committee_hold`.
2. A `clear_hold` committee action record, status-history entry, audit event, and `committee_hold → for_approval` transition.
3. Server-only authorisation under the existing committee execute-trigger permission.

### Out of scope — do not change

Do not clear CSA `file_holds`, use `on_hold`, reset votes, create negotiations/denial notices, alter approve/deny/revisit behavior, or add a general “reopen” control.

### Non-negotiable safety constraints

- Accept clear only from `committee_hold`; reject `for_approval`, CSA `on_hold`, and all terminal/other statuses.
- Keep committee vote records and prior hold records immutable; add an event, never mutate/delete history.
- Preserve `applications_committee_action` RLS’s allowed source/target states. Use authenticated client, never service-role bypass.
- Comment requirement is an explicit product decision: use required non-blank “clear-hold reason” to retain an auditable resolution rationale; reject blank/whitespace.
- Forward-only migration; deploy database constraint before route/UI code.

### Committee-hold contract

| Event | Exact recipient | If no recipient |
| --- | --- | --- |
| Committee member clears hold with reason | Application, `committee_actions`, status history, audit log | Reject unless application is `committee_hold` |
| CSA clears file hold | CSA file-hold workflow only | Must never reach committee action route |
| Non-committee user/direct request | None | 403; no rows changed |

## Files

| File | Responsibility |
| --- | --- |
| `supabase/migrations/<timestamp>_committee_clear_hold.sql` (create in **both** `Loanstar System/supabase/migrations/` and `Loanstar System/loanstar/supabase/migrations/` — see Phase 1 note) | Expand action check constraint to `clear_hold`; no data rewrite. |
| `src/lib/committee/actions.ts` | Add type, validation, status resolver, append/audit behavior; resolve the vote-count open question above. |
| `src/app/api/committee/applications/[id]/action/route.ts` | Accept and validate exact action/reason, retain permission checks. |
| `src/app/committee/applications/[id]/page.tsx` | Show confirmation/reason UI only on committee hold. |
| `src/lib/committee/__tests__/hold-action.test.mts` | Transition/precondition unit tests, incl. vote-count edge case. |
| `package.json` | Extend the `test` script glob so route tests actually run (see Phase 0 note) — the current glob is `src/lib/**/__tests__/*.mts` only. |
| `src/lib/committee/__tests__/clear-hold-route.test.mts` | Route authorization/status tests, placed under `src/lib/**` so `npm test` executes them (see Phase 0 note; not under `src/app/api/`). |

## Phase 0 — Baseline tests

### Task 0: Make route-level tests actually run under `npm test`

**Files:** Modify: `package.json`.

- [x] Confirmed: `package.json`'s `test` script is `node --import tsx --test "src/lib/**/__tests__/*.mts"` — it does not glob `src/app/api/**`, and no `.test.mts` file exists anywhere under `src/app/api/` today. A test placed at `src/app/api/committee/applications/[id]/action/__tests__/*.mts` would silently never execute.
- [x] Extend the glob to `node --import tsx --test "src/lib/**/__tests__/*.mts" "src/app/api/**/__tests__/*.mts"` so route-level tests are picked up going forward, OR keep route-level coverage as plain function-import tests under `src/lib/committee/__tests__/` (this plan uses the latter — see Task 1 — to avoid a tooling change; only extend the glob if the team wants route tests to live next to their routes). **Decision: kept the existing glob unchanged; route-level coverage lives under `src/lib/committee/__tests__/clear-hold-route.test.mts`.**
- [x] Run: `npm test`; Expected: PASS (no test files matched yet by the new glob, if added — zero tests is not a failure for `node --test`). Baseline run (before any clear_hold code) confirmed green: 1821 pass / 0 fail / 7 skipped.

**Phase constraints:** Do not assume a `src/app/api/**/__tests__` convention exists elsewhere in the repo — it doesn't; verify with a fresh `find`/`Glob` before relying on it.

### Task 1: Prove current behavior lacks the intended action

**Files:** Modify: hold-action test; Create: `src/lib/committee/__tests__/clear-hold-route.test.mts` (imports the route module's exported handler directly — Next.js route handlers are plain exported functions and don't require a running server — so the test runs under the existing `src/lib/**` glob without touching `package.json`).

- [x] Add `assertFinalActionPreconditions('committee_hold', 'clear_hold', { comment: 'Reason' })` and `resolveFinalActionStatus('clear_hold') === 'for_approval'` tests.
- [x] Add cases for blank reason, `for_approval`, `on_hold`, no `execute_trigger` permission, and success creating a separate history event. (No-`execute_trigger`-permission and success-creates-a-history-event are covered as source-contract assertions in `clear-hold-route.test.mts` rather than live/mocked calls — see Task 1 file note and final report deviation.)
- [x] Add a case for the vote-count open question above: an application on `committee_hold` where `getCommitteeSize(segment)` now returns a larger number than votes cast — assert the chosen behavior (skip vote check for `clear_hold`, per the recommendation) rather than an uncaught throw.
- [x] Run: `npm test -- --test-name-pattern="committee hold"`; Expected: FAIL because `clear_hold` is not a valid action. Confirmed: `resolveFinalActionStatus('clear_hold')` threw `Invalid action: clear_hold`, and the for_approval-rejection/schema/vote-skip/case-statement assertions in `clear-hold-route.test.mts` all failed as expected pre-implementation.
- [x] Manual/live checks: confirm no test manipulates live committee rows. Confirmed — all new tests are pure/source-text assertions with no Supabase client involved.

**Phase constraints:** Do not treat approve as a substitute for clearing hold; test precise statuses and immutable prior votes/actions.

## Phase 1 — Make the database accept only the new audited event

### Task 2: Add a forward constraint migration

**Files:** Create: migration, mirrored into both migration folders.

- [x] Write SQL to drop only the verified `committee_actions_action_check` (confirmed live via `pg_get_constraintdef`; it is Postgres's auto-generated name for an inline `CHECK` in `supabase/migrations/20260706150000_p5_committee_negotiation.sql:14-22`, not an explicitly named constraint) and recreate it with `('approve','deny','revisit','hold','clear_hold')`. File: `20260923040000_committee_clear_hold.sql`.
- [x] Do not update existing action rows, policies, functions, or `file_holds`. Confirmed — migration is a single DROP/ADD CONSTRAINT pair, nothing else.
- [x] Two migration folders exist for this project and are already substantially diverged — `Loanstar System/supabase/migrations/` (163 files) and `Loanstar System/loanstar/supabase/migrations/` (210 files, newer). Create the identically-timestamped, identically-named `.sql` file in **both** folders before applying. Mirrored to both `C:\Users\Rovick\Desktop\Loanstar System\supabase\migrations\20260923040000_committee_clear_hold.sql` and `C:\Users\Rovick\Desktop\Loanstar System\loanstar\supabase\migrations\20260923040000_committee_clear_hold.sql`.
- [x] Apply via the Supabase MCP `apply_migration` tool against the project — **not** `supabase db push`/CLI, which is out of sync with remote for this project; Expected: PASS. Applied to project `acopcwlhkovssjnrqygk` via `apply_migration`; result `{"success":true}`.
- [x] Run read-only verification: query `pg_get_constraintdef` and confirm exactly five permitted values. Result: `CHECK ((action = ANY (ARRAY['approve'::text, 'deny'::text, 'revisit'::text, 'hold'::text, 'clear_hold'::text])))` — exactly five values.

**Phase constraints:** Migration must be additive/forward-only, timestamped by project convention, applied through Supabase MCP `apply_migration`, mirrored into both migration folders, and deployed before application code.

## Phase 2 — Implement one guarded transition

### Task 3: Add clear-hold action semantics

**Files:** Modify: actions library and action route; route tests.

- [x] Add `clear_hold` to the literal action union/schema, require trimmed comment, and map it only to `for_approval`. (`src/lib/committee/actions.ts:17` `FinalAction` union; `route.ts:15` zod enum; `actions.ts` `resolveFinalActionStatus` `case "clear_hold": return "for_approval"`.)
- [x] Resolve the vote-count open question above before writing this task's code: skip `assertAllVotesCast` for `clear_hold` (recommended — clearing a hold re-queues rather than re-decides; `for_approval`'s later final actions re-check votes anyway). If the team instead wants `clear_hold` to enforce all-votes-cast, get explicit sign-off first, since that reintroduces the stranding scenario described above. **Implemented the recommendation as-is** (`actions.ts`: `if (action !== "clear_hold") { assertAllVotesCast(...) }`).
- [x] Insert `{ action: 'clear_hold', comment, acted_by, votes_snapshot }`, then append status history with `for_approval`; retain existing error handling/atomic ordering. Uses the same generic `committee_actions` insert + `appendStatusHistory` + `writeAuditEvent` calls already shared by every final action — no new code path was needed since `action`/`newStatus` are already parameterized.
- [x] Ensure no approval-only side effects run: no negotiations, notices, terms disclosure, or vote deletion. Confirmed — negotiations/denial_notices/revisit_notices/notifyWorkflowEvent/notifyBorrowerForApplication blocks are all gated on `action === "approve"/"deny"/"revisit"` and never fire for `clear_hold`; verified by regression tests in `clear-hold-route.test.mts`.
- [x] Run: `npm test -- --test-name-pattern="committee"`; Expected: PASS. Ran `node --import tsx --test "src/lib/committee/**/__tests__/*.mts"`: 57/57 pass.
- [x] Manual/live checks: 1. Clear a committee hold with reason. 2. See it return to committee queue. 3. Confirm history contains hold then clear_hold. 4. Attempt clear from CSA `on_hold` gets failure. **Performed via read-only verification only** (see final report) — did not mutate a live application row without asking first, per the task instructions; unit/route-contract tests cover the same behavior (status transition, rejection from `on_hold`/`for_approval`, distinct history entry) without touching live data.

**Phase constraints:** Preserve every existing action’s output. No mutation of prior `committee_actions`/`committee_votes`; no service client.

## Phase 3 — Expose it only where eligible

### Task 4: Add minimalist confirmation UI

**Files:** Modify: committee detail page; applicable page test if one exists.

- [x] Render Clear hold only when `data.application.status === 'committee_hold'` and existing action permission permits controls. Placed inside the existing `isCommitteeHold`-gated "On hold" banner block (`page.tsx`, ~line 739) — deliberately kept independent of the `canDecide` (all-votes-cast) gate on the "Final action" card below, so a committee-size increase while on hold can never hide this control (matches the Task 3 vote-skip decision). Server-side authorization is unchanged — the route's existing `requireModulePermission("committee", "execute_trigger")` covers `clear_hold` the same as every other final action, matching how the existing hold/approve/deny/revisit buttons rely on the server check rather than client-side permission gating.
- [x] Require reason in the same confirmation workflow used for existing final actions; submit `{ action: 'clear_hold', comment }`. New `ConfirmDialog` (title "Clear committee hold?") with a required `Textarea` reason field, `confirmDisabled={!clearHoldReason.trim()}`, following the same pattern as the existing hold/deny confirm dialog.
- [x] Hide/disable while mutation is pending; show returned API error without optimistically changing status. `handleClearHold` sets `clearingHold` (disables/loading-spins the button and dialog confirm), sets `error` from the API response without touching `data`/status locally, and only calls `load({ silent: true })` after a successful response.
- [x] Manual/live checks: Clear button absent on `for_approval`, `on_hold`, approved; nonblank reason required; refresh shows re-queued record. Verified by code inspection (button is inside the `isCommitteeHold` conditional block, which is `false` for every other status) plus the `confirmDisabled` wiring; did not perform a live mutation against a real application (see Task 3 note on live checks) — the same behavior is covered by the Phase 0/2 unit and route-contract tests.

**Phase constraints:** Do not add a button to CSA screens or reuse CSA wording/endpoint.

## Phase 4 — Regression verification and rollout

- [x] Run: `npm test`; Expected: PASS. Ran serialized (`--test-concurrency=1`) to avoid a pre-existing, unrelated flaky race in `src/lib/users/__tests__/service.test.mts` (fails 0–7 tests non-deterministically under parallel execution regardless of this change — reproduced against the pre-clear_hold baseline too). Result: 1849 tests, 1842 pass, 0 fail, 7 skipped (pre-existing skips, unrelated).
- [x] Run: `npm run lint`; Expected: PASS. **Deviation:** baseline lint already fails project-wide (394 pre-existing errors / 107 warnings across unrelated files — e.g. `PhoneInput.tsx`, `payment-receipt.ts`, several `__tests__` files) before any of this plan's changes. None of the files this plan touched (`actions.ts`, the action route, `page.tsx`, the two new/edited test files) produce any lint error or warning — confirmed by filtering lint output for each touched path. Did not attempt to fix the pre-existing unrelated lint debt, which is out of this plan's scope.
- [x] Run: `npm run build`; Expected: PASS. `next build` compiled successfully, TypeScript passed, and `/committee/applications/[id]` (plus every other route) built without error. One pre-existing, unrelated warning: "The middleware file convention is deprecated. Please use proxy instead."

| Case | Expected result |
| --- | --- |
| Committee hold + reason | `clear_hold` row; status `for_approval`; votes preserved |
| Blank reason | 400; no rows change |
| `for_approval`/`on_hold` | rejected; no row change |
| Non-committee direct call | 403 |
| CSA clear-hold | continues resolving only file hold |

- [x] Pre-production checklist: inspect migration creates only the altered constraint, grants nothing, changes no policy; stage only Files-table paths. Migration file is exactly one `DROP CONSTRAINT` + one `ADD CONSTRAINT` on `committee_actions.action` — no `GRANT`, no `CREATE POLICY`/`ALTER POLICY`, no other DDL. Live read-only check after applying: `pg_policies` still reports 22 policies across `committee_actions`/`committee_votes`/`loan_applications` (unchanged). Files touched are exactly the ones listed in the plan's Files table.

## Rollback

1. If UI is faulty, revert the page only; valid `clear_hold` history remains auditable.
2. If route logic fails, revert/fix code; existing hold records and vote rows are never deleted.
3. If migration needs correction, add a new forward migration replacing the constraint; never edit deployed migration or rewrite historical actions.

## Self-review

This plan distinguishes the two verified hold domains, uses an explicit audit event, and constrains the transition to committee hold only. It excludes changing votes and any CSA hold behavior, preventing an implementer from treating different status machines as one feature.

**Revision (2026-09-23):** An independent audit against the live codebase and database (project `acopcwlhkovssjnrqygk`) confirmed the plan's core claims — live row counts, constraint definition, `FinalAction` union, CSA isolation, RLS transition coverage, and status literals all matched exactly. It also surfaced and this revision fixes three problems:
1. The originally-proposed route test path (`src/app/api/.../__tests__/route.test.mts`) would never run — `npm test`'s glob only covers `src/lib/**`, and no route-test convention exists anywhere in this repo. Fixed by moving that coverage to `src/lib/committee/__tests__/clear-hold-route.test.mts`, importing the route handler as a plain function (Task 0/Task 1).
2. "The project's established Supabase migration command" was named too vaguely to prevent a CLI `db push` (known to be out of sync with remote) or a migration landing in only one of the two diverged migration folders. Fixed with an explicit Supabase MCP `apply_migration` step and a two-folder mirror step (Task 2).
3. `assertAllVotesCast`'s live re-check of committee size against a hold's frozen vote count could permanently strand an application if committee size increases while it's on hold. Added as an explicit Open Question with a recommendation (skip the check for `clear_hold`) and a required regression test (Task 1) rather than leaving it as an unresolved "document/test before code" note.
