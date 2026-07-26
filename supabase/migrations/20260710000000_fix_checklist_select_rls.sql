-- Checklist / check-type definitions are reference config needed by borrowers
-- and staff portals. Writes stay restricted to system_config; SELECT is open
-- to authenticated users so borrower intake and staff queues can load items.

DROP POLICY IF EXISTS document_types_select ON public.document_types;
CREATE POLICY document_types_select ON public.document_types
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS stage_checklists_select ON public.stage_checklists;
CREATE POLICY stage_checklists_select ON public.stage_checklists
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS check_types_select ON public.check_types;
CREATE POLICY check_types_select ON public.check_types
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS stage_check_mapping_select ON public.stage_check_mapping;
CREATE POLICY stage_check_mapping_select ON public.stage_check_mapping
  FOR SELECT TO authenticated
  USING (true);
