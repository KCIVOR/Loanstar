# Feature — CIG cancel/withdraw application (Revision Tracker 2, Item 2)

**Ground rules (apply to every phase):**
- Touch only the files listed under "Files to change." If you find a related spot not listed, stop and flag it rather than editing it.
- Do not rename, refactor, or "clean up" adjacent code you encounter while editing a listed file.
- Mirror the existing patterns exactly (`recordApplicationHold`/`file_holds` shape, `appendStatusHistory`, `writeAuditEvent`, the `applications_cig_forward`/`applications_cig_return` RLS pattern) — do not invent a different mechanism.
- Execute phases in order. Each phase must leave the app green (tests passing) before the next starts.
- Run existing tests after each phase; do not delete or weaken a test to make it pass.
- At the end of all phases, output one combined summary: files changed, migration(s) applied, tests run/result.

## Background

Revision Tracker 2, Item 2: during the CI stage, a borrower sometimes tells CIG (during a reference-check callback or a direct call) that they want to withdraw their application. CIG needs a way to cancel it right there — status becomes "Cancelled," it drops out of CIG's active queue, a reason is required, the action is logged (who/when/why), the record stays fully intact (not deleted, still visible in history), only CIG can do this at the `for_verification` stage, it's irreversible from the UI, and a confirmation dialog guards against accidental clicks.

## Audit findings (verified 2026-08-14)

- **No `cancelled` status exists today.** The full closed vocabulary is `src/lib/constants.ts:131-153` (`APPLICATION_STATUSES`), mirrored 1:1 in `src/lib/applications/status.ts` (`STATUS_LABELS`, `STATUS_BADGE_VARIANTS`) — both need a new `"cancelled"` entry. There is no DB-level `CHECK` constraint on `loan_applications.status` (the closed set is TS-only today), so adding the value is additive, not a schema migration by itself.
- **"Denied" and "cancel/withdraw" are already distinct concepts, but only "denied" exists.** Denial is Committee-driven (`for_approval → denied`, `src/lib/committee/actions.ts:161-236`) and CIG's existing `denial-informed` route is only *courtesy-call tracking* after the fact (marks `denial_notices.informed_at`, no status change, no reason). This new feature is a **different, new transition**: `for_verification → cancelled`, CIG-triggered, borrower's own choice, with a required reason. Do not touch anything in the denial/`denial_notices` path.
- **CIG's active queue is a pure status filter, live-verified**: `src/lib/cig/queue.ts:260` — `.in("status", ["for_verification", "for_revision"])`. There is no separate queue-membership table (unlike LRA's `release_queue`). **Setting `status = 'cancelled'` alone removes the application from the active queue — no extra step needed.**
- **No unified "application history" exists in the CIG module.** `src/app/cig/history/page.tsx` is a tabbed shell (`HistoryTab = "forwarded" | "returned" | "denialCalls" | "callbacks"`, `:46,57-60`) where each tab is backed by a *companion table's timestamp*, not by `loan_applications.status`: Forwarded (`verifications.forwarded_at`), Returned (`cig_return_to_csa_events`), Denial Calls (`denial_notices.informed_at`), Callbacks (`callbacks.resolved_at`). **A cancelled application will not automatically show up anywhere in CIG's history** just from the status change — it needs its own new tab backed by a new companion table, exactly like the other three. (The application record itself is never deleted regardless — `loan_applications` row + `status_history` persist and stay reachable at `/cig/applications/[id]` even without a history-tab listing.)
- **Status-transition pattern, live-verified as the template to copy**: `recordApplicationHold()` (`src/lib/csa/record-hold.ts:8-45`) — insert a reason-bearing companion-table row → `appendStatusHistory(supabase, applicationId, "on_hold", { actorId, note: reason })` (`src/lib/applications/status.ts:82-129`, which reads current `status_history`, appends `{status, at, actorId, note}`, writes `status`+`status_history` together, and treats 0-rows-updated as a hard failure — an RLS-silent-failure guard already built in). Route template: `src/app/api/csa/applications/[id]/hold/route.ts` — `zod` schema `{ reason: z.string().min(3) }` → `requireModulePermission` → lib helper → `writeAuditEvent`.
- **RLS — a new UPDATE policy is required, live-confirmed** (`pg_policies` on `loan_applications`): `applications_cig_borrower_edit`'s `WITH CHECK` only permits the new status to stay `for_verification` — it does not cover a status change and must not be touched. The two existing CIG-authored status-transition policies are the exact shape to mirror:
  ```sql
  -- applications_cig_forward (live):
  USING (is_super_admin() OR (has_module_permission('verification','execute_trigger') AND status = 'for_verification'))
  WITH CHECK (is_super_admin() OR status = 'for_approval')
  -- applications_cig_return (live):
  USING (is_super_admin() OR (has_module_permission('verification','execute_trigger') AND status = 'for_verification'))
  WITH CHECK (is_super_admin() OR status = 'submitted')
  ```
  A new `applications_cig_cancel` policy follows the identical shape with `WITH CHECK (is_super_admin() OR status = 'cancelled')`. This is a well-established, intentional pattern in this codebase — the comment at `supabase/migrations/20260710100000_cig_flow_alignment.sql:61-62` explicitly documents that CIG's UPDATE policies are meant to OR together this way (multiple valid target statuses from the same `for_verification` source), so adding a third sibling policy is safe and matches precedent, not a new risk.
  - `guard_draft_status_transition` trigger only fires `WHEN OLD.status = 'draft'` — confirmed no interference with `for_verification → cancelled`.
- **CIG's `verification:execute_trigger` grant already exists** (`supabase/migrations/20260706100002_p1_seed_data.sql:61`, `can_execute_trigger = true`) — same grant `applications_cig_forward`/`applications_cig_return` already use. No role/permission seed change needed, only the new RLS policy.
- **No reactivation UI exists anywhere in the app** — `src/app/admin/**` has no generic status-override route. `is_super_admin()` is already OR'd into every RLS UPDATE policy on `loan_applications` (including the new one this plan adds), so a Super Admin *could* already write any status via direct DB access/future tooling, but there is no button/page for it today. **Out of scope for this plan** — noted here so it isn't silently assumed to exist.
- **Ripple effect of a new status value — two borrower-facing files with hardcoded status handling, found by grepping every consumer of `STATUS_LABELS`/`APPLICATION_STATUSES`**:
  - `src/lib/borrowers/home.ts:272-277` — a `switch`/`case "denied"` block producing the borrower's dashboard message; needs a matching `case "cancelled"` (a plain "Application cancelled" message, mirroring the denied case's shape) or the borrower would fall through to whatever the default case shows (not a crash, but likely wrong copy).
  - `src/components/StatusTimeline.tsx:11,25` — `const isDenied = currentStatus === "denied"` driving a special terminal-step label; needs an equivalent `isCancelled` branch so the borrower's own timeline renders sensibly instead of showing a stuck/wrong in-progress state.
  - No other consumer of the status vocabulary was found with denied-specific special-casing (`src/components/dashboard/widgets/pipeline.tsx` and the reports label test iterate the map generically, no special-case branch — should pick up the new label automatically once added to `STATUS_LABELS`).

## Scope decision

Four phases: DB/RLS foundation, backend route, frontend cancel action, then the history tab (each independently verifiable; history is last since it's additive UI, not a blocker for the core cancel action to work).

---

## Phase 1 — DB: new status value, `application_cancellations` table, RLS

**Goal:** `"cancelled"` exists as a real status option, a table exists to record the reason/actor, and RLS permits CIG to make exactly this one transition.

### Files to change

1. **New migration file**, applied via Supabase MCP `apply_migration` to both `supabase/migrations/` and `loanstar/supabase/migrations/`:
   ```sql
   CREATE TABLE public.application_cancellations (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     loan_application_id uuid NOT NULL REFERENCES public.loan_applications(id) ON DELETE CASCADE,
     reason text NOT NULL,
     cancelled_by uuid NOT NULL REFERENCES auth.users(id),
     created_at timestamptz NOT NULL DEFAULT now()
   );

   CREATE INDEX idx_application_cancellations_application ON public.application_cancellations(loan_application_id);

   ALTER TABLE public.application_cancellations ENABLE ROW LEVEL SECURITY;

   CREATE POLICY application_cancellations_select ON public.application_cancellations
     FOR SELECT TO authenticated
     USING (
       is_super_admin()
       OR has_module_permission('verification', 'view')
     );

   CREATE POLICY application_cancellations_insert ON public.application_cancellations
     FOR INSERT TO authenticated
     WITH CHECK (
       is_super_admin()
       OR has_module_permission('verification', 'execute_trigger')
     );

   CREATE POLICY applications_cig_cancel ON public.loan_applications
     FOR UPDATE TO authenticated
     USING (
       is_super_admin()
       OR (
         has_module_permission('verification', 'execute_trigger')
         AND status = 'for_verification'
       )
     )
     WITH CHECK (
       is_super_admin()
       OR status = 'cancelled'
     );
   ```
   - Table shape mirrors `file_holds` exactly (`supabase/migrations/20260706130000_p3_csa_computation.sql:92-99`) — `reason text NOT NULL`, actor FK, `created_at`. RLS mirrors `file_holds_select`/`file_holds_insert` (`supabase/migrations/20260706130001_p3_rls.sql:146-158`), swapping `intake` for `verification` (the module CIG's other status-transition policies use).
   - Do not add an UPDATE or DELETE policy on `application_cancellations` — like `file_holds`, this is an append-only log; no code path should ever need to edit or remove a row.
   - Do not touch `applications_cig_borrower_edit`, `applications_cig_forward`, or `applications_cig_return`.

2. **`src/lib/constants.ts`** — add `"cancelled"` to `APPLICATION_STATUSES` (`:131-153`), append-only, do not reorder existing entries.

3. **`src/lib/applications/status.ts`** — add a `cancelled` entry to `STATUS_LABELS` (e.g. `"Cancelled"`) and `STATUS_BADGE_VARIANTS` (use `"danger"`, matching `denied`'s existing variant — confirm the exact variant `denied` uses before picking one, don't guess).

4. **`src/lib/borrowers/home.ts`** — add a `case "cancelled":` branch alongside the existing `case "denied":` (`:272-277`), matching its shape (title + description), with copy along the lines of "Application cancelled" / "This application was cancelled at your request. Contact us if this was a mistake." — do not change the `denied` case.

5. **`src/components/StatusTimeline.tsx`** — add an `isCancelled` check alongside `isDenied` (`:11`) and use it the same way `isDenied` is used at `:25`, so the timeline's terminal step reflects "Application cancelled" instead of an unstyled/default state. Do not change the denied-path behavior.

### Validation checklist — Phase 1

- [ ] `application_cancellations` table exists with RLS enabled, matching the policy shapes above.
- [ ] `applications_cig_cancel` policy exists on `loan_applications`; `applications_cig_forward`, `applications_cig_return`, `applications_cig_borrower_edit` are byte-identical to before.
- [ ] `"cancelled"` appears in `APPLICATION_STATUSES`, `STATUS_LABELS`, `STATUS_BADGE_VARIANTS` — every other entry unchanged.
- [ ] Borrower dashboard (`home.ts`) and `StatusTimeline` handle a `cancelled` status without falling through to a denied-shaped or broken UI — spot check by temporarily setting a test application's status to `cancelled` in a scratch query (not committed) and viewing the borrower's dashboard/timeline, then revert.
- [ ] `npx tsc --noEmit` clean.
- [ ] Existing test suite still passes.

### Status: Done (2026-08-14)

Migration + table + RLS + status-vocabulary/borrower-UI changes match this phase exactly (diffed directly). One deviation caught and fixed by Claude post-implementation, not Cursor: the migration file was saved locally as `20260814090000_...` but Supabase tracked it as `20260814005808_...` when applied via MCP (same filename-drift class as the earlier project-wide migration realignment) — renamed in both migration folders to match.

---

## Phase 2 — Backend: cancel route + lib helper

**Goal:** `POST /api/cig/applications/[id]/cancel` — validated reason, permission + stage gate, atomic status change + companion-table row + audit event.

### Files to change

1. **New file: `src/lib/cig/cancel.ts`**
   ```ts
   import type { SupabaseClient } from "@supabase/supabase-js";
   import { appendStatusHistory } from "@/lib/applications/status";

   export async function cancelApplication(
     supabase: SupabaseClient,
     input: { applicationId: string; reason: string; actorId: string },
   ): Promise<{ cancellationId: string }> {
     const { data: cancellation, error: insertError } = await supabase
       .from("application_cancellations")
       .insert({
         loan_application_id: input.applicationId,
         reason: input.reason,
         cancelled_by: input.actorId,
       })
       .select("id")
       .single();

     if (insertError || !cancellation) {
       throw new Error(insertError?.message ?? "Failed to record cancellation");
     }

     await appendStatusHistory(supabase, input.applicationId, "cancelled", {
       actorId: input.actorId,
       note: input.reason,
     });

     return { cancellationId: cancellation.id as string };
   }
   ```
   Mirrors `recordApplicationHold` (`src/lib/csa/record-hold.ts`) exactly, minus the `blocker` column update (holds use `blocker` to surface a message elsewhere in the app; cancellation is terminal, there's no "in-progress with a blocker" state to represent, so leave `blocker` untouched — do not set it to anything).

2. **New file: `src/app/api/cig/applications/[id]/cancel/route.ts`**
   - Mirror `src/app/api/csa/applications/[id]/hold/route.ts` structurally: `zod` schema `{ reason: z.string().min(3) }`, `requireModulePermission("verification", "execute_trigger")` (matching the RLS policy's gate, not `"edit"` — this is a trigger-style action, same permission class as forward/return), then `assertCigVerificationStage(supabase, id)` (`src/lib/cig/queue-guards.ts` — same stage guard the existing PATCH route uses, so cancel is only reachable from `for_verification`), then call `cancelApplication(...)`, then `writeAuditEvent({ actorId: user.id, moduleSlug: "verification", action: "execute_trigger", entityType: "application_cancellation", entityId: cancellationId, afterData: { applicationId: id, reason: body.reason } })`.
   - Return `jsonOk({ cancellation: { id: cancellationId, reason: body.reason } })`.
   - Only `POST` — no `GET`/`PATCH`/`DELETE` on this route.

### Validation checklist — Phase 2

- [ ] `POST` with a valid reason on a `for_verification` application: `loan_applications.status` becomes `cancelled`, `status_history` gets a new entry with the reason as `note`, a new `application_cancellations` row exists with the same reason, and an `audit_events` row is written.
- [ ] `POST` with a reason under 3 characters is rejected with a 400, no DB writes occur.
- [ ] `POST` on an application not in `for_verification` status is rejected (existing `assertCigVerificationStage` behavior), no DB writes occur.
- [ ] A non-CIG role (e.g. Collector, or CSA) cannot reach this route — confirm `requireModulePermission`/RLS both reject.
- [ ] Cancelling an application does not touch `borrowers`, `computations`, or any document/file record.
- [ ] `npx tsc --noEmit` clean.
- [ ] Existing test suite still passes.

### Status: Done (2026-08-14)

Route and `cancelApplication()` helper match this phase's spec exactly, diffed directly. Full test suite 892/892.

---

## Phase 3 — Frontend: cancel action with confirmation + reason

**Goal:** A "Cancel Application" action in the CIG application view, gated to the `for_verification` stage, requiring a reason and a confirmation step before it fires.

### Files to change

1. **`src/app/cig/applications/[id]/page.tsx`**
   - Add a "Cancel Application" button, visible only when `editable` is true (same gate every other CIG action on this page already uses) — place it near the other stage-level actions (do not put it inside the borrower profile card next to "Edit Application Form"; it acts on the *application*, not the borrower record — a natural spot is alongside the "Forward to Committee" / "Return to CSA" actions if those are visibly grouped together on this page; check the existing layout before picking a spot, mirror the existing action-button grouping rather than inventing new page structure).
   - Add local state for a confirmation dialog/modal: a reason textarea (required, mirror the `reason: z.string().min(3)` minimum client-side) and two buttons ("Cancel Application" to confirm, "Back" to abort without submitting). Use the existing `Modal`/`Alert`/`Button` components already imported on this page — do not add a new UI library or pattern.
   - Submit handler: `POST /api/cig/applications/${applicationId}/cancel` with `{ reason }`, on success show a success message and navigate back to `/cig` (the queue) — mirror `handleRevisionComplete` or another existing terminal-action handler on this page for the exact fetch/error/navigate shape.
   - After a successful cancel, the application should no longer be actionable on this page (status is now `cancelled`, `editable` will be `false` on next load) — reloading via `load({ silent: true })` before navigating away is enough; do not add special-case UI for the cancelled state on this page itself (the borrower-facing timeline/dashboard changes from Phase 1 cover that surface; this page's normal "not editable" read-only rendering already handles a non-`for_verification` status).

### Validation checklist — Phase 3

- [ ] Cancel button only visible when `editable` is true.
- [ ] Clicking it opens a confirmation dialog with a required reason field — submitting with an empty/too-short reason is blocked client-side before the request fires.
- [ ] Confirming actually cancels the application (status change visible on reload) and the CIG user lands back on the queue, with the cancelled application no longer listed there.
- [ ] "Back"/cancel-the-dialog aborts with zero side effects (no request sent).
- [ ] `npx tsc --noEmit` clean.
- [ ] Existing test suite still passes.

### Status: Done (2026-08-14)

Implemented using the existing `ConfirmDialog` component (a better fit than the generic "Modal" I specified — reused as-is), placed next to "Submit CI report to Committee" as instructed. Reason-length gating matches the server's `.min(3)` on both sides. Diffed directly.

**Bonus fix beyond this plan's scope, in its own commit**: Cursor found and fixed that `cancelled` wasn't yet treated as a terminal status in `src/lib/borrowers/reloan.ts` (`RELOAN_TERMINAL_STATUSES`), `src/lib/borrowers/pipeline.ts` (dashboard pipeline widget), and `src/lib/csa/history.ts` (CSA's own history grouping) — three files this plan's audit missed because they use their own hardcoded status lists rather than the `STATUS_LABELS`/`APPLICATION_STATUSES` constants I grepped for. Verified the fix is correct (a borrower whose only application was cancelled would otherwise be wrongly blocked from starting a reloan). A deviation from "touch only listed files," but the right call — done in its own clearly-labeled commit rather than silently folded in.

---

## Phase 4 — CIG history: "Cancelled" tab

**Goal:** Cancelled applications are visible in CIG's history view, matching the shape of the existing three tabs.

### Files to change

1. **`src/lib/cig/history.ts`** — add `getCigCancellationsHistory()`, mirroring `getCigDenialCallsHistory()` (`:892-997`, the closest existing shape: actor + reason + timestamp) but querying `application_cancellations` joined to `loan_applications`/`borrowers` instead of `denial_notices`. Same date-range/pagination parameter shape as the existing history functions — do not invent a different query-param contract.
2. **New file: `src/app/api/cig/history/cancellations/route.ts`** — mirrors `src/app/api/cig/history/denial-calls/route.ts` structurally (permission gate, param parsing, calls the new lib function).
3. **`src/app/cig/history/page.tsx`**
   - Add `"cancellations"` to the `HistoryTab` union (`:46`) and a chip to `TAB_CHIPS` (`:57-60`, label `"Cancelled"`).
   - Add a new tab section mirroring the Denial Calls tab's component (closest shape: borrower, application no., reason, actor, timestamp columns) — reuse the existing `Table`/`TableSkeleton`/sort/date-range-filter patterns already in this file, do not build new table/filter primitives.
   - Do not modify the existing three tabs' code.

### Validation checklist — Phase 4

- [ ] New "Cancelled" tab appears in CIG history, lists cancelled applications with borrower, application no., reason, cancelled-by, and timestamp.
- [ ] Date-range filtering on the new tab works the same way it does on the existing tabs.
- [ ] Existing three tabs (Forwarded, Returned, Denial Calls, Callbacks) are visually and functionally unchanged.
- [ ] `npx tsc --noEmit` clean.
- [ ] Existing test suite still passes.

### Status: Done (2026-08-14)

Library function and route match this phase's spec — same pagination/search/sort pattern as the other history functions. Noted: `cancelledBy` stays a raw user-id UUID with no display-name resolution, same as the existing `informedBy` field on the Denial Calls tab — consistent with a pre-existing minor imperfection in the codebase's own precedent, not a new gap introduced by this work, and not something this plan asked to fix.

---

## Final validation

- [x] Full test suite run — no new failures (892/892, re-run independently on the feature branch, 2026-08-14).
- [x] Code-level validation: all 4 phases' diffs read directly against this plan, `tsc --noEmit` clean (same 4 pre-existing unrelated errors), live-verified the new table/RLS/migration-tracking state in Supabase directly.
- [x] Migration filename drift caught and fixed (local file renamed in both migration folders to match the Supabase-tracked version).
- [ ] Live: as CIG, open a `for_verification` application, cancel it with a reason, confirm: status is `cancelled`, it's gone from the active queue, it appears in the new "Cancelled" history tab with the correct reason/actor/timestamp, and `audit_events` has a matching row.
- [ ] Live: confirm the borrower's own dashboard/timeline for that application shows a sensible "cancelled" message, not a denied-shaped or broken state.
- [ ] Live: confirm a non-CIG role cannot reach the cancel route/UI.
- [ ] Live: confirm the application record itself (borrower data, documents, verification findings) is fully intact and viewable — nothing was deleted.
