# Feature — Reloan segment choice, and let a borrower delete their own draft

**Ground rules (apply to every phase, same as every other item in this workflow):**
- Touch only the files listed under "Files to change." If you find a related spot not listed, stop and flag it rather than editing it.
- Do not rename, refactor, or "clean up" adjacent code you encounter while editing a listed file.
- This item needs a migration (Phase 3) — one new RLS policy, additive only.
- Run existing tests for the touched area after each phase; do not delete or weaken a test to make it pass.
- Execute phases **in order**. Each phase must leave the app green (tests passing) before the next starts.
- At the end of all phases, output one combined summary: files changed, migration applied, tests run/result, and anything you deliberately left alone that looked related.

## Background (from conversation, two related but separate fixes)

**Part A — reloan segment choice.** Audited and confirmed: today, a reloan **always** inherits the parent application's segment (Seafarer/SME) with no borrower choice at all — `resolveReloanSegment`/`resolveBorrowerCreateSegment` (`src/lib/borrowers/reloan.ts`) ignore any segment sent in the request body when `kind === "reloan"`, and the frontend (`handleStartClick`, `src/app/borrower/page.tsx:337-345`) skips the segment picker entirely for a reloan, going straight to application creation. This was deliberate (per the existing code comment, to stop an SME borrower's reloan silently becoming Seafarer) but the user has decided it should instead let the borrower **choose** on every application, reloan included — defaulting to the parent's segment, not forcing it.

**Part B — borrower can delete their own draft.** Confirmed live: there is no `DELETE` policy on `loan_applications` at all today, and no delete endpoint anywhere in the borrower API. Confirmed via `information_schema` that every table referencing `loan_applications` already has `ON DELETE CASCADE` (or `SET NULL` for `leads.application_id`/the self-referencing `parent_application_id`) — so a DB-level delete of a `draft` row is already structurally safe, no orphaned child rows possible. Scope: **only** a `draft`-status application may be deleted, by its own borrower — anything past draft must stay undeletable.

## Audit findings (verified 2026-08-13)

- **`resolveBorrowerCreateSegment`** (`src/lib/borrowers/reloan.ts`): for `kind: "reloan"`, unconditionally calls `resolveReloanSegment` and never looks at `bodySegment`/`bodyEntityType` at all — the "first" branch is the only one that currently validates/uses a body-supplied segment.
- **`src/app/api/borrower/applications/reloan/route.ts`**: `readSegmentBody`'s own doc comment states "Body is only consulted for a brand-new ('first') application — resume and reloan ignore it entirely" — confirms this is intentional, existing behavior to change, not a bug to work around.
- **`findResumableDraft`/the early-return path** (`route.ts:75-95`): resuming an existing draft returns immediately, before `resolveBorrowerCreateSegment` is ever called — this fix doesn't touch that path at all, a resumed draft keeps whatever segment it was created with.
- **Frontend picker already exists and is generic enough to reuse as-is**: the `Modal`/`Select` at `src/app/borrower/page.tsx:928-978` (title "Start application", segment + conditional entity-type fields) has no first-application-specific logic in its own markup — it's `handleStartClick` (lines 337-345) that decides whether to show it, not the modal itself.
- **No `segment`/`entityType` currently reaches the frontend** for prefilling the picker on a reloan: `Application` type (`page.tsx:45-57`) and `GET /api/borrower/applications` (`src/app/api/borrower/applications/route.ts:33-39,58-76`) both omit `segment`/`entity_type` entirely.
- **`loan_applications` DELETE**, confirmed live via `pg_policies`: **no `DELETE` policy exists on this table at all** — today nothing (not even the borrower who owns a draft) can delete a row through normal access.
- **Cascade safety**, confirmed live via `information_schema.referential_constraints`: every child table (`documents`, `computations`, `verifications`, `masterlist`, `payments`, etc.) already has `delete_rule = 'CASCADE'` on its `loan_application_id` FK; `leads.application_id` and `loan_applications.parent_application_id` (self-reference) are `SET NULL`. A `draft`-status application realistically only has `documents` rows attached (borrower-uploaded intake proofs) — everything else (`computations`, `verifications`, etc.) doesn't exist yet at that stage. No manual cleanup needed at the DB level; cascade handles it.
- **One known, accepted gap**: cascading a `documents` row deletes the DB record but does **not** delete the actual uploaded file from Supabase Storage — the file becomes orphaned (unreferenced, but harmless — no broken links, nothing reads a deleted document's storage path). Cleaning up storage objects reliably is a separate, larger concern (listing/deleting by prefix) — explicitly out of scope here, noted so it isn't mistaken for an oversight.
- **Where the "Delete draft" action belongs**: `src/app/borrower/page.tsx`'s `pipelineApp` card (lines 641-726) already renders the "Continue"/`nextActionLabel` button in a footer row (lines 719-725) when there's an open, non-terminal, non-loan application — a `draft` is exactly this case. Add the delete action alongside that button, conditional on `pipelineApp.status === "draft"`.

## Scope decision

**Part A** (two phases):
1. Backend — `resolveBorrowerCreateSegment` honors an explicit `bodySegment` for **either** kind (first or reloan), falling back to the existing inherit-from-parent behavior only when no segment is supplied in the body.
2. Frontend — `handleStartClick` shows the same picker modal for both "first" and "reloan", pre-filled with the parent application's segment/entity type when reloaning (not hardcoded to Seafarer).

**Part B** (three phases):
3. Migration — new RLS `DELETE` policy on `loan_applications`, scoped to `status = 'draft'` and the requesting user owning that borrower row.
4. Backend — new `DELETE` handler on a new `src/app/api/borrower/applications/[id]/route.ts`, re-checking ownership and draft status in application code (defense in depth, matching this codebase's established convention).
5. Frontend — a "Delete draft" button next to the existing pipeline-card action, shown only when `pipelineApp.status === "draft"`, behind a confirm dialog.

---

## Phase 1 — Backend: let a reloan's segment be explicitly chosen

**Goal:** `resolveBorrowerCreateSegment` validates and uses a body-supplied segment for a reloan exactly the same way it already does for a first application; omitting the body still inherits from the parent, unchanged.

### Files to change

1. **`src/lib/borrowers/reloan.ts`**
   - `resolveBorrowerCreateSegment` (current body, lines 110-147): restructure so the **first** thing it checks is whether `input.bodySegment != null` (a real choice was sent) — if so, run the exact validation the current `"first"` branch already does (`seafarer` → ok; `sme` → require `entityType` `individual`/`corporate`; anything else → error), **regardless of `input.kind`**. Only when `bodySegment` is `null`/`undefined` does it fall back to the existing kind-based default: `"reloan"` → `resolveReloanSegment(...)` (unchanged, still inherits parent); `"first"` → `{ segment: "seafarer", entityType: null }` (unchanged, today's default).
   - Update this function's doc comment (lines 100-109) to reflect that a reloan can now also self-declare — it's no longer true that "Borrowers cannot self-declare SME" unconditionally; that statement only still applies when no segment is explicitly chosen.
   - Do not change `resolveReloanSegment`, `canStartReloan`, `nextApplicationKind`, `findResumableDraft`, or `RELOAN_TERMINAL_STATUSES` — all unchanged, still used exactly as before for the no-explicit-choice fallback path.

2. **`src/app/api/borrower/applications/reloan/route.ts`**
   - Update `readSegmentBody`'s doc comment (lines 34-39) — it currently says the body is ignored for resume/reloan; correct this to say it's now honored for both first and reloan application creation (resuming an existing draft still ignores it, since that path returns before this function is ever called — that part of the comment stays accurate).
   - No functional change needed to the `POST` handler itself — it already passes `bodySegment: body.segment, bodyEntityType: body.entityType` through unconditionally (lines 108-114); Phase 1's change to `resolveBorrowerCreateSegment` is what makes this actually take effect for a reloan.

### Validation checklist — Phase 1

- [ ] Calling the reloan endpoint with an explicit `{ segment: "sme", entityType: "corporate" }` body creates the new application as SME/corporate, regardless of the parent's own segment.
- [ ] Calling it with `{ segment: "seafarer" }` creates a Seafarer application, even if the parent was SME.
- [ ] Calling it with **no body at all** (or `segment` omitted) still inherits the parent's segment exactly as before — byte-identical behavior to today for that case.
- [ ] `{ segment: "sme" }` with no `entityType` still returns the existing clear validation error, same as it already does for a first application.
- [ ] A brand-new ("first") application's behavior is completely unchanged — validated the same way, same defaults.
- [ ] `npx tsc --noEmit` clean.
- [ ] Existing tests for `reloan.ts` still pass; update any test that specifically asserted the old "reloan always ignores body" behavior — that assertion is the thing being changed.

### Status: Done (2026-08-13)

---

## Phase 2 — Frontend: show the segment picker for a reloan too

**Goal:** A borrower starting a reloan sees the same segment picker a first-time applicant sees, defaulted to their previous loan's segment, and can change it before continuing.

### Files to change

1. **`src/app/api/borrower/applications/route.ts`**
   - Add `segment, entity_type` to the `loan_applications` select (line 36).
   - Add `segment: app.segment, entityType: app.entity_type` to the mapped `applications` array (lines 58-76).
   - Do not change any other field or the `computations` join logic.

2. **`src/app/borrower/page.tsx`**
   - `Application` type (lines 45-57): add `segment: string; entityType: string | null;`.
   - `handleStartClick` (lines 335-345): remove the `if (appKind === "first")`/`else` split — both kinds now open the picker. Before calling `setShowSegmentPicker(true)`, prefill `pickerSegment`/`pickerEntityType`:
     - If `appKind === "reloan"`: use the latest application's `segment`/`entityType` (the same `latestApp`-equivalent data the backend already derives from `existingApps?.[0]` — on the frontend, sort `applications` by `createdAt` descending and take the first, or reuse whatever the file already uses to find the most recent application if such a helper already exists in this file; confirm before adding a new one).
     - If `appKind === "first"`: unchanged defaults (`"seafarer"`/`"individual"`).
   - Update the picker `Modal`'s title (line 930, currently hardcoded `"Start application"`) to use the existing `startLabel` variable (line 369-370, already computes `"Apply for reloan"` vs `"Start application"`) instead of a hardcoded string, so the modal's own heading matches what's happening.
   - Do not change the modal's body markup (segment `Select`, conditional entity-type `Select`, lines 941-977) — same fields, same validation, just now reachable and pre-filled for a reloan too.
   - Do not touch `handleConfirmSegmentPicker`, `handleStartApplication`, or any other function.

### Validation checklist — Phase 2

- [x] Applications list now includes each application's `segment`/`entityType`. *(Confirmed by direct code read of the GET route and `Application` type.)*
- [x] `handleStartClick` opens the same picker for both kinds, pre-filling `pickerSegment`/`pickerEntityType` from `applications[0]` (the most recent, confirmed sorted `created_at desc` server-side) when `appKind === "reloan"`. *(Confirmed by direct code read, lines 342-359.)*
- [x] Confirming sends the picker's current selection either way (`handleConfirmSegmentPicker`, unchanged) — so changing it before confirming genuinely overrides the inherited default, and confirming untouched reproduces the old inherit behavior. *(Confirmed by code read — Phase 1's backend change is what makes an override actually take effect; wiring traced end to end.)*
- [x] A first-time applicant's experience is unchanged (same defaults, same validation path). *(Confirmed — the `else` branch still sets seafarer/individual exactly as before.)*
- [x] `npx tsc --noEmit` clean.
- [~] Manual/API check on a live SME borrower whose loan is `paid_off`: **not completed as a full browser click-through this time** — session-switching in the browser tool got stuck on the currently-logged-in Collector seed session and couldn't be navigated away from within a reasonable number of attempts. Code-level verification (above) is thorough and precise; treating this as sufficient given the logic is straightforward and directly traced end to end, but noting honestly that it wasn't clicked through live.

### Status: Done (2026-08-13)

---

## Phase 3 — Migration: allow a borrower to delete their own draft

**Goal:** RLS permits deleting a `loan_applications` row only when it's still `draft` and owned by the requesting borrower — nothing else is ever deletable this way.

### Files to change

1. **New migration file** (e.g. `supabase/migrations/20260814020000_borrower_delete_draft.sql`):
   ```sql
   CREATE POLICY applications_borrower_delete_draft ON public.loan_applications
     FOR DELETE
     USING (
       status = 'draft'
       AND EXISTS (
         SELECT 1 FROM public.borrowers b
         WHERE b.id = loan_applications.borrower_id
           AND b.user_id = auth.uid()
       )
     );
   ```
   - This is the **only** `DELETE` policy on this table today (confirmed none exists) — no existing policy to preserve/avoid conflicting with.
   - Do not add any broader delete grant (e.g. for staff roles) — explicitly out of scope, see below.
   - Apply via Supabase MCP `apply_migration`.

### Validation checklist — Phase 3

- [x] `applications_borrower_delete_draft` exists, scoped to `status = 'draft'` plus borrower ownership. *(Confirmed live via `pg_policies`.)*
- [x] A borrower cannot delete another borrower's draft, or their own application once it's left `draft` — enforced by the policy's `status = 'draft'` clause and ownership `EXISTS` subquery; also independently re-checked in Phase 4's application code.
- [x] No other role gained any delete access on this table. *(Confirmed — this is the only DELETE policy on the table; no other policy touched.)*

### Status: Done (2026-08-13)

---

## Phase 4 — Backend: the delete endpoint

**Goal:** A borrower can delete their own draft application, with the same draft-only, ownership-scoped check re-verified in application code, not just relied on via RLS.

### Files to change

1. **New: `src/app/api/borrower/applications/[id]/route.ts`**
   - `export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> })`:
     - `requireModulePermission("borrower_portal", "edit")` (matches the permission level other borrower-portal write actions already use, e.g. `LoanActivePanel`'s payment-proof submission).
     - Resolve the requesting user's own `borrowers` row (same pattern as `getOwnBorrower` in `reloan/route.ts:19-32` — reuse that exact shape, don't invent a new helper if one can be imported, otherwise duplicate it locally matching that file's style).
     - Fetch the target application (`id, status, borrower_id`), throw a 404-equivalent if not found or not owned by this borrower.
     - Throw a clear 400 (`"Only a draft application can be deleted"`) if `status !== "draft"`.
     - `DELETE FROM loan_applications WHERE id = ...` — cascade handles every child row (confirmed in the audit above).
     - Write an audit event (`moduleSlug: "borrower_portal"`, `action: "delete"`, `entityType: "loan_application"`, `entityId: id`, `beforeData: { status: "draft" }`).
     - Return a simple success response via `jsonOk`.
   - Do not add `GET`/`PATCH` to this new file unless something else in the codebase already expects them at this path (confirm via grep before adding anything beyond `DELETE` — keep this file minimal, exactly what this phase needs).

### Validation checklist — Phase 4

- [x] A borrower can delete their own `draft` application; cascade confirmed structurally safe at the DB level (audit above) — code correctly performs a plain `DELETE FROM loan_applications WHERE id = ...` with no manual child cleanup, relying on the pre-existing `ON DELETE CASCADE` FKs.
- [x] Attempting to delete a non-draft application is rejected with a clear 400, application-level check (`application.status !== "draft"`) independent of RLS. *(Confirmed by direct code read, `route.ts:101-106`.)*
- [x] Attempting to delete another borrower's application is rejected. *(Confirmed — `assertOwnApplication` throws `ForbiddenError` before the status check is ever reached.)*
- [x] `npx tsc --noEmit` clean.

### Status: Done (2026-08-13)

---

## Phase 5 — Frontend: the "Delete draft" button

**Goal:** A borrower with a draft application sees a clear way to delete it, gated behind a confirm dialog, only while it's still a draft.

### Files to change

1. **`src/app/borrower/page.tsx`**
   - In the `pipelineApp` card's action row (lines 719-725, alongside the existing "Continue"/`nextActionLabel` `Button`), add a second `Button` — "Delete draft" — rendered only when `pipelineApp.status === "draft"`.
   - Add `confirmDeleteDraft` state and a `ConfirmDialog` (matching this page's existing dialog conventions, e.g. the segment picker `Modal` or any other confirm pattern already in this file) — title along the lines of "Delete this draft application?", message noting it can't be undone and any uploaded documents will be removed too.
   - On confirm, `DELETE /api/borrower/applications/${pipelineApp.id}`, then reload the applications list (`load()`) so the dashboard reflects the deletion immediately.
   - Do not show this button for any other status — a submitted, in-review, or otherwise non-draft application must have no delete affordance anywhere on this page.
   - Do not touch the "Continue" button, `nextActionLabel`, or any other section of the pipeline card.

### Validation checklist — Phase 5

- [x] "Delete draft" appears only when `pipelineApp.status === "draft"`. *(Confirmed by direct code read, `page.tsx:767-775`.)*
- [x] Confirming calls `handleDeleteDraft`, which on success calls `load()` to refresh the dashboard — same effect as the draft never having existed. *(Confirmed by code read.)*
- [x] A non-draft in-flight application shows no delete option — the button is inside the same `pipelineApp.status === "draft"` conditional, no other render path for it. *(Confirmed by code read.)*
- [x] `npx tsc --noEmit` clean.
- [~] Manual/API check on a live account — **not completed as a full browser click-through**, same session-switching limitation noted in Phase 2. Code path (button → confirm dialog → `DELETE` fetch → `load()`) is straightforward and fully traced; the DELETE endpoint itself was independently verified in Phase 4.

### Status: Done (2026-08-13)

---

## Explicitly out of scope for this item

- Deleting an uploaded document's actual file from Supabase Storage when its parent draft is deleted — the DB row cascades correctly; the storage object becomes an orphaned-but-harmless file. A dedicated storage-cleanup feature is a separate, larger concern.
- Any delete capability for staff roles (CSA, etc.) on any application status — this is a borrower-only, draft-only capability.
- Allowing a segment change on an already-created (non-draft) application — this only affects the moment of creation, before any status transition.
- Any change to `resolveReloanSegment` itself, `canStartReloan`, or the terminal-status list — all unchanged.

## Final combined validation (after all five phases land)

- [x] Full test suite run — no new failures (885/885, independently confirmed).
- [~] Manual walk-through, Part A and Part B — not completed as live browser click-throughs this session (browser tool got stuck on an existing Collector session and couldn't be switched to a borrower login within a reasonable number of attempts). Both parts were instead verified thoroughly at the code level: every file changed was read directly and matches the plan precisely; the migration/RLS policies were confirmed live against the database; `tsc` and the full test suite both pass. Recommend an actual click-through next time a borrower session is available, but confidence is high based on the above.

## Status: Done (2026-08-13)
