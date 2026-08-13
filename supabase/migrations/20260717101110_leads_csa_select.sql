-- Phase 6: CSA can list open agent leads and link them on convert.
-- Additive policies only — agent leads_* policies stay unchanged.
-- Column-limited UPDATE: trigger blocks non-linkage edits for intake:edit actors.

CREATE POLICY leads_csa_select ON public.leads
  FOR SELECT TO authenticated
  USING (public.has_module_permission('intake', 'view'));

CREATE POLICY leads_csa_update ON public.leads
  FOR UPDATE TO authenticated
  USING (public.has_module_permission('intake', 'edit'))
  WITH CHECK (public.has_module_permission('intake', 'edit'));

CREATE OR REPLACE FUNCTION public.leads_csa_linkage_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Super-admins and lead agents keep full update rights.
  IF public.is_super_admin()
     OR NEW.agent_user_id = auth.uid()
     OR public.has_module_permission('leads', 'edit') THEN
    RETURN NEW;
  END IF;

  -- intake:edit may only set linkage columns.
  IF public.has_module_permission('intake', 'edit') THEN
    IF NEW.agent_user_id IS DISTINCT FROM OLD.agent_user_id
       OR NEW.borrower_name IS DISTINCT FROM OLD.borrower_name
       OR NEW.business_name IS DISTINCT FROM OLD.business_name
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'CSA may only update lead linkage columns';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS leads_csa_linkage_only ON public.leads;
CREATE TRIGGER leads_csa_linkage_only
  BEFORE UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.leads_csa_linkage_only();
