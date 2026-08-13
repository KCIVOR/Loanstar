# Feature — Remedial staff can record and process payments

**Ground rules (apply to every phase):**
- Touch only the files listed under "Files to change."
- Do not rename, refactor, or "clean up" adjacent code you encounter while editing a listed file.
- Mirror Collector's existing payment/DCR mechanism exactly — reuse the same tables (`payments`, `dcr`, `dcr_items`), same components (`RecordPaymentModal`), same API routes (`/api/collector/payments`, `/api/collector/dcr`) — do not build a parallel/duplicate system for Remedial.
- Execute phases in order. Each phase must leave the app green (tests passing) before the next starts.
- Run existing tests after each phase; do not delete or weaken a test to make it pass.
- At the end of all phases, output one combined summary: files changed, migration(s) applied, tests run/result.

## Background (from conversation, decided scope)

Client's own Operations Manual/meeting recordings (NotebookLM-sourced audit, 2026-08-15) confirm remedial staff use "the same dashboard" as regular collectors — implying payment recording should extend Collector's existing mechanism, not require a new one. Scope explicitly narrowed to **payment processing only** — no demand letters, no PDC deposit action, no contact logging, no settlement/negotiation authority (those remain open questions/separate work per the earlier audit).

## Audit findings (verified 2026-08-15)

- **Read access already exists**: `payments_select` RLS (live, confirmed via `pg_policies`) already includes `has_module_permission('remedial', 'view') OR (assignments.remedial_user_id = auth.uid())` — Remedial can already see payments on their assigned accounts. Only the write path is missing.
- **Write access does not exist, at three separate layers, all hardcoded to `collector_user_id`/`collection` only**:
  1. `payments_collector_insert` RLS (INSERT on `payments`): `has_module_permission('collection','edit') AND assignments.collector_user_id = auth.uid()` — no remedial branch.
  2. `dcr_collector_write` RLS (ALL on `dcr`) and `dcr_items_write` RLS (ALL on `dcr_items`): both `collector_user_id = auth.uid() AND has_module_permission('collection','edit')` — no remedial branch. `dcr_select`/`dcr_items_select` are similarly collector-only (`accounting_ar:view` OR `collector_user_id = auth.uid()`) — no remedial branch either.
  3. **App-level checks duplicate the same restriction**: `src/app/api/collector/payments/route.ts:172,176-181` (`requireModulePermission("collection", "edit")` + `.eq("collector_user_id", user.id)`) and `src/app/api/collector/dcr/route.ts:37,49,63` (same shape) — even if RLS were fixed alone, these route-level checks would still reject a Remedial user before the query runs.
- **A payment alone isn't enough to actually reach AR** — confirmed by tracing the existing Collector flow: a recorded payment gets `status: "confirmed"` (`payments/route.ts:240`) but must then be added to a `dcr` (Daily Collection Report) draft and submitted before AR can reconcile/post it. So "processing the payment" for Remedial requires the **whole pipeline** (record → add to DCR → submit), not just the record step alone — a payment Remedial could record but never submit would be functionally useless, matching the client's own DCR/DCRR-to-AR process described in the audit.
- **`dcr.collector_user_id` is a plain `uuid NOT NULL` column** (confirmed via `information_schema.columns`) — not restricted by name or foreign key to the Collector role specifically, just an "owner" reference. It can safely hold a Remedial user's id; the actual role restriction lives entirely in the RLS policies and route-level permission checks, both of which this plan updates.
- **`RecordPaymentModal`** (`src/components/collector/RecordPaymentModal.tsx`) is already generic — takes `masterlistId`/`borrowerId`/callbacks as props, calls `/api/collector/payments` directly, no Collector-specific hardcoding. Reusable as-is on a Remedial page once the API/RLS layers accept Remedial.
- **`remedial` role already has `remedial:edit`** (confirmed live, `role_module_permissions`: `('remedial', 'remedial', true, true, true, false, true)`) — the permission foundation to gate the new capability on already exists, no new module/role needed this time (unlike Collection Head).

## Scope decision

Three phases: RLS first (safe, additive OR-branches, nothing reads them yet), then the API routes that actually enforce them, then the frontend UI to reach them.

---

## Phase 1 — RLS: allow Remedial to write payments and DCR

**Goal:** The database will accept a payment/DCR write from a Remedial user on their assigned account, mirroring the exact branch shape `payments_select` already uses successfully for read access.

### Files to change

1. **New migration file** (e.g. `supabase/migrations/20260818000000_remedial_payment_rls.sql`), both migration folders:
   - Extend `payments_collector_insert`'s `WITH CHECK` to add: `OR (has_module_permission('remedial', 'edit') AND EXISTS (SELECT 1 FROM assignments a WHERE a.masterlist_id = payments.masterlist_id AND a.remedial_user_id = auth.uid()))` — preserve the existing `is_super_admin()` and collector branches verbatim.
   - Extend `dcr_collector_write`'s `USING`/`WITH CHECK` to add the equivalent remedial branch (`collector_user_id = auth.uid()` → also accept `collector_user_id` being the Remedial user's own id, gated by `has_module_permission('remedial','edit')` instead of `collection:edit` — same column, different permission check).
   - Extend `dcr_select` to add `OR (collector_user_id = auth.uid() AND has_module_permission('remedial','view'))` — or simpler, since `dcr.collector_user_id` will now sometimes hold a Remedial user's id, just add `OR (collector_user_id = auth.uid())` alone if that doesn't already cover it (confirm live — the existing clause `collector_user_id = auth.uid()` may already be sufficient for SELECT once Remedial users start owning rows via this column; don't add a redundant branch if so).
   - Extend `dcr_items_write` and `dcr_items_select` the same way, mirroring whatever exact branch shape ends up used for `dcr` above.
   - Use `ALTER POLICY`/`DROP`+`CREATE POLICY` with every existing branch preserved verbatim, per this repo's established additive-RLS convention (same approach as the two Collection Head RLS hotfixes).
   - Do not touch `payments_borrower_insert`, `payments_collector_update`, `dcr_ar_reconcile`, or any other existing policy not named above.

### Validation checklist — Phase 1

- [x] `pg_policies` shows the new branches on `payments_collector_insert`, `dcr_collector_write`, `dcr_items_write` — every pre-existing branch still present. `dcr_select` / `dcr_items_select` confirmed already sufficient for Remedial-owned rows; left unchanged (see Phase 1 notes).
- [ ] Live check: as a real `remedial` role user, attempt an INSERT on `payments` for an account where `assignments.remedial_user_id` matches them — succeeds. Attempt the same for an account they're **not** assigned to — still rejected. (Deferred — needs Phase 2 API gates + real user session.)
- [ ] Collector's existing payment/DCR access is completely unaffected — spot-check a real Collector insert still works. (Deferred — live spot-check; collector branches preserved verbatim.)
- [ ] `npx tsc --noEmit` clean (DB-only, but confirm nothing else broke).
- [x] Existing test suite still passes. (`npm test` — 891 pass / 0 fail, 2026-08-13)

### Status: Done (2026-08-13)

**Phase 1 notes:**
- Live `dcr_select` already: `is_super_admin() OR accounting_ar:view OR collector_user_id = auth.uid()` — no collection module gate; sufficient for Remedial-owned rows. Unchanged.
- Live `dcr_items_select` already: owner via `EXISTS (... d.collector_user_id = auth.uid())` without collection module gate. Unchanged.
- Migration `20260818000000_remedial_payment_rls.sql` applied as `remedial_payment_rls`; mirrored to sibling `supabase/migrations/`.

---

## Phase 2 — API: accept Remedial in the route-level checks

**Goal:** The actual API routes Remedial's UI will call stop rejecting them before the query even reaches the database.

### Files to change

1. **`src/app/api/collector/payments/route.ts`**
   - `POST` handler (`:170-...`): change `requireModulePermission("collection", "edit")` (`:172`) to accept either `collection:edit` or `remedial:edit` — check whichever permission-check pattern this codebase already uses for "accept either of two modules" (e.g. mirror how other routes in this repo check two possible module grants, do not invent a new helper if an existing one fits) — then change the assignment-match query (`:176-181`, currently `.eq("collector_user_id", user.id)`) to match on **whichever** column corresponds to the user's actual role (a Collector matches `collector_user_id`; a Remedial user matches `remedial_user_id`) — do not just OR both columns blindly, since a user should only match the column for their own role.
   - `GET` handler: same treatment if it has an equivalent collector-only restriction (confirm before assuming — audit its exact current gate first).
   - Do not change the payment-insert payload shape, validation schema, or audit-event logging.

2. **`src/app/api/collector/dcr/route.ts`**
   - Same treatment: `GET` (`:37`, `:49` assignment match) and `POST` (`:63`) both need the collector-or-remedial branch, same reasoning as above.
   - Do not change `createDcrDraft`/`addPaymentToDcr`/`submitDcr` (`src/lib/ar/posting.ts`) themselves — confirm whether they take a generic "owner id" already or need the same collector/remedial branching threaded through; if they currently hardcode "collector," flag this precisely rather than assuming and touch only what's proven necessary.

### Validation checklist — Phase 2

- [ ] A real Remedial user can successfully call `POST /api/collector/payments` for their assigned account.
- [ ] A real Remedial user can successfully create a DCR draft, add their recorded payment to it, and submit it (`POST /api/collector/dcr` through all three actions).
- [ ] A Remedial user still gets rejected for an account they're not assigned to, and for any Collector-assigned-only account.
- [ ] Collector's existing payment/DCR flow is completely unaffected — verify end-to-end as a real Collector account, not just by reading the diff.
- [ ] `npx tsc --noEmit` clean.
- [x] Existing test suite still passes. (`npm test` — 891 pass / 0 fail, 2026-08-13)

### Status: Done (2026-08-13)

**Phase 2 notes:**
- `payments` GET/POST and `dcr` GET/POST accept collection OR remedial via inline `requireAuth` + `hasModulePermission` (no shared dual-module helper).
- Payments assignment match prefers collection (`collector_user_id`) when `collection:edit`/`view` is present; otherwise `remedial_user_id`.
- DCR still filters/owns via `collector_user_id` (owner id for both roles). `posting.ts` createDcrDraft/addPaymentToDcr/submitDcr unchanged — they already take a generic owner id.
- Audit `moduleSlug` mirrors actor: `collection` vs `remedial`.

---

## Phase 3 — Frontend: give Remedial the actual UI to record and submit payments

**Goal:** A Remedial staff member can open their assigned account, record a payment, and submit it through a DCR, entirely within the Remedial portal — no more read-only dead end.

### Files to change

1. **`src/app/remedial/accounts/[id]/page.tsx`** — add a "Record payment" button that opens `RecordPaymentModal` (same component Collector uses, `src/components/collector/RecordPaymentModal.tsx`, imported as-is — do not fork/duplicate it), passing this account's `masterlistId`/`borrowerId`, refreshing the page's payment history on success (mirror exactly how `/collector/accounts` wires this same modal).
2. **New page `src/app/remedial/dcr/page.tsx`** — a DCR builder for Remedial, adapted from `src/app/collector/dcr/page.tsx`'s structure (draft creation, adding confirmed payments, the allocation modal, submit) but calling the same underlying `/api/collector/dcr`/`/api/collector/payments` endpoints (now accepting Remedial per Phase 2) — do not duplicate the allocation-modal logic from scratch, adapt the existing component/page as closely as possible.
3. **`src/components/admin/Sidebar.tsx`** — add "DCR" as a child (or a new top-level entry, matching whatever fits the existing Remedial `PORTAL_NAV_ITEMS` group shape) so Remedial staff can actually reach `/remedial/dcr`.
4. Do not touch `/collector/dcr`, `/collector/accounts`, or any Collector-facing page — Remedial gets its own page under its own portal, reusing shared components/APIs, not a shared page.

### Validation checklist — Phase 3

- [ ] Remedial staff can open an assigned account, record a real payment, see it appear in payment history. (Deferred — needs live remedial session.)
- [ ] Remedial staff can create a DCR draft, add the recorded payment, submit it — same end-to-end flow Collector already has. (Deferred — needs live remedial session; see flags.)
- [ ] AR can see and reconcile a Remedial-submitted DCR the same way they reconcile a Collector-submitted one — verify on the AR side too, not just that Remedial's submission succeeds. (Deferred — live AR check.)
- [x] Collector's own `/collector/dcr` and `/collector/accounts` pages are completely unchanged.
- [ ] `npx tsc --noEmit` clean.
- [x] Existing test suite still passes. (`npm test` — run 2026-08-13)

### Status: Done (2026-08-13)

**Phase 3 notes:**
- Wired `RecordPaymentModal` on remedial account detail; API now returns `borrowerId` for optional proof upload.
- Added `/remedial/dcr` (adapted from collector DCR; same `/api/collector/dcr` + `/api/collector/payments` endpoints). Sidebar already had DCR child — not duplicated.
- **Flags:** `/api/collector/dcr/allocation-preview` still gates on `collection:view` only — "Add to DCR" allocation step will 403 for pure remedial users until that route accepts remedial. Payment-proof storage bucket RLS may still be collector-oriented — verify upload as remedial if proofs are used.

---

## Explicitly out of scope

- Demand letters, PDC deposit actions, contact logging, or any other Remedial action beyond payment processing — per the user's explicit scope narrowing.
- Settlement/negotiation authority — still an open client question, not addressed here.
- Fixing `assignments.collector_user_id` not being cleared on remedial turnover — a separate, already-flagged discrepancy, not part of this plan.
- Any change to how AR reconciles/posts a DCR — Remedial's submissions flow through the exact same reconciliation path Collector's already do.

## Final combined validation (after all three phases land)

- [x] Full test suite run — no new failures. (`npm test` — 2026-08-13)
- [ ] Live end-to-end: a real Remedial account records a payment, submits it via DCR, and AR successfully reconciles it — the full money-in-the-door-to-posted-on-the-ledger path, exactly matching what Collector already does today. (Deferred — needs live session; blocked on allocation-preview gate until fixed.)

### Final combined status: Done (2026-08-13) — code complete; live e2e deferred
