# Feature — Committee: auto-bypass borrower confirmation when no portal account (Revision Tracker 2, Item 3)

**Ground rules:**
- Touch only the files listed under "Files to change." If you find a related spot not listed, stop and flag it rather than editing it.
- Do not touch the normal (has-account) flow's behavior in any way — this is purely an additive branch for the no-account case.
- Do not weaken any existing RLS policy — the bypass rides the committee actor's *existing* write permission on `loan_applications`; the `release_queue` write reuses the existing service-role pattern `queueForLra()` already uses (do not grant committee a new direct RLS permission on `release_queue`).
- Seafarer only — do not touch SME approval behavior.
- Run existing tests after the change; do not weaken a test to make it pass.
- Output a summary at the end: files changed, migration(s) if any, tests run/result.

## Background

Revision Tracker 2, Item 3: when Committee approves a loan for a borrower who has no portal account (application entered manually by CSA), the app should skip the "notify borrower, wait for them to confirm/counter-propose" step and route straight to LRA — automatically, no manual override. When the borrower does have an account, nothing changes. Committee's own UI should show a "no account" indicator before voting.

## Audit findings (verified 2026-08-14)

- **Full chain today**: Committee Approve (`src/lib/committee/actions.ts:135-283`, `executeFinalAction`) sets status → `"approved"`, upserts a `negotiations` row (`status: "pending_disclosure"`, `:203-213`). CSA then discloses terms (`src/lib/negotiation/service.ts:55-116`, `discloseTerms()`) → status → `"awaiting_confirmation"`. The borrower then confirms via `POST /api/borrower/applications/[id]/computation` (`:81-174`) — **gated by `requireModulePermission("borrower_portal","edit")` + `assertOwnApplication` (`borrower.user_id === userId`), i.e. genuinely borrower-portal-only, no staff workaround exists today.** On confirm, `queueForLra()` (`src/lib/negotiation/service.ts:300-343`) upserts `release_queue`, sets negotiation `status: "signed"`, and `appendStatusHistory(admin, applicationId, "lra_pending", { note: "Borrower signed computation — queued for LRA" })`. `queueForLra` already ignores its passed-in client and uses `createServiceClient()` internally (existing comment: RLS blocks non-service writes for this specific insert) — the bypass reuses this exact function, not a new mechanism.
- **No portal account check**: `borrowers.user_id IS NULL` — the established idiom used elsewhere (`src/lib/borrowers/claim.ts:46`).
- **RLS already permits committee to write `lra_pending` directly**: `applications_committee_action` (`supabase/migrations/20260717094500_fix_committee_hold_status.sql:6-28`) — `WITH CHECK` already includes `status IN (..., 'awaiting_confirmation', 'lra_pending')`. **No RLS change needed on `loan_applications`.** The `release_queue` insert is what needs service-role (same as today's `queueForLra`), not a new RLS branch.
- **Segment check**: `executeFinalAction` already fetches `.select("id, status, segment")` (`actions.ts:144`) — a `application.segment !== "sme"` guard is a one-line addition, no new query.
- **`writeAuditEvent`/`appendStatusHistory` extension point**: right after the existing `if (action === "approve") { ... negotiations upsert ... }` block (`actions.ts:191-214`). `appendStatusHistory`'s `note` is free text — `"Borrower confirmation bypassed — no portal account"` slots directly into `options.note`, matching the exact wording requested.
- **Committee list "no account" badge**: `src/lib/committee/queue.ts:185-190` selects `borrowers ( borrower_no, first_name, last_name, email )` — **does not currently select `user_id`**, needs widening. Detail page (`getApplicationForStaff`, `src/lib/csa/application.ts:72-74`) **already selects `user_id`** — the detail-page badge is nearly free, just render off existing data.
- **Missing data on the approve path**: `executeFinalAction`'s current `.select("id, status, segment")` (`:144`) needs `borrower_id` (or a `borrowers(user_id)` join) added, plus it already fetches a computation id at `:192-197` (needed for the `queueForLra`-equivalent call).

## Scope decision

Two phases: backend (the bypass logic itself) first, then the committee UI indicators (list badge + detail badge) — independently verifiable, UI phase has zero risk to the approval flow itself.

---

## Phase 1 — Backend: automatic bypass on approve

### Files to change

1. **`src/lib/committee/actions.ts`**
   - In `executeFinalAction`'s data fetch (`:144`), widen the select to also fetch `borrower_id` and join `borrowers(user_id)` (or a second small query — match whatever's more consistent with the rest of this file's style).
   - Inside the existing `if (action === "approve")` branch (`:191-214`), after the `negotiations` upsert: if `segment !== "sme"` AND the joined `borrower.user_id` is null, call `queueForLra(supabase, applicationId, computationId, actorId)` (same computation id already resolved earlier in this function at `:192-197` — reuse it, do not re-fetch) **instead of** leaving the application at `"approved"`/`pending_disclosure`. Do not also run the normal disclosure path for this application — the bypass replaces it, it does not run alongside it.
   - Immediately after, add a second `writeAuditEvent` call (mirror the shape of the existing one at `:247-260`) with `action: "execute_trigger"`, `entityType: "loan_applications"`, `afterData: { note: "Borrower confirmation bypassed — no portal account" }` (or fold the note into the same `appendStatusHistory`/`writeAuditEvent` calls `queueForLra` already makes internally — check `queueForLra`'s current `note` text first and either override it or add a second history entry; do not duplicate a queued-for-lra note with conflicting wording).
   - When `segment === "sme"` or the borrower has an account: **no change** — falls through to today's existing disclosure-pending path exactly as before.

### Validation checklist — Phase 1

- [ ] Approving a seafarer application whose borrower has no account (`user_id IS NULL`): status goes straight to `lra_pending`, a `release_queue` row exists, `status_history` has an entry noting the bypass, `audit_events` has a matching row.
- [ ] Approving a seafarer application whose borrower **has** an account: behavior is byte-identical to today (stops at `approved`/`pending_disclosure`, waits for CSA disclosure + borrower confirmation).
- [ ] Approving an **SME** application, regardless of account status: behavior is byte-identical to today (no bypass, even if the borrower has no account).
- [ ] The bypass path never leaves a `negotiations` row stuck at `pending_disclosure` for a bypassed application (confirm its final status is sensible — either `signed` via `queueForLra`'s own update, or explicitly set here if `queueForLra` doesn't touch a negotiation row that also got upserted earlier in this same function).
- [ ] `npx tsc --noEmit` clean.
- [ ] Existing test suite still passes.

### Status: Not Started

---

## Phase 2 — Committee UI: "no account" indicator

### Files to change

1. **`src/lib/committee/queue.ts`** — widen the `borrowers (...)` select at `:185-190` to include `user_id`; add `hasAccount: !!borrower.user_id` (or similar) to `CommitteeQueueItem`'s mapped shape.
2. **Committee list page** — render a small badge/indicator (e.g. "No portal account — auto-routes to LRA on approval") next to rows where `!hasAccount`, before voting. Match existing badge/indicator styling already used on this page — do not invent a new visual pattern.
3. **Committee detail/voting page** (`src/app/committee/applications/[id]/page.tsx`) — `borrower.user_id` is already available via `getApplicationForStaff`; render the same indicator here, visible before the vote/approve action.

### Validation checklist — Phase 2

- [ ] List and detail pages both show the indicator for a no-account borrower, and show nothing (or a neutral "has account" state, matching existing page conventions) otherwise.
- [ ] SME applications: confirm whether the indicator should still show (it's informational either way, but the auto-bypass doesn't apply to SME) — render it consistently, just don't imply auto-routing will happen for SME.
- [ ] `npx tsc --noEmit` clean.
- [ ] Existing test suite still passes.

### Status: Not Started

---

## Final validation

- [ ] Full test suite run — no new failures.
- [ ] Live: approve a seafarer application with no borrower account — confirm it lands in the LRA queue directly, no borrower-portal confirmation step required, audit trail shows the bypass note.
- [ ] Live: approve a seafarer application with a borrower account — confirm the normal flow (disclosure, borrower confirms) is completely unaffected.
- [ ] Live: approve an SME application with no borrower account — confirm no bypass occurs.
- [ ] Live: committee members see the "no account" indicator before voting on an affected application.
