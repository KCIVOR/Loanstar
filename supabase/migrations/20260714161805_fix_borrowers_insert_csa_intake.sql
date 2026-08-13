-- CSA registering a first-time borrower during intake has no user_id yet (no
-- portal account) and only holds `intake` module permissions, not
-- `borrower_portal` — the insert check policy never granted CSA a branch, so
-- new-borrower intake failed with "new row violates row-level security
-- policy for table borrowers". Add the intake-create branch alongside the
-- existing ones (mirrors the borrowers_update policy, which already trusts
-- intake edit).
DROP POLICY IF EXISTS borrowers_insert ON public.borrowers;

CREATE POLICY borrowers_insert ON public.borrowers
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin()
    OR user_id = auth.uid()
    OR public.has_module_permission('borrower_portal', 'create')
    OR public.has_module_permission('intake', 'create')
  );
