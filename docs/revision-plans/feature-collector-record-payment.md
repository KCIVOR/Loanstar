# Feature — Collector can manually record an in-person payment (Item 17)

**Ground rules (apply to every phase, same as every other item in this workflow):**
- Touch only the files listed under "Files to change." If you find a related spot not listed, stop and flag it rather than editing it.
- Do not rename, refactor, or "clean up" adjacent code you encounter while editing a listed file.
- This item needs a migration (Phase 1) — one new RLS policy. Additive only, no table/column changes.
- Run existing tests for the touched area after each phase; do not delete or weaken a test to make it pass.
- Execute phases **in order**. Each phase must leave the app green (tests passing) before the next starts.
- At the end of all phases, output one combined summary: files changed, migration applied, tests run/result, and anything you deliberately left alone that looked related.

## Background (from conversation, decided scope)

This is Item 17 on the System Revision Report tracker ("Collectors can manually record in-person branch payments"). Confirmed live: today, exactly one path creates a `payments` row — the borrower's own "Submit payment proof" form (`LoanActivePanel.tsx`). There is no Collector-facing equivalent. A borrower paying cash/check in person at the branch currently has no way into the system except asking the borrower to separately log in and self-report it afterward.

Decided approach: give Collectors their own "Record payment" action, scoped to accounts assigned to them, reusing the same `payments` table and the same DCR/reconcile pipeline already built for Item 19 — no new tables, no new payment-processing logic. Because a Collector is directly witnessing/recording the payment themselves (unlike a borrower's self-submitted proof, which still needs a Collector's own confirm/reject review), a Collector-recorded payment skips straight to `confirmed` status — there's no one else who needs to "verify" it.

## Audit findings (verified 2026-08-13)

- **No Collector insert path exists**, confirmed live via `pg_policies` on `payments`: the only `INSERT` policy is `payments_borrower_insert`, `WITH CHECK (EXISTS (SELECT 1 FROM borrowers b WHERE b.id = payments.borrower_id AND b.user_id = auth.uid()))` — scoped entirely to the borrower's own row, no Collector clause at all.
- **`payments_select`** already includes a Collector clause (`EXISTS (SELECT 1 FROM assignments a WHERE a.masterlist_id = payments.masterlist_id AND a.collector_user_id = auth.uid())`) — the new insert policy should mirror this exact assignment-based scoping, plus a `has_module_permission('collection', 'edit')` gate (matching `payments_collector_update`'s existing gate).
- **No Collector-side detail page exists** for a single account — `src/app/collector/accounts/page.tsx` is a list page; each row already has action buttons ("Demand letter", "Log contact" — `renderActionButtons`, lines 238-257) that open a modal, not a navigation to a detail page. "Record payment" fits this exact existing pattern — a new modal, not a new page/route.
- **Reference shape to reuse**: the borrower's own creation route, `src/app/api/borrower/applications/[id]/loan/route.ts` `POST` (lines 91-180) — same fields (`referenceNo`, `paymentDate`, `amount`, `channel`, `storagePath`/`fileName`/`mimeType`), same `buildPaymentProofStoragePath`/`isAllowedPaymentProofMime` helpers (`src/lib/payments/proof-storage.ts`) for the optional receipt upload. The Collector version differs only in: (a) which masterlist it's scoped to (Collector picks from their assigned list, not tied to one application's own borrower session), and (b) the resulting status (`confirmed`, not `pending_verification`, since there's no separate reviewer).
- **`src/app/api/collector/payments/route.ts`** currently only exports `GET` (lines 1-115, confirmed in the earlier Item 19 audit) — this is where the new `POST` handler belongs, alongside the existing list/scope logic, not a new file.
- **Downstream is already correct, no changes needed**: once a payment exists with `status: "confirmed"`, it already flows correctly through the existing `scope=dcr` filter in the same route's `GET` (`["confirmed"]`, line ~51) and the DCR builder's "Add to DCR" flow (Item 19's allocation modal) — a Collector-recorded payment needs no special handling anywhere downstream of creation.

## Scope decision

Three phases:
1. **Migration** — new RLS `INSERT` policy on `payments`, scoped to a Collector's assigned accounts.
2. **Backend** — a `POST` handler on the existing `collector/payments` route: validates the Collector is assigned to the target masterlist, inserts the payment as `confirmed` (self-attested — `reviewed_by`/`reviewed_at` set to the recording Collector, same moment).
3. **Frontend** — a "Record payment" action on `/collector/accounts`' row actions, opening a modal with the same fields as the borrower's form, reusing the same upload/validation helpers.

## Audit findings — before finalizing, one gap to flag

Neither `collector/proofs` nor `collector/dcr` currently distinguishes "borrower self-submitted" from "Collector recorded in person" anywhere in the UI — both just show amount/date/reference/channel. Per this conversation's earlier "who performed it" emphasis on the rounding write-off feature, Phase 3 adds a small visible marker (who recorded it) on the Collector's own confirmed-payments list, reusing the same actor-name-resolution pattern already built for that feature — not a hard requirement of Item 17's original wording, but consistent with how this system now handles every other manually-triggered action, and cheap to add alongside the rest of this phase.

---

## Phase 1 — Migration: let a Collector insert a payment for their own assigned accounts

**Goal:** RLS allows a Collector to create a `payments` row only for a masterlist actually assigned to them, mirroring the existing `payments_select`/`payments_collector_update` scoping — not a blanket insert grant.

### Files to change

1. **New migration file** (e.g. `supabase/migrations/20260814010000_payments_collector_insert.sql`):
   ```sql
   CREATE POLICY payments_collector_insert ON public.payments
     FOR INSERT
     WITH CHECK (
       is_super_admin()
       OR (
         has_module_permission('collection', 'edit')
         AND EXISTS (
           SELECT 1 FROM public.assignments a
           WHERE a.masterlist_id = payments.masterlist_id
             AND a.collector_user_id = auth.uid()
         )
       )
     );
   ```
   - Do not modify or drop `payments_borrower_insert`, `payments_select`, or `payments_collector_update` — this is a second, additive `INSERT` policy (Postgres RLS combines multiple permissive policies for the same command with `OR`), not a replacement.
   - **Also add, in the same migration file**, a storage bucket policy — confirmed live via `pg_policies` on `storage.objects` that **no `storage_collector_insert` policy exists at all** today. Collectors currently only have `storage_collector_select` on the `loan-documents` bucket; without an insert policy, the optional receipt upload in Phase 3 would silently fail at the storage layer even with the `payments` table fix above. Add, matching the existing permission-gated style of `storage_ar_insert`/`storage_lra_insert` (not the borrower/agent variants, which restrict to a specific folder — a Collector needs to write into *any* of their assigned borrowers' folders, not just their own):
     ```sql
     CREATE POLICY storage_collector_insert ON storage.objects
       FOR INSERT
       WITH CHECK (
         bucket_id = 'loan-documents'
         AND has_module_permission('collection', 'edit')
       );
     ```
   - Apply via Supabase MCP `apply_migration`.

### Validation checklist — Phase 1

- [x] `payments_collector_insert` exists, scoped to `assignments`-matched masterlists plus `collection` edit permission (or super admin). *(Confirmed live via `pg_policies`.)*
- [x] `storage_collector_insert` exists on `storage.objects`, scoped to the `loan-documents` bucket plus `collection` edit permission. *(Confirmed live via `pg_policies`.)*
- [x] `payments_borrower_insert` and every existing storage policy are untouched. *(Confirmed — only an additive policy was added, nothing dropped/modified.)*
- [x] A Collector attempting to insert a payment for a masterlist **not** assigned to them is still rejected by RLS. *(Enforced by the policy's `EXISTS (... assignments ...)` clause; also independently re-checked at the application layer in Phase 2.)*
- [x] `npx tsc --noEmit` clean.

### Status: Done (2026-08-13)

---

## Phase 2 — Backend: the record-payment endpoint

**Goal:** A Collector can create a fully-confirmed payment for one of their assigned accounts, with the same validation rigor as the borrower's own submission path.

### Files to change

1. **`src/app/api/collector/payments/route.ts`**
   - Add a request schema for the new action, e.g.:
     ```ts
     const recordSchema = z.object({
       masterlistId: z.string().uuid(),
       referenceNo: z.string().optional(),
       paymentDate: z.string().min(1),
       amount: z.number().positive(),
       channel: z.enum(["bank_deposit", "check", "pos_cash"]),
       storagePath: z.string().optional(),
       fileName: z.string().optional(),
       mimeType: z.string().optional(),
     });
     ```
   - Add `export async function POST(request: Request)`:
     - `requireModulePermission("collection", "edit")`.
     - Parse/validate the body against `recordSchema`.
     - Confirm the Collector is assigned to `masterlistId` (`select ... from assignments where masterlist_id = ... and collector_user_id = user.id`) — throw a clear 403/400 if not (defense in depth alongside the RLS policy from Phase 1, matching this codebase's existing convention of checking ownership in application code even when RLS also enforces it, e.g. `addPaymentToDcr`'s DCR-ownership check).
     - Look up the masterlist's `loan_application_id`/`borrower_id` (needed to populate the `payments` row — the borrower form derives these from the application; here they come from the masterlist row instead).
     - If `storagePath`/`fileName` provided, reuse `assertPaymentProofPathOwnedByBorrower(storagePath, borrowerId)` and `isAllowedPaymentProofMime(mimeType)` **exactly as the borrower route does, unmodified** (`src/lib/payments/proof-storage.ts`) — re-read this file: despite its name, `assertPaymentProofPathOwnedByBorrower` only checks that the path is prefixed `${borrowerId}/payments/` (a path-traversal/folder-scoping guard), it does not check *who uploaded it* — so passing the target borrower's id (resolved from the masterlist, not the Collector's own id) works correctly with no changes to that function. The frontend must call `buildPaymentProofStoragePath(borrowerId, ...)` with that same target borrower's id when building the path before uploading (see Phase 3).
     - Insert into `payments`: `masterlist_id`, `loan_application_id`, `borrower_id`, `reference_no`, `payment_date`, `amount`, `channel`, `storage_path`, `file_name`, `status: "confirmed"`, `uploaded_by: user.id`, `reviewed_by: user.id`, `reviewed_at: now`.
     - Write an audit event (`moduleSlug: "collection"`, `action: "create"`, `entityType: "payment"`, matching the borrower route's own audit-event shape).
     - Return the created row via `jsonOk`.
   - Do not touch the existing `GET` handler.

### Validation checklist — Phase 2

- [x] A Collector can create a `confirmed` payment for a masterlist assigned to them; the row has `uploaded_by`/`reviewed_by` both set to the recording Collector, `reviewed_at` set at creation. *(Verified live: recorded a real test payment as the Collector seed user, confirmed status and attribution.)*
- [x] A Collector attempting this for a masterlist **not** assigned to them is rejected with a clear error. *(Confirmed by direct code read — `assignments` lookup with a thrown `ForbiddenError` before any insert.)*
- [x] The created payment immediately appears in `GET /api/collector/payments?scope=dcr` (the "Confirmed, awaiting DCR" bucket). *(Verified live — appeared instantly in `/collector/proofs`' "Confirmed, awaiting DCR" section with "Add via DCR" available.)*
- [x] `npx tsc --noEmit` clean.
- [x] Existing tests for this route still pass (882/882, no route-specific test file existed before or after).

### Status: Done (2026-08-13)

---

## Phase 3 — Frontend: the "Record payment" action

**Goal:** A Collector can record an in-person payment directly from their accounts list, using the same familiar fields as the borrower's own form, with the recording Collector's identity visible afterward.

### Files to change

1. **New: `src/components/collector/RecordPaymentModal.tsx`**
   - Confirmed live (`DemandLetterModal.tsx:1-34`, `ContactLogModal.tsx`) that this codebase's convention for a Collector row-action modal is a **dedicated standalone component file** under `src/components/collector/`, built entirely from the shared `@/components/ui` kit — `"use client"`, props shape `{ open, borrowerName, masterlistId, onClose }` (add whatever this modal additionally needs, e.g. a success callback to trigger the accounts list refresh) — not inline JSX added directly to `page.tsx`, and no ad hoc/custom CSS.
   - Build the form using the exact same `@/components/ui` primitives `LoanActivePanel.tsx`'s "Submit payment proof" form already uses: `Modal`, `Input`, `Label`, `Select`, `Button`, `FileDropzone`, `Alert` for errors — same fields (Amount, Payment date, Reference no., Channel, optional receipt), same labels/copy, so a Collector recording a payment sees a form that looks and behaves identically to the one the borrower already knows, just relocated. Do not introduce new component primitives or styling — everything needed already exists in `@/components/ui`.
   - Reuse `buildPaymentProofStoragePath`/`isAllowedPaymentProofMime` from `@/lib/payments/proof-storage` exactly as `LoanActivePanel.tsx` does for the optional upload. When building the upload path, call `buildPaymentProofStoragePath(borrowerId, ...)` with the **target borrower's** id (passed into this component as a prop from the row, alongside `masterlistId`/`borrowerName` — confirm the exact field name already available on `CollectorQueueMappedRow`, e.g. `acc.borrowerId`), not the logged-in Collector's own id, so it lands in the correct borrower's folder and passes Phase 2's `assertPaymentProofPathOwnedByBorrower` check unmodified.
   - On submit, `POST /api/collector/payments` with the body shaped per Phase 2's `recordSchema`.

2. **`src/app/collector/accounts/page.tsx`**
   - `renderActionButtons` (lines 238-257): add a third `Button`, "Record payment", alongside "Demand letter"/"Log contact" — same `variant`/`size` as those two, matching the existing row's visual rhythm exactly (don't introduce a different button style for the new one).
   - Add a `recordPaymentModalFor` state, mirroring `demandModalFor`/`contactModalFor`'s exact existing pattern (lines 158-160), and render `<RecordPaymentModal ... />` alongside the existing `<DemandLetterModal>`/`<ContactLogModal>` renders (lines 665-682), same conditional-render style.
   - Confirmed live: this page has **no toast/success-message system** — `DemandLetterModal` just closes via `onClose`; `ContactLogModal` additionally takes a separate `onLogged={() => void load()}` callback prop (lines 665-672) that refreshes the accounts list on success. `RecordPaymentModal` should follow `ContactLogModal`'s exact pattern — a dedicated `onRecorded={() => void load()}`-style prop, called on success alongside `onClose`, not a new message/toast mechanism.
   - Do not touch the "Demand letter" or "Log contact" modals themselves, the table's other columns, filters, sort, or pagination.

2. **`src/app/collector/proofs/page.tsx`**
   - In the "Confirmed, awaiting DCR" section, add a small visible indicator of who recorded a Collector-recorded payment (vs. a borrower-submitted one) — resolve `uploaded_by` to a name the same way the AR rounding-write-off feature already does (`src/app/api/ar/masterlist/[id]/route.ts`'s `nameById` pattern) and surface it as a small label, e.g. "Recorded by <name>" only when it differs from a plain borrower submission (or simply always show "Recorded by <name>" for consistency — pick whichever keeps this phase's diff smallest without hiding the information).
   - Do not touch the Confirm/Reject actions, the "Pending review" section, or any other part of this page.

### Validation checklist — Phase 3

- [x] "Record payment" button appears on every row in `/collector/accounts`, opens a modal with the same fields as the borrower's form. *(Verified live — clicked it, modal opened with Amount/Payment date/Reference/Channel/receipt upload.)*
- [x] Submitting creates a `confirmed` payment visible in `/collector/proofs`' "Confirmed, awaiting DCR" section immediately, with the recording Collector's name shown. *(Verified live: "John Reyes · TEST-COLLECTOR-RECORD-001 · Aug 13, 2026 · 5,000.00 · confirmed · Recorded by Collector (Seed)".)*
- [x] The new payment can be added to a DCR exactly like any other confirmed payment, with no special-casing needed. *(Confirmed — "Add via DCR" action present on the row, same as any other confirmed payment.)*
- [x] `npx tsc --noEmit` clean.
- [x] Manual/API check on a live Collector-assigned account: record a payment, confirm it appears correctly. *(Done live end-to-end as above; test row cleaned up afterward via direct SQL delete. Did not carry it through DCR submission/AR reconciliation — that path is unmodified from Item 19 and already validated then; re-confirming it here would be redundant, not additional coverage.)*

### Status: Done (2026-08-13)

---

## Explicitly out of scope for this feature

- Any change to Item 16's broader question (whether borrowers should be restricted from self-submitting at all) — this feature adds a Collector path *alongside* the existing borrower path, doesn't remove or gate the borrower one.
- Any change to `reconcileAndPostDcr`, `computeAutoAllocation`, or the DCR/allocation pipeline itself (Item 19) — a Collector-recorded payment flows through the exact same unmodified pipeline.
- Any change to how AR reconciles or how the rounding write-off feature works.
- Requiring a second-person review of a Collector-recorded payment — deliberately skipped, since the Collector is the direct witness; adding a review step here would be redundant, not safer.

## Final combined validation (after all three phases land)

- [x] Full test suite run — no new failures (882/882, independently confirmed).
- [x] Manual walk-through on a live account: Collector recorded a real in-person payment through the actual UI, confirmed it showed correctly with their name attached and ready for DCR — verified end to end, test data cleaned up afterward.

## Status: Done (2026-08-13)
