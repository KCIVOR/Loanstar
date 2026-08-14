# Feature — Required Reference/Transaction No. on payments + ledger column (Revision Tracker 2, Item 8)

**Ground rules:**
- Touch only the files listed under "Files to change." If you find a related spot not listed, stop and flag it rather than editing it.
- Do not touch the DCR/reconciliation posting logic itself (`src/lib/ar/posting.ts`) beyond what's explicitly listed — this feature is about capturing and locking a field, not changing how postings are computed.
- The lock (Phase 3) must not block Super Admin — every RLS change mirrors the existing `is_super_admin() OR (...)` pattern already used elsewhere in this codebase.
- Run existing tests after each phase; do not weaken a test to make it pass.
- Output a summary at the end: files changed, migration(s), tests run/result.

## Background

Revision Tracker 2, Item 8: when a borrower makes a payment, collectors and AR need to record the bank reference/receipt number alongside it, for cross-referencing against bank records and submitted proofs. Required at posting — can't post without it. Free text, no format enforced. Shown as a ledger column and in the borrower portal's payment history. Locked after AR confirms — correction requires Super Admin.

## Audit findings (verified 2026-08-14) — one premise correction

- **The column already exists**, so this is a validation + visibility + locking feature, not a new-field feature. `payments.reference_no text` (nullable, no format constraint) — confirmed live in the schema. Server zod schema (`src/app/api/collector/payments/route.ts:41`) already has `referenceNo: z.string().optional()` — **currently optional, not required.**
- **"Used by both Collector and AR" doesn't literally match how the app works today — corrected here rather than silently built wrong.** The single payment-entry form, `src/components/collector/RecordPaymentModal.tsx`, is shared by Collector and Remedial only (confirmed used in `src/app/collector/accounts/page.tsx` and `src/app/remedial/accounts/[id]/page.tsx`) — **AR has no equivalent manual payment-entry form.** AR's role is to reconcile/post payments that Collector/Remedial already recorded, via a DCR (Daily Collection Report) batch workflow (`src/lib/ar/posting.ts`) — AR doesn't create a new payment row with its own reference number, it acts on existing ones. Confirmed AR's DCR reconciliation view already reads and displays `reference_no` per line (`src/app/ar/dcr/page.tsx:45,660` — `item.payments?.reference_no ?? "—"`), so **AR already has visibility into the reference number at posting time** — the real gap is just making sure it's never blank by the time AR sees it, which means enforcing "required" at the point Collector/Remedial actually records the payment, not building a second AR-side entry form that doesn't otherwise exist in this app's design.
- **Field currently in the modal, but optional**: `RecordPaymentModal.tsx:218-224` — `<Label>Reference no.</Label>` (no `required` prop), `placeholder="Optional"`; payload builder (`:92,101`) turns an empty string into `undefined` so nothing blocks submission.
- **Ledger column — genuinely missing today.** Reference number currently only appears inline in the *payment-history timeline*, never as a column on the amortization *ledger* table itself — confirmed in both places the spec asks for: borrower portal (`src/components/borrower/LoanActivePanel.tsx:355-363`, ledger table columns are `#, Due date, Payment date, Amortization, Balance, Status` — no ref column; history timeline at `:542` shows it inline) and AR's account view (`src/app/ar/masterlist/[id]/page.tsx:790-798`, same gap, same inline-only pattern at `:923-925`). A real column needs adding to both ledger tables.
- **"Locked after AR confirms, Super Admin can correct" — genuinely unenforced today, confirmed gap.** `payments_collector_update` RLS (live-confirmed) has **no status gate at all**: `is_super_admin() OR has_module_permission('collection','edit') OR has_module_permission('accounting_ar','edit')` on both `USING` and `WITH CHECK` — any user with either permission can update *any* payment row regardless of `status` (`pending_verification`/`confirmed`/`rejected`/`posted`). Exact precedent to mirror for the fix: `committee_votes_update` (`supabase/migrations/20260811025455_committee_votes_update_policy.sql:7-31`) — `is_super_admin() OR (has_module_permission('committee','edit') AND ... status = 'for_approval')` — same shape, gate on `payments.status`.

## Scope decision

Three phases: require-at-entry (small, client+server), the ledger column (UI-only, two files), then the post-confirmation lock (RLS + migration, the only phase touching security).

---

## Phase 1 — Require the field at entry

### Files to change

1. **`src/components/collector/RecordPaymentModal.tsx`** — add `required` to the Reference no. `<Label>` (`:218`), change placeholder from `"Optional"` to something indicating it's required, and add it to the existing pre-submit validation block (mirror the amount/date required-check already at `:84-86`) so submission is blocked client-side on an empty value, not just server-side.
2. **`src/app/api/collector/payments/route.ts`** — change `referenceNo: z.string().optional()` (`:41`) to `z.string().trim().min(1, "Reference number is required")`. Confirm this is the only server-side entry point for collector/remedial-recorded payments (grep for any other route inserting into `payments` with a `reference_no` field before assuming) — if a second entry point exists, it needs the same tightening, add it to this file list.

### Validation checklist — Phase 1

- [ ] Recording a payment via the modal with an empty reference number is blocked client-side before any request fires.
- [ ] Submitting the API directly with an empty/missing `referenceNo` is rejected with a 400, no payment row created.
- [ ] Recording a payment with a real reference number works exactly as before.
- [ ] Remedial's use of the same modal (confirmed shared component) picks up the same requirement automatically — no separate change needed there.
- [ ] `npx tsc --noEmit` clean.
- [ ] Existing test suite still passes.

### Status: Done

---

## Phase 2 — Ledger column (borrower portal + AR account view)

### Files to change

1. **`src/components/borrower/LoanActivePanel.tsx`** — add a "Reference No." column to the amortization ledger `<Table>` (`:355-363` area). Each installment row needs to resolve to the payment(s) that covered it — check how the existing payment-history timeline (`:542`) already associates a `reference_no` with an installment/payment and reuse that same association, don't invent a new lookup. If an installment has multiple partial payments, decide a sensible display (e.g. comma-joined reference numbers) — pick one deliberately, don't leave it undefined.
2. **`src/app/ar/masterlist/[id]/page.tsx`** — same column addition to the AR-side ledger table (`:790-798` area), same association-reuse approach from the existing payment-history section (`:923-925`).

### Validation checklist — Phase 2

- [ ] Both ledger tables show a Reference No. column with real data for installments that have a payment recorded against them.
- [ ] Installments with no payment yet show a sensible empty state (matching however other empty-state ledger cells already render in these tables — mirror existing convention).
- [ ] `npx tsc --noEmit` clean.
- [ ] Existing test suite still passes.

### Status: Done

---

## Phase 3 — Lock after AR confirms

### Files to change

1. **New migration file**, applied via Supabase MCP `apply_migration` to both migration folders — replace `payments_collector_update`'s `USING`/`WITH CHECK` (confirm the exact current live clause via `pg_policies` first, then extend it, do not guess) to add a status gate on the non-super-admin branches, mirroring `committee_votes_update`'s shape:
   ```sql
   ALTER POLICY payments_collector_update ON public.payments
     USING (
       is_super_admin()
       OR (has_module_permission('collection','edit') AND status NOT IN ('confirmed','posted'))
       OR (has_module_permission('accounting_ar','edit') AND status NOT IN ('confirmed','posted'))
     )
     WITH CHECK (
       is_super_admin()
       OR (has_module_permission('collection','edit') AND status NOT IN ('confirmed','posted'))
       OR (has_module_permission('accounting_ar','edit') AND status NOT IN ('confirmed','posted'))
     );
   ```
   If `ALTER POLICY` isn't supported for this change in this Postgres version, use `DROP POLICY` + `CREATE POLICY payments_collector_update` with the identical name. **Do not weaken this to allow editing any other field once `confirmed`/`posted`** — this policy governs the whole row, so this change locks the entire payment record after confirmation, not just `reference_no`. Confirm this row-level (not column-level) lock is acceptable for the feature's intent before implementing — if the client actually wants only `reference_no` specifically locked while other fields stay editable post-confirmation, that needs a different, more surgical mechanism (a trigger or app-level field-rule check) instead of tightening this RLS policy, since RLS can't do column-level locking. Default to the row-level lock (simpler, matches the existing codebase's security model) unless this distinction matters and is flagged back before implementing.
2. **`src/app/api/collector/payments/[id]/route.ts`** (if a PATCH/edit route exists here — confirm first) — if there's an app-level edit path for `reference_no` specifically, it inherits the RLS gate automatically; no code change needed unless the app layer has its own status check that would need loosening/tightening to match.

### Validation checklist — Phase 3

- [ ] A payment with `status = 'pending_verification'` can still be edited by Collector/AR as before.
- [ ] A payment with `status = 'confirmed'` or `'posted'` can no longer be edited by Collector/AR (RLS rejects the write).
- [ ] Super Admin can still edit a confirmed/posted payment (the escape hatch works).
- [ ] `npx tsc --noEmit` clean.
- [ ] Existing test suite still passes.

### Status: Done

**Implementation note (Phase 3):** The plan's literal `WITH CHECK (... status NOT IN ('confirmed','posted'))` would block DCR submit (`pending`→`confirmed`) and AR reconcile (`confirmed`→`posted`). Applied policy instead gates status on `USING` only: collectors cannot touch confirmed/posted; AR cannot touch posted (but can still post confirmed); `WITH CHECK` remains permission-only; Super Admin unrestricted.

---

## Final validation

- [x] Full test suite run — no new failures (903/903, re-run independently, 2026-08-14).
- [x] Code-level validation: all 3 phases diffed directly against the plan. `RecordPaymentModal.tsx` + API zod tightening matches exactly, including an unprompted copy update to the informational alert text. The ledger-column additions on both the borrower and AR pages reuse the existing `postings` association mechanism (mirroring `paymentDatesByScheduleId`) and dedupe/comma-join multiple reference numbers as specified.
- [x] RLS deviation independently verified as correct, not a weakening: live-queried the actual policy — `USING` now excludes collectors from confirmed/posted rows and AR from posted rows (AR can still act on confirmed, needed for the confirm→post transition itself); `WITH CHECK` deliberately left permission-only, matching its pre-existing shape. Confirmed the plan's literal instruction (status-gating `WITH CHECK` too) would have been self-defeating — the confirm/post transitions are themselves UPDATEs whose *resulting* row has the now-forbidden status, so that would have blocked the very actions meant to reach that state.
- [x] **Real gap surfaced, not silently resolved either way**: found a third payment-creation entry point my original audit missed — `src/app/api/borrower/applications/[id]/loan/route.ts` POST (the borrower's own self-service proof-of-payment submission), which still has `referenceNo` optional. Cursor correctly flagged rather than unilaterally tightened or ignored it. Worth noting: the client's original request text specifically says *"collectors recording payment on behalf of a borrower"* — it doesn't mention the borrower's own direct submission, so this may not actually be in scope rather than being a missed requirement. Needs a decision from the user/client, not a default assumption either way.
- [ ] Live click-through: record a payment with/without a reference number, confirm it shows on both ledgers, confirm the lock behavior after AR posts. Not yet done by Claude — left for the user.
