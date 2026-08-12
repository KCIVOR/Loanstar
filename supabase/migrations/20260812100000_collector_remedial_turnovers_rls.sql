-- Collector Closed Accounts Phase 1:
-- 1) Collectors can SELECT their own outgoing remedial_turnovers rows.
-- 2) Additive masterlist SELECT so those collectors can still read the
--    turned-over account (masterlist_ar_select requires remedial_flag=false
--    on the collector branch, so a post-turnover join would otherwise be empty).

CREATE POLICY remedial_turnovers_collector_select ON public.remedial_turnovers
  FOR SELECT TO authenticated
  USING (
    public.has_module_permission('collection', 'view')
    AND from_collector_id = auth.uid()
  );

CREATE POLICY masterlist_collector_turned_over_select ON public.masterlist
  FOR SELECT TO authenticated
  USING (
    public.has_module_permission('collection', 'view')
    AND EXISTS (
      SELECT 1
      FROM public.remedial_turnovers rt
      WHERE rt.masterlist_id = masterlist.id
        AND rt.from_collector_id = auth.uid()
    )
  );
