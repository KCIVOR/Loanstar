# CSA Witness-Sign Computation — Implementation Plan

**Created:** 2026-08-18 · **Source:** Live E2E test run hit the blocker directly — CSA intake stuck at "Signed computation required" for a walk-in application with no borrower account (`borrowers.user_id = NULL`), traced to `src/lib/csa/application.ts:223-224` gating `signedComputationPresent` on `computations.signed_at`, which only `src/app/api/borrower/applications/[id]/computation/route.ts` (portal-only, requires `borrower.user_id === session.user.id`) can ever write.
**Mode:** SURGICAL — smallest change that closes the gap. No refactors, no renames, no touching unrelated files.
**Scope:** One new CSA-side "witness-sign" action for the computation, usable **regardless of account status** — not just a walk-in fallback, but a faster in-branch path any time the borrower is physically present and approves.

---

## Problem recap

`computations.signed_at` is the single gate for two things:
1. CSA's "Endorse to CIG" button (intake stage, before any negotiation exists).
2. `queueForLra()` — the only entry point into the LRA release queue (post-Committee-approval/disclosure stage, when `negotiations.status === "awaiting_signature"`).

Right now the **only** code path that can set `signed_at` is the borrower-portal endpoint. There is no staff-side equivalent, so any application without a linked borrower account stalls at whichever of the two checkpoints it reaches first.

## Design decision

Mirror the pattern that already exists and works for LRA's release-document signing (`witnessSignGeneratedDocument` in `src/lib/lra/release-service.ts:477-559`):
- `signed_by` keeps meaning **"the borrower"** — populated from `borrowers.user_id` if it exists, `null` if it doesn't. Never put the CSA staffer's id here.
- A new `witnessed_by` column records **which staffer** performed the in-branch witness action — exact same field name and semantics as `generated_documents.witnessed_by` (plain `uuid`, no FK — confirmed that column has no FK constraint either, so this isn't a new pattern).
- One action serves **both** checkpoints (intake-stage first signature, and post-disclosure signature), because both currently flow through the same borrower endpoint and the same `computations.signed_at` field — no need for two separate actions.

---

## Phase 1 — Migration

**File:** new `supabase/migrations/<timestamp>_computation_witness_sign.sql`

```sql
alter table computations add column witnessed_by uuid null;
```

Apply via Supabase MCP `apply_migration` (project convention — not `supabase db push`; confirmed project ref `acopcwlhkovssjnrqygk` matches `.env.local`).

**Verify:** `select column_name from information_schema.columns where table_name = 'computations' and column_name = 'witnessed_by';` returns one row.

---

## Phase 2 — Service function

**File:** `src/lib/csa/computation.ts` (colocate with existing CSA computation helpers — `getActiveComputation`/`persistComputation` already live here)

Add `witnessSignComputation(supabase, applicationId, witnessedById)`. Mirror the borrower POST handler's logic exactly (`src/app/api/borrower/applications/[id]/computation/route.ts:91-186`), with these changes:

1. Load negotiation via `getNegotiation`.
2. If negotiation exists and `status !== "awaiting_signature"`, throw the same error ("Approved terms must be disclosed before you can sign") — **unless negotiation is `null`** (intake-stage first signature, no negotiation row yet). Same branch structure as the existing route.
3. Load active computation via `getActiveComputation`; throw if none.
4. Copy the existing stale-signature-clear edge case verbatim (route lines 115-137: if already signed but negotiation just re-entered `awaiting_signature`, clear and re-sign; if signed and not in that state, reject as already-signed).
5. Compute `signatureHash` identically (`sha256` of `JSON.stringify(computation)`).
6. Resolve the borrower's `user_id` for `signed_by` — fetch it from `loan_applications.borrowers.user_id` the same way `witnessSignGeneratedDocument` does (`release-service.ts:507-514`). Do **not** write the staffer's id here.
7. Update `computations`: `signed_at`, `signed_by` (borrower's `user_id` or `null`), `witnessed_by = witnessedById`, `signature_hash`.
8. If negotiation exists and `status === "awaiting_signature"`: call `queueForLra(supabase, applicationId, computation.id, witnessedById, "CSA witness-signed computation in-branch — queued for LRA")`.
   - **Deliberately skip `logAcceptance`/`logOfferMessage` for this path.** `negotiation_messages.author_role` has a DB check constraint allowing only `'borrower'|'committee'` (confirmed live) — adding a third value is out of scope for this fix. The acceptance is still fully captured by `computations.witnessed_by`, the audit event (next step), and `appendStatusHistory`'s free-text note inside `queueForLra`.
9. Write an audit event matching the LRA witness-sign route's shape: `writeAuditEvent({ actorId: witnessedById, moduleSlug: "computation", action: "execute_trigger", entityType: "computation", entityId: computation.id, afterData: { applicationId, signatureHash, trigger: "csa_witness_sign_computation" } })`.

Return `{ signedAt, witnessedBy: witnessedById }`.

**Also:** add `witnessedBy: row.witnessed_by as string | null` to the `getActiveComputation` mapper (same file, next to the existing `signedAt: row.signed_at` mapping) so callers can read it.

---

## Phase 3 — API route

**New file:** `src/app/api/csa/applications/[id]/computation/witness-sign/route.ts`

- `POST` only. Body: `{ confirm: true }` (reuse the existing `z.object({ confirm: z.literal(true) })` pattern from the borrower route / LRA sign route).
- `requireModulePermission("computation", "execute_trigger")`. **No permission-seed change needed** — confirmed live in `role_module_permissions`: the CSA role already has `can_execute_trigger = true` on the `computation` module (Committee and CIG do not; Borrower does not — so this naturally stays CSA-only without extra config).
- Calls `witnessSignComputation` from Phase 2.
- Returns `jsonOk({ signedAt, witnessedBy })`.

Structure this route identically to `src/app/api/lra/applications/[id]/documents/[docId]/sign/route.ts` (zod parse → service call → audit event → response), since it's the closest existing precedent.

---

## Phase 4 — UI

**File:** `src/components/csa/ComputationPanel.tsx`

- Near line 430 (`{computation.signedAt ? "Signed by borrower" : "Awaiting signature"}`):
  - Add a **"Witness-sign (borrower approved in-branch)"** button, shown whenever `!computation.signedAt`. **Not conditional on account presence** — CSA should be able to use this any time the borrower is physically at the branch, whether or not they have a portal account, per the actual ask.
  - Clicking opens a lightweight confirm step (e.g. a `confirm()` dialog or small modal: "Confirm the borrower reviewed and approved this computation in person") before calling `POST .../computation/witness-sign`.
  - On success, refetch/update local state so the status line reflects the new `witnessedBy`.
- Update the status line itself: if `computation.witnessedBy` is set, show something like **"Signed in-branch (witnessed by staff)"** instead of "Signed by borrower" — keep these visually distinguishable so anyone reviewing the file later can tell a portal self-sign from a staff witness-sign at a glance.
- Thread `witnessedBy` through whatever fetch already populates this panel (the CSA computation GET route + its type) so the field is available to render.

---

## Explicitly NOT in scope for this fix

- The counter-offer bypass (`recordCounterOffer`'s `counterBy: "csa"` branch in `src/lib/negotiation/service.ts:253-303` is currently unreachable dead code — no route calls it, and even if called it silently skips logging a negotiation message rather than crashing). Separate gap, separate fix — do not touch here.
- Any "invite borrower to register" / magic-link mechanism. Separate gap.
- Widening the `negotiation_messages.author_role` check constraint. Deliberately avoided per Phase 2 step 8 — revisit only if a future fix needs the negotiation message timeline to show CSA-witnessed acceptances explicitly.

## Verify (end of implementation)

1. `npm run build` passes (server/client boundary check — this codebase has broken on this before).
2. Manual walkthrough with a **walk-in** application (no borrower account): CSA generates computation → clicks witness-sign → "Signed computation required" clears on the Endorse-to-CIG panel → endorse succeeds.
3. Same application, later: after Committee approval + CSA disclosure (`negotiations.status = "awaiting_signature"`), CSA witness-signs again → confirm a row appears in `release_queue` and `loan_applications` status history shows `lra_pending`.
4. Confirm the **existing borrower-portal self-sign flow is untouched** — test with an account-linked borrower signing normally through `/borrower/applications/[id]`, verify `signed_by` is their own `user_id` and `witnessed_by` stays `null`.
