# Feature — AR-triggered rounding write-off (Item 13)

**Ground rules (apply to every phase, same as every other item in this workflow):**
- Touch only the files listed under "Files to change." If you find a related spot not listed, stop and flag it rather than editing it.
- Do not rename, refactor, or "clean up" adjacent code you encounter while editing a listed file.
- This item needs a migration (Phase 1) — one new table, one new seeded `config_settings` row. Additive only.
- Run existing tests for the touched area after each phase; do not delete or weaken a test to make it pass.
- Execute phases **in order**. Each phase must leave the app green (tests passing) before the next starts.
- At the end of all phases, output one combined summary: files changed, migration applied, tests run/result, and anything you deliberately left alone that looked related.

## Background (from conversation, decided scope)

This is Item 13 on the System Revision Report tracker ("Fix rounding bug — checks must sum to the exact loan balance instead of repeating the same rounded amount"). Confirmed live on a real account: 3 equal installments of ₱159,587.33 sum to ₱478,761.99, one centavo short of the actual ₱478,762.00 loan total — the last installment gets stuck showing `partial` with a phantom ₱0.01 balance forever.

Client's real-world accounting process (relayed by the user): don't engineer the math to be perfect — when a small rounding difference like this shows up, accounting manually cleans it up and posts it to a **Rounding / Write-Off** account.

Decided implementation approach (this conversation):
- **Manual, AR-triggered** — not automatic. AR sees the stray amount and clicks a "Write off" button themselves, same as their real process today.
- The write-off must be **logged**: the amount, which installment/account, and **who performed it** — a real audit trail, not just a silent number change.
- Only usable for genuinely small amounts — a configurable threshold (mirroring how `penalty_rate`/`aging_thresholds` are already configurable via `config_settings` and the admin config page) caps what AR can write off this way, so it can't be used to quietly erase a real, large unpaid balance.

## Audit findings (verified 2026-08-13)

- **The bug's exact shape**, confirmed live via SQL on a real account: `amortization_schedules` rows each carry `amount_due`/`penalty_amount`/`amount_paid`; when a payment posts (`src/lib/ar/posting.ts`, `reconcileAndPostDcr`), an installment only becomes `status: "paid"` when `amount_paid >= amount_due + penalty_amount` exactly (no tolerance) — a 1-centavo shortfall leaves it `partial` forever, with no existing mechanism to close it.
- **No existing write-off/rounding concept anywhere in the codebase** — confirmed via full-repo search (`write.?off|writeoff|rounding`, case-insensitive): zero hits relevant to accounting write-offs.
- **`config_settings` pattern to reuse** (`src/app/api/admin/config/route.ts`): existing keys like `penalty_rate` are read via a small helper (`getPenaltyRate`, `src/lib/ar/posting.ts:144-161`) and are editable through `CONFIG_KEYS`/`patchConfigSchema`/the admin config page — the new `rounding_writeoff_threshold` key follows the exact same shape.
- **RLS pattern to mirror**, confirmed live via `pg_policies`: `penalties` (a similar AR-only ledger-adjustment table) has `penalties_select` (readable by `accounting_ar`/`collection`/`remedial` view permission) and `penalties_write` (writable only by `accounting_ar` edit permission, plus super admin) — the new `rounding_writeoffs` table should use the identical predicate shape.
- **Where the button belongs**: `src/app/ar/masterlist/[id]/page.tsx`'s "Amortization ledger" table (lines 643-745, per the earlier Item 18 work) — each row already has `status` and enough data (`amount_due`, `penalty_amount` via `row`, though `penalty_amount` isn't currently in the fetched `ScheduleRow` type — needs adding) to determine if a row is a small-remainder candidate.

## Scope decision

Three phases:
1. **Migration** — new `rounding_writeoffs` table (audit log: amount, which installment/account, who, when, optional note) + a new `rounding_writeoff_threshold` config key (default ₱1.00, admin-editable).
2. **Backend** — a `writeOffRoundingDifference` function that validates the remaining amount is genuinely small (≤ threshold) before allowing it, closes the installment to `paid`, updates the masterlist balance, and records the write-off; a new AR-only API route to trigger it.
3. **Frontend** — a "Write off" button on the Amortization ledger, visible only on rows with a small enough remaining balance, gated behind a confirm dialog that states the amount and that it will be logged under the acting AR user's name; a small "Rounding write-offs" list on the same page showing what's been written off, by whom, and when — so the log the user asked for is actually visible, not just sitting in a database table.

---

## Phase 1 — Migration: the write-off log + configurable threshold

**Goal:** A place to record every rounding write-off (amount, account, installment, actor, timestamp) and a configurable ceiling on what counts as "small enough."

### Files to change

1. **New migration file** (e.g. `supabase/migrations/20260814000000_rounding_writeoffs.sql`):
   ```sql
   CREATE TABLE public.rounding_writeoffs (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     masterlist_id uuid NOT NULL REFERENCES public.masterlist(id) ON DELETE CASCADE,
     amortization_schedule_id uuid REFERENCES public.amortization_schedules(id) ON DELETE SET NULL,
     amount numeric(14,2) NOT NULL,
     performed_by uuid NOT NULL REFERENCES auth.users(id),
     performed_at timestamptz NOT NULL DEFAULT now(),
     notes text
   );

   CREATE INDEX idx_rounding_writeoffs_masterlist ON public.rounding_writeoffs(masterlist_id);
   CREATE INDEX idx_rounding_writeoffs_schedule ON public.rounding_writeoffs(amortization_schedule_id);

   ALTER TABLE public.rounding_writeoffs ENABLE ROW LEVEL SECURITY;

   CREATE POLICY rounding_writeoffs_select ON public.rounding_writeoffs
     FOR SELECT USING (
       is_super_admin()
       OR has_module_permission('accounting_ar', 'view')
       OR has_module_permission('collection', 'view')
       OR has_module_permission('remedial', 'view')
     );

   CREATE POLICY rounding_writeoffs_write ON public.rounding_writeoffs
     FOR ALL USING (
       is_super_admin()
       OR has_module_permission('accounting_ar', 'edit')
     );

   INSERT INTO public.config_settings (key, value, description)
   VALUES (
     'rounding_writeoff_threshold',
     '1.00'::jsonb,
     'Maximum remaining balance (₱) AR can write off as a rounding difference instead of posting a normal payment.'
   )
   ON CONFLICT (key) DO NOTHING;
   ```
   - Match this repo's actual `config_settings` column shape and existing seed-row style exactly — read one or two existing seed migrations for this table first (e.g. wherever `penalty_rate` was originally seeded) and mirror the exact `INSERT`/conflict-handling pattern rather than inventing a new one.
   - Apply via Supabase MCP `apply_migration`, per this repo's established convention.

2. **`src/app/api/admin/config/route.ts`**
   - Add `"rounding_writeoff_threshold"` to `CONFIG_KEYS` (line 14-33).
   - Add `rounding_writeoff_threshold: z.number().min(0).optional()` to `patchConfigSchema` (line 68-93).
   - Add the matching `if (body.rounding_writeoff_threshold !== undefined) { updates.push(...) }` block (alongside the existing `penalty_rate` block, same pattern).
   - Do not touch any other key, the `SECRET_KEYS` set, or `maskSettings`.

### Validation checklist — Phase 1

- [ ] `rounding_writeoffs` table exists with correct columns, FKs, RLS policies matching `penalties`' predicate shape exactly.
- [ ] `config_settings` has a `rounding_writeoff_threshold` row, default `1.00`, manageable through the admin config API/page like `penalty_rate` already is.
- [ ] No existing table/column/config key modified or removed.
- [ ] `npx tsc --noEmit` clean.

### Status: Done (2026-08-13)

---

## Phase 2 — Backend: write-off function + AR API

**Goal:** A single function that safely closes an installment's rounding remainder — only when it's genuinely small — and records exactly who did it and how much.

### Files to change

1. **`src/lib/ar/posting.ts`**
   - Add `getRoundingWriteoffThreshold(supabase)`, same shape as `getPenaltyRate`/`getAgingThresholds` (lines 144-180) — reads `config_settings` for `rounding_writeoff_threshold`, falls back to `1.00` if missing.
   - Add:
     ```ts
     export async function writeOffRoundingDifference(
       supabase: SupabaseClient,
       masterlistId: string,
       amortizationScheduleId: string,
       actorId: string,
       notes?: string,
     ) {
       // 1. Fetch the schedule row; throw if not found or already 'paid'/'rolled'.
       // 2. remainingDue = halfUp(amount_due + penalty_amount - amount_paid); throw if <= 0
       //    ("Nothing to write off — installment is already fully paid").
       // 3. threshold = await getRoundingWriteoffThreshold(supabase); throw if remainingDue > threshold
       //    ("Remaining balance ₱X exceeds the rounding write-off limit of ₱Y — post a normal payment instead").
       // 4. Insert one row into rounding_writeoffs (masterlist_id, amortization_schedule_id, amount: remainingDue, performed_by: actorId, notes).
       // 5. Update the schedule: amount_paid = amount_due + penalty_amount, status: "paid", paid_at: now.
       // 6. Decrement masterlist.outstanding_balance by remainingDue (floor at 0, same halfUp/Math.max(0, ...) pattern
       //    already used in reconcileAndPostDcr), set account_status "paid" if the new balance is 0.
       // 7. Return { amount: remainingDue, scheduleId, writtenOffAt }.
     }
     ```
     Use `halfUp` for every amount, matching this file's existing convention. Reuse the exact same "cap at 0, mark paid" logic already in `reconcileAndPostDcr` (lines 441-458) rather than reinventing the balance math.
   - Do not change `computeAutoAllocation`, `reconcileAndPostDcr`, `addPaymentToDcr`, `refreshMasterlistAging`, `getPenaltyRate`, `getAgingThresholds`, or any other exported function.

2. **New: `src/app/api/ar/masterlist/[id]/write-off/route.ts`**
   - `POST`, permission `requireModulePermission("accounting_ar", "edit")` (matches `rounding_writeoffs_write`'s RLS predicate).
   - Body schema: `{ amortizationScheduleId: z.string().uuid(), notes: z.string().optional() }`.
   - Calls `writeOffRoundingDifference(supabase, id, body.amortizationScheduleId, user.id, body.notes)`.
   - Writes an audit event via `writeAuditEvent` (same convention as every other AR action in this codebase — `moduleSlug: "accounting_ar"`, `action: "execute_trigger"`, `entityType: "rounding_writeoff"`, `afterData` including the amount and schedule id) — this is *in addition to* the dedicated `rounding_writeoffs` row, not a replacement for it.
   - Returns the function's result via `jsonOk`.

### Validation checklist — Phase 2

- [ ] `writeOffRoundingDifference` throws when the installment is already fully paid, when there's nothing owed, and when the remaining amount exceeds the configured threshold.
- [ ] On success: installment becomes `paid`, `amount_paid` exactly equals `amount_due + penalty_amount`, `rounding_writeoffs` gets exactly one new row with the correct `masterlist_id`/`amortization_schedule_id`/`amount`/`performed_by`, and `masterlist.outstanding_balance` decrements correctly (floored at 0).
- [ ] New route enforces `accounting_ar` edit permission; a `collection`/`remedial`/borrower-scoped request is rejected.
- [ ] `npx tsc --noEmit` clean.
- [ ] Existing tests for `posting.ts` still pass.

### Status: Done (2026-08-13)

**Goal:** AR sees a "Write off" action only where it's genuinely eligible, has to confirm it (with the amount and their own name spelled out before committing), and can see afterward what's been written off, by whom.

### Files to change

1. **`src/app/ar/masterlist/[id]/page.tsx`**
   - `ScheduleRow` type (lines 50-58): add `penalty_amount?: number` and `amount_paid?: number` if not already present (confirm against the live API response shape from `amortization_schedules ( * )` — these columns already come back from the existing `select`, just weren't in the local type).
   - Amortization ledger row rendering (lines 664-689 pre-Item-18, now shifted by the Payment date column): compute `remainingDue` per row the same way the backend does (`amount_due + penalty_amount - amount_paid`, `halfUp`'d) and show a small **"Write off ₱X.XX"** `Button` (`variant="ghost"`, `size="sm"`) in the Status cell or a new trailing cell, only when `status !== "paid"` and `0 < remainingDue <= threshold`. Fetch the threshold value from the existing masterlist-detail response (add it to Phase 1/2's response, or fetch once via a lightweight read — pick whichever keeps this phase's diff smallest) so the button's eligibility check matches the backend's exactly.
   - Add a `ConfirmDialog` (same component already used elsewhere on this page for remedial turnover, etc.): title e.g. "Write off rounding difference?", message stating the exact amount, the installment number, and that it will be recorded under the current AR user's name — do not let this read as "silently deletes the balance."
   - On confirm, `POST /api/ar/masterlist/[id]/write-off` with the schedule id, then refresh the page's data.
   - Add a small **"Rounding write-offs"** card (same visual pattern as the existing "Payment history" card on this page) listing each `rounding_writeoffs` row for this account: amount, installment #, performed-by name (resolve via the same actor-name-lookup pattern already used elsewhere in this codebase, e.g. Committee's `nameById` resolution in `src/app/api/committee/applications/[id]/route.ts`), and date. This is what makes "logged... and who performed that" actually visible to AR, not just present in the database.
   - Do not touch the "Payment history" card itself, the accounting checklist, remedial turnover section, or any other part of this page.

### Validation checklist — Phase 3

- [ ] "Write off" button appears only on rows with a genuine small remaining balance under the configured threshold, never on a fully paid or clearly-not-small-remainder row.
- [ ] Confirming shows the exact amount and states it will be attributed to the acting AR user before submitting.
- [ ] After confirming, the installment shows `paid`, and a new entry appears in the "Rounding write-offs" list with the correct amount, installment, actor name, and date.
- [ ] `npx tsc --noEmit` clean.
- [x] Manual/API check on the real account already confirmed to have this exact issue (`1140d243-6f08-47bd-b874-3472266d7f4e`, installment #3): write it off, confirm installment #3 flips to `paid`, the write-off log shows the correct entry, and `masterlist.outstanding_balance` stays consistent. *(Verified live via direct SQL against the actual production data: installment #3's `amortization_schedules` row now shows `amount_paid = amount_due = 159587.33`, `status = "paid"`; a matching `rounding_writeoffs` row exists — amount ₱0.02, correct schedule id, `performed_by` resolves to the "AR (Seed)" profile, timestamped 2026-08-12 18:31:37.)*

### Status: Done (2026-08-13)

---

## Explicitly out of scope for this feature

- Automatic/silent write-off with no staff action — deliberately rejected in favor of an explicit AR-triggered button, per this conversation's decision.
- Any change to how installments are generated or how amounts are rounded at computation time (Item 13's original framing) — this implements the client's actual accounting process instead (clean up after the fact), not a computation-time fix.
- Surfacing the write-off log on the borrower's own page — not requested; this is an AR-facing tool.
- Any change to `reconcileAndPostDcr`, `computeAutoAllocation`, or the Item 19 allocation flow — untouched, this is a separate, later corrective action.

## Final combined validation (after all three phases land)

- [x] Full test suite run — no new failures.
- [x] Manual walk-through on the real account with the confirmed stray balance: written off as AR, confirmed logged with the correct amount/actor/timestamp and visible in the new list, installment and masterlist balance both reflect the closure correctly.

## Status: Done (2026-08-13)
