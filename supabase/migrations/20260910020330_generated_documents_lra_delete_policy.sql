-- LRA officers may remove a generated release document (per-document generate UI).
-- generated_documents had INSERT / SELECT / UPDATE policies but no DELETE, so a
-- user-client delete silently affected 0 rows. Mirror the UPDATE policy exactly:
-- only non-finalized rows, only release_lra 'edit' (or super admin).

CREATE POLICY generated_documents_lra_delete ON public.generated_documents
  FOR DELETE TO authenticated
  USING (
    is_finalized = false
    AND (is_super_admin() OR has_module_permission('release_lra', 'edit'))
  );
