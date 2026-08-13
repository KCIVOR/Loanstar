# Hotfix — Collection Head can't see or acknowledge briefings (RLS gap)

**Ground rules:**
- Touch only the files listed under "Files to change." If you find a related spot not listed, stop and flag it rather than editing it.
- Do not rename, refactor, or "clean up" adjacent code you encounter while editing a listed file.
- **Additive only** — add new RLS policies, do not edit or drop the existing `*_collector_*` policies (Postgres RLS combines multiple permissive policies with OR, so adding a policy is sufficient and lower-risk than rewriting an existing one).
- Run existing tests after the change; do not delete or weaken a test to make it pass.
- At the end, output a summary: files changed, migration applied, tests run/result.

## Background (from conversation, decided scope)

After `feature-collection-head-role.md` landed, the user found the Collection Head account's Briefings list shows empty even though a real application is genuinely `awaiting_briefing` (confirmed live on-screen via the LRA page, which still shows the "Hand off to the Collection Head" banner for that file).

## Audit findings (verified 2026-08-15) — root cause confirmed

- **This is the exact "recurring RLS-gap" pattern** already documented multiple times in this project's history (Committee Item 8, CIG/Committee flow alignment work) — `role_module_permissions` (the app-level grid) and `requireModulePermission()` (the API-route check) were both correctly updated to the new `briefings` module in the prior plan, but the actual **Postgres RLS policies on the underlying tables were never touched**, and they're hardcoded to the old `collection` module:
  - `supabase/migrations/20260710110000_lra_flow_alignment.sql:31-33` — `release_files_collector_select` (SELECT on `release_files`): `USING (has_module_permission('collection', 'view'))`.
  - `:35-37` — `briefings_collector_select` (SELECT on `briefings`): same, `'collection'`, `'view'`.
  - `:40-43` — `briefings_collector_ack` (UPDATE on `briefings`): `USING`/`WITH CHECK` both `has_module_permission('collection', 'execute_trigger')`.
- Collection Head has `briefings:view`/`briefings:execute_trigger` — never `collection:*` (confirmed live, `role_module_permissions`) — by design, that's the entire point of the new module. So `GET /api/collector/briefings`'s own `requireModulePermission("briefings", "view")` check passes (200 response), but the underlying Supabase query against `release_files`/`briefings` gets silently filtered to zero rows by RLS, since neither table has a policy that accepts the `briefings` module. This matches exactly what's on screen — no error, just an empty list.
- **Second, more serious consequence, also confirmed**: Collector's `collection:execute_trigger` was correctly turned off in the prior plan (Item 11's intent) — but `briefings_collector_ack` is the *only* RLS policy permitting an UPDATE on `briefings`, and it's still keyed to `collection:execute_trigger`. So right now, **no account — Collector or Collection Head — can actually acknowledge a briefing**, even one that could technically reach the write endpoint.
- `loan_applications`'s `applications_select` policy (`supabase/migrations/20260706100000_p1_foundation_schema.sql` and later fix migrations) already ORs in `has_module_permission('collection', 'view')` among several module checks, but not `briefings` — the nested `loan_applications (...)` embed inside the briefings query would hit the same silent-filter problem once `release_files` itself is fixed, so this needs the same treatment.
- Fix is purely additive: three new RLS policies (SELECT ×2, UPDATE ×1) each mirroring an existing `*_collector_*` policy's exact shape but keyed to `briefings` instead of `collection`, plus extending `loan_applications`'s existing multi-OR select policy with one more `OR has_module_permission('briefings', 'view')` clause (extending, not replacing, the existing condition list).

## Scope decision

One phase — a single additive migration.

---

## Phase 1 — Add `briefings`-module RLS policies

**Goal:** Collection Head can actually see and acknowledge briefings; the underlying query returns real rows instead of being silently filtered to zero.

### Files to change

1. **New migration file** (e.g. `supabase/migrations/20260817010000_briefings_rls.sql`), applied via Supabase MCP `apply_migration` to **both** `supabase/migrations/` and `loanstar/supabase/migrations/`:
   ```sql
   CREATE POLICY release_files_briefings_select ON public.release_files
     FOR SELECT TO authenticated
     USING (public.has_module_permission('briefings', 'view'));

   CREATE POLICY briefings_head_select ON public.briefings
     FOR SELECT TO authenticated
     USING (public.has_module_permission('briefings', 'view'));

   CREATE POLICY briefings_head_ack ON public.briefings
     FOR UPDATE TO authenticated
     USING (public.has_module_permission('briefings', 'execute_trigger'))
     WITH CHECK (public.has_module_permission('briefings', 'execute_trigger'));
   ```
   - Also extend `loan_applications`'s existing `applications_select` policy (confirm its current exact `USING` clause live first — it's been modified by several fix migrations over time, don't assume the original foundation-schema version is still current) to add `OR has_module_permission('briefings', 'view')` to the existing OR-chain of module checks. This one **is** an existing-policy edit (Postgres doesn't let you "add an OR clause" as a separate additive policy on the same predicate cleanly here without risking double-evaluation confusion) — use `ALTER POLICY` if this repo's convention supports it, or `DROP POLICY` + `CREATE POLICY` with the exact same name and every existing OR-branch preserved verbatim plus the one new branch appended. Do not remove or alter any of the existing OR-branches.
   - Do not touch `briefings_collector_select`, `briefings_collector_ack`, `release_files_collector_select`, or any other existing policy on these tables.

### Validation checklist — Phase 1

- [ ] `pg_policies` shows the 3 new policies on `release_files`/`briefings`, plus the extended `applications_select`, exactly as specified.
- [ ] Existing `*_collector_*` policies on `release_files`/`briefings` are byte-identical to before — confirm via `pg_policies`, not just "didn't touch the file."
- [ ] Live check: query `release_files`/`briefings`/`loan_applications` as the actual `collection_head` role (not service role) for the known `awaiting_briefing` application — rows now return.
- [ ] `GET /api/collector/briefings` as Collection Head now returns the real item(s), not an empty list.
- [ ] `POST /api/collector/briefings/[releaseFileId]` as Collection Head successfully acknowledges a real briefing — confirm the `briefings` row actually updates (`acknowledged_at`/`acknowledged_by` set), not just a 200 response.
- [ ] Collector (whose `collection:execute_trigger` is already off) still correctly gets no write access — confirm the fix didn't accidentally restore Collector's old capability.
- [ ] Every other RLS-governed read/write on `release_files`/`briefings`/`loan_applications` (LRA's own access, borrower's own read-only view) still works exactly as before.
- [ ] `npx tsc --noEmit` clean (this is a DB-only change, but confirm nothing else broke).
- [ ] Existing test suite still passes.

### Status: Done (2026-08-13)

---

## Explicitly out of scope

- Any change to `role_module_permissions`, `requireModulePermission` calls, navigation, or the seed account — all already correct from the prior plan; this fixes only the missed RLS layer underneath them.
- Removing or renaming the now-vestigial `briefings_collector_select`/`briefings_collector_ack`/`release_files_collector_select` policies — they're harmless (Collector can no longer reach the API route that would exercise them, per the earlier nav/permission changes), left in place per the additive-only convention.

## Final validation

- [x] Full test suite run — no new failures (891 pass / 0 fail, 2026-08-13).
- [ ] Live end-to-end: log in as `collection_head@loanstar.local`, see the real pending briefing, acknowledge it, confirm it clears from the queue and the underlying `briefings`/`release_files` state updates correctly.

### Status: Done (2026-08-13) — RLS applied; live acknowledge spot-check for user
