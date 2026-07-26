-- Fix masterlist SELECT RLS: unqualified `id` inside the assignments EXISTS
-- subquery was bound to assignments.id (not masterlist.id), so
-- `a.masterlist_id = id` became `a.masterlist_id = a.id` and never matched.
-- Collectors could see their assignment rows but not the masterlist accounts.

DROP POLICY IF EXISTS masterlist_ar_select ON public.masterlist;

CREATE POLICY masterlist_ar_select ON public.masterlist
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.has_module_permission('accounting_ar', 'view')
    OR EXISTS (
      SELECT 1 FROM public.borrowers b
      WHERE b.id = masterlist.borrower_id AND b.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.assignments a
      WHERE a.masterlist_id = masterlist.id
        AND a.collector_user_id = auth.uid()
        AND masterlist.remedial_flag = false
    )
    OR EXISTS (
      SELECT 1 FROM public.assignments a
      WHERE a.masterlist_id = masterlist.id
        AND a.remedial_user_id = auth.uid()
        AND masterlist.remedial_flag = true
    )
  );
