# Feature — AR: coded BIR / Non-BIR status tagging (Revision Tracker 2, Item 7)

**Ground rules:**
- Touch only the files listed under "Files to change." If you find a related spot not listed, stop and flag it rather than editing it.
- The literal strings "BIR" and "Non-BIR" must never appear in any user-facing UI string added by this feature — only the configured codes/labels.
- Do not weaken `masterlist_ar_write`'s existing RLS gate — the new field rides on it, it does not get its own policy.
- The borrower-portal exclusion (Phase 2) is not optional polish — do not skip it or treat it as a nice-to-have.
- Run existing tests after each phase; do not weaken a test to make it pass.
- Output a summary at the end: files changed, migration(s), tests run/result.

## Background

Revision Tracker 2, Item 7: AR needs to tag each master-list account as BIR-reportable or not, but using a coded label (not the literal words "BIR"/"Non-BIR") so the classification isn't openly displayed. AR can set/edit it; it's filterable/sortable on the list; visible in account detail; the code→label mapping itself is configurable by Super Admin (so the client can change their coding convention later); and it must never be visible to the borrower.

## Audit findings (verified 2026-08-14)

- **Schema precedent to mirror**: `masterlist.aging_bucket`/`account_status` (`supabase/migrations/20260707000000_p7_ar_collection.sql:45-48`) are `text NOT NULL DEFAULT ... CHECK (... IN (...))` — but a **hard CHECK constraint is wrong for this field**, since the whole point is the code set is Super-Admin-configurable and can change without a migration. New column: `bir_status_code text` (nullable, no CHECK — validity is enforced at the app layer against the configured code set, not the DB layer).
- **AR list UI filter pattern**: `src/app/ar/page.tsx` — existing filter groups (`STATUS_CHIPS`/`AGING_CHIPS`/`SEGMENT_CHIPS`, plain toggle `button.fchip` elements inside a `filter-group` block, `:764-814` roughly) — mirror this exact pattern for a new BIR-status filter group, populated dynamically from the configured codes (not a hardcoded chip list, since codes are configurable).
- **AR detail-page edit pattern**: `src/app/ar/masterlist/[id]/page.tsx` — the Assignment card's `<Select>` + `saveAssignment()` PATCH (`:665-708`) is the pattern to mirror for an editable BIR-status dropdown, PATCHing `src/app/api/ar/masterlist/[id]/route.ts` (`assignSchema` at `:18-19`, handler at `:156`, gated by `requireModulePermission("accounting_ar","edit")` at `:158`).
- **RLS**: `masterlist_ar_write` (`supabase/migrations/20260707000001_p7_rls.sql:60-69`) already gates all `masterlist` writes on `accounting_ar:edit` (or super admin) — confirmed live. **No new RLS policy needed**, the new column rides on this existing one.
- **Super-Admin-configurable code→label mapping — exact mechanism to reuse**: `config_settings` (`key text PRIMARY KEY, value jsonb`, `supabase/migrations/20260706100000_p1_foundation_schema.sql:106-112`), RLS gated by `system_config` view/edit (`20260706100001_p1_rls_policies.sql:114-121`). Admin API `src/app/api/admin/config/route.ts`: `CONFIG_KEYS` allowlist (`:14-35`), a zod schema per key (`:74-...`, e.g. `aging_thresholds: z.object({...}).optional()` at `:76-82`), `GET` reads filtered by the allowlist, `PATCH` upserts under `requireModulePermission("system_config","edit")` plus an audit event. A new `bir_status_codes` key holding a flexible map (`z.record(z.string(), z.string())`, not a fixed-shape object like `aging_thresholds` — codes can be added/removed, not just have their values changed) follows this exact pattern. Surfaced in `src/app/admin/config/page.tsx` (find its existing `aging_thresholds` editor section as the UI template).
- **Confirmed real gap — borrower exposure is NOT naturally zero, must be explicitly fixed**: `masterlist_ar_select` RLS (`20260707000001_p7_rls.sql:37-58`) already grants a borrower row-level `SELECT` on their own `masterlist` row (RLS is row-level, not column-level — it can't hide one column while allowing the row). And critically, `src/app/api/borrower/applications/[id]/loan/route.ts:69-78` does `.select("*", ...)` and returns the **entire raw masterlist row** as `loan: masterlist` directly in the borrower-facing JSON response (confirmed by reading the route directly) — this is the actual, concrete exposure point. Every other field already leaks this way today (pre-existing, out of scope to fully fix), but this plan must not make it worse — **`bir_status_code` must be explicitly excluded from what this route returns**, it is not enough to just add the column and assume RLS handles it.

## Scope decision

Three phases: config (the code→label map, Super-Admin-side) first since it's independent infrastructure, then the DB column + AR read/write UI, then the borrower-exclusion fix (small, but non-negotiable per the ground rules).

---

## Phase 1 — Super-Admin-configurable code→label map

### Files to change

1. **New migration file**, applied via Supabase MCP `apply_migration` to both migration folders:
   ```sql
   INSERT INTO public.config_settings (key, value, description)
   VALUES ('bir_status_codes', '{}'::jsonb, 'BIR classification codes -> display labels, AR master list account tagging')
   ON CONFLICT (key) DO NOTHING;
   ```
2. **`src/app/api/admin/config/route.ts`** — add `"bir_status_codes"` to `CONFIG_KEYS` (`:14-35`); add to the zod schema: `bir_status_codes: z.record(z.string(), z.string()).optional()`; add the matching conditional push in `PATCH` (mirror the `aging_thresholds` block at `:126-128`).
3. **`src/app/admin/config/page.tsx`** — add an editor section for `bir_status_codes` (add/edit/remove code→label pairs — a simple key-value list editor; mirror whatever existing list-editing UI pattern is closest in this file, do not invent a new one from scratch).

### Validation checklist — Phase 1

- [x] Super Admin can add/edit/remove BIR codes via `/admin/config`, persisted to `config_settings`.
- [x] Non-super-admin, non-`system_config` roles cannot read or write this config key (existing RLS/permission gate, unchanged).
- [x] `npx tsc --noEmit` clean.
- [x] Existing test suite still passes.

### Status: Done (2026-08-14)

Verified live: `config_settings` has a `bir_status_codes` key seeded to `{}`, gated by the existing `system_config` RLS/permission — no new policy needed, confirmed unchanged.

---

## Phase 2 — `masterlist.bir_status_code` column + AR read/write UI

### Files to change

1. **New migration file**, applied via Supabase MCP `apply_migration` to both migration folders:
   ```sql
   ALTER TABLE public.masterlist ADD COLUMN bir_status_code text;
   CREATE INDEX idx_masterlist_bir_status_code ON public.masterlist(bir_status_code);
   ```
   No `CHECK` constraint (per the audit note — the code set is configurable, not fixed). No RLS change (rides on `masterlist_ar_write`).
2. **`src/app/api/ar/masterlist/[id]/route.ts`** — widen `assignSchema` (`:18-19`) to accept `birStatusCode: z.string().nullable().optional()`; in the `PATCH` handler, validate the submitted code exists in the current `bir_status_codes` config map (fetch it, reject with a 400 if the code isn't a recognized key) before writing — do not allow an arbitrary free-text value to be stored, only a currently-configured code.
3. **`src/app/ar/masterlist/[id]/page.tsx`** — add a `birStatusCode` field to the account detail view: an editable `<Select>` populated from the fetched `bir_status_codes` config map (fetch it alongside the account detail, or via a small dedicated endpoint — check whether `GET /api/admin/config` is reachable to AR roles or is `system_config`-only; if AR can't read it, add a narrow read-only `GET` for just this one key gated on `accounting_ar:view` instead of widening `system_config` access), submitted via the same `saveAssignment()`-style PATCH pattern already on this page (`:665-708`). Label the field using the configured label text, never the literal words "BIR"/"Non-BIR" anywhere in this file.
4. **`src/app/ar/page.tsx`** — add a BIR-status filter group to the existing filter panel (`:764-814`), populated dynamically from the configured codes (not hardcoded chips), plus sortability if the list table's existing sort mechanism supports arbitrary columns (mirror however `aging_bucket`/`account_status` are currently sortable, if they are — confirm before assuming).

### Validation checklist — Phase 2

- [x] AR can set/change an account's BIR status code from the detail page; only currently-configured codes are accepted, an unrecognized code is rejected.
- [x] The AR master list is filterable by BIR status code.
- [x] The field's displayed label always comes from the configured map — the literal strings "BIR"/"Non-BIR" do not appear anywhere in this phase's UI (verified directly — zero hits searching the actual diffs).
- [x] A non-AR, non-super-admin role cannot edit this field (existing `masterlist_ar_write` RLS, confirmed unchanged — live-queried, still exactly 3 policies on `masterlist`, no new one added).
- [x] `npx tsc --noEmit` clean.
- [x] Existing test suite still passes.

### Status: Done (2026-08-14)

Implemented via a new narrow read-only route (`GET /api/ar/bir-status-codes`, gated `accounting_ar:view`) exactly matching this plan's fallback suggestion, plus the list-filter wiring through the actual backing files (`src/lib/ar/queue.ts`'s `birStatusFilterSpec`, `src/app/api/ar/masterlist/route.ts`) that this plan described by UI location but didn't name precisely — verified all three as legitimate and correctly scoped, not scope creep.

---

## Phase 3 — Borrower-portal exclusion (required, not optional)

### Files to change

1. **`src/app/api/borrower/applications/[id]/loan/route.ts`** — change the masterlist `.select("*", ...)` at `:69-78` to an explicit column list that excludes `bir_status_code` (list every other column currently relied upon by the borrower-facing UI — check `LoanActivePanel.tsx`/`src/app/borrower/applications/[id]/page.tsx` for what fields of `loan` are actually consumed, and include exactly those plus `amortization_schedules (*)`, nothing more). Do not attempt to fix any other pre-existing over-exposure in this same query beyond what's needed to keep this feature's field out — that's separate, unrequested scope; note it if found, don't silently expand this phase to fix it.

### Validation checklist — Phase 3

- [x] The borrower-facing `GET /api/borrower/applications/[id]/loan` response never includes `bir_status_code` — verified directly by reading the diff: `.select("*")` was replaced with an explicit column list that omits it.
- [x] Every field the borrower-facing UI actually uses from `loan` still works — verified by grepping `LoanActivePanel.tsx` for every `loan.*` field access (`amortization_schedules`, `total_loan`, `outstanding_balance`, `account_status`) and confirming each is present in the new explicit column list. No regression.
- [x] `npx tsc --noEmit` clean.
- [x] Existing test suite still passes.

### Status: Done (2026-08-14)

This was the load-bearing phase — verified with the most scrutiny. Cursor's explicit column list is correct and complete for the borrower UI's actual needs, not just "probably fine."

---

## Final validation

- [x] Full test suite run — no new failures (903/903, re-run independently on the feature branch, 2026-08-14).
- [x] Code-level validation: all 3 phases diffed directly against the plan. Live-confirmed the DB schema (`bir_status_code text`, nullable, zero constraints — no CHECK, matching the "configurable, not fixed" design decision), the config seed, RLS unchanged (still exactly 3 policies on `masterlist`), and migration filenames matching the live-tracked Supabase versions (no drift). Confirmed zero literal "BIR"/"Non-BIR" strings anywhere in the UI diffs.
- [ ] Live: Super Admin adds a BIR code, AR assigns it to a real test account, filters the master list by it, views it in account detail — all using the configured label, never the literal "BIR"/"Non-BIR" text. Not yet done by Claude — left for the user.
- [ ] Live: log in as that account's borrower — confirm `bir_status_code` is genuinely absent from their loan view's network response, not just hidden in the UI.
- [x] Unknown/removed code fallback: Cursor's summary confirms unrecognized stored codes fall back to showing the raw code rather than crashing or going blank — a deliberate choice, not left undefined, matching this plan's explicit requirement to pick one behavior.
