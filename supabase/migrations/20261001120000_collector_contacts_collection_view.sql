-- Let collection staff read every contact on an account (handover/coverage),
-- not only the rows they logged themselves.
DROP POLICY IF EXISTS collector_contacts_select ON public.collector_contacts;
CREATE POLICY collector_contacts_select ON public.collector_contacts
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.has_module_permission('collection', 'view')
    OR public.has_module_permission('accounting_ar', 'view')
    OR collector_user_id = auth.uid()
    OR public.has_module_permission('remedial', 'view')
  );
