-- LRA flow alignment: signing happens in-branch witnessed by LRA (not borrower
-- self-service), and the pre-release briefing is acknowledged by the Collection
-- Head (collection module) instead of the borrower.

-- Who recorded the in-branch signature (the LRA staffer); signed_by stays the
-- borrower whose signature is on the paper.
ALTER TABLE public.generated_documents
  ADD COLUMN witnessed_by uuid REFERENCES auth.users(id);

-- Borrower no longer signs release documents from the portal.
DROP POLICY generated_documents_borrower_sign ON public.generated_documents;

-- Rebuild the LRA update policy without the borrower branch.
DROP POLICY generated_documents_lra_update ON public.generated_documents;
CREATE POLICY generated_documents_lra_update ON public.generated_documents
  FOR UPDATE TO authenticated
  USING (
    is_finalized = false
    AND (
      public.is_super_admin()
      OR public.has_module_permission('release_lra', 'edit')
    )
  )
  WITH CHECK (is_finalized = false);

-- Borrower no longer acknowledges the briefing (read-only view stays via
-- briefings_borrower_select).
DROP POLICY briefings_borrower_sign ON public.briefings;

-- Collection Head needs to see files waiting on briefing.
CREATE POLICY release_files_collector_select ON public.release_files
  FOR SELECT TO authenticated
  USING (public.has_module_permission('collection', 'view'));

CREATE POLICY briefings_collector_select ON public.briefings
  FOR SELECT TO authenticated
  USING (public.has_module_permission('collection', 'view'));

-- Collection Head checks off the briefing.
CREATE POLICY briefings_collector_ack ON public.briefings
  FOR UPDATE TO authenticated
  USING (public.has_module_permission('collection', 'execute_trigger'))
  WITH CHECK (public.has_module_permission('collection', 'execute_trigger'));
