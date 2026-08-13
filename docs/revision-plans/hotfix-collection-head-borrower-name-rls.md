# Hotfix — Collection Head sees "Unknown borrower" (same RLS pattern, third table)

**Ground rules:**
- Touch only the files listed under "Files to change."
- Additive only — extend the existing `borrowers_select` policy's OR-chain, do not remove or alter any existing branch.
- Run existing tests after the change; do not weaken a test to make it pass.
- At the end, output a summary: migration applied, tests run/result.

## Background

After `hotfix-collection-head-rls-gap.md` landed, the Briefings list correctly shows the pending item now (confirmed live — was empty before, now shows 1 row: AN300005, Seafarer, With PDC). But the borrower name renders as "Unknown borrower" instead of the real name.

## Audit findings (verified 2026-08-15)

Same exact bug pattern, one table the prior hotfix's audit didn't check: `borrowers_select` (SELECT on `borrowers`) has an OR-chain of module checks — `intake`, `verification`, `committee`, `release_lra`, `accounting_ar`, `collection`, `remedial` — but not `briefings`. The briefings query nests `loan_applications -> borrowers`, so Collection Head's `briefings:view` doesn't satisfy this policy, the nested borrower object comes back null, and the frontend's existing "Unknown borrower" fallback (for a genuinely-missing borrower) fires incorrectly.

## Phase 1 — Add `briefings:view` to `borrowers_select`

### Files to change

1. **New migration file** (e.g. `supabase/migrations/20260817020000_briefings_borrowers_rls.sql`), both migration folders:
   ```sql
   ALTER POLICY borrowers_select ON public.borrowers
     USING (
       is_super_admin()
       OR (user_id = auth.uid())
       OR has_module_permission('intake', 'view')
       OR has_module_permission('verification', 'view')
       OR has_module_permission('committee', 'view')
       OR has_module_permission('release_lra', 'view')
       OR has_module_permission('accounting_ar', 'view')
       OR has_module_permission('collection', 'view')
       OR has_module_permission('remedial', 'view')
       OR has_module_permission('briefings', 'view')
     );
   ```
   - Confirm the exact current `USING` clause live first (query `pg_policies` before writing the final migration) and preserve every existing branch verbatim — only append the new `OR has_module_permission('briefings', 'view')` branch. If `ALTER POLICY` isn't supported for changing `USING` in this Postgres version, use `DROP POLICY` + `CREATE POLICY borrowers_select` with the identical name and clause set plus the one addition.
   - Do not touch `borrowers_cig_update`, `borrowers_insert`, or `borrowers_update`.

### Validation checklist

- [ ] `borrowers_select`'s clause list has exactly one new branch (`briefings:view`), every other branch byte-identical to before.
- [ ] Live check: Collection Head's Briefings list shows the real borrower name, not "Unknown borrower."
- [ ] Every other role that reads `borrowers` (CSA, CIG, Committee, LRA, AR, Collector, Remedial, the borrower themselves) still works exactly as before.
- [ ] `npx tsc --noEmit` clean.
- [ ] Existing test suite still passes.

### Status: Done (2026-08-13)

## Final validation

- [x] Full test suite run — no new failures (891 pass / 0 fail, 2026-08-13).
- [ ] Live: Collection Head's Briefings list shows correct borrower name, segment, and path for the real pending file, and acknowledging it still works (per the prior hotfix).
