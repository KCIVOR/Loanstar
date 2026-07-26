-- Committee flow alignment with the client's original process:
-- 1. Per-vote remarks ("committee remarks" section)
-- 2. 4 Cs assessment (Character, Capacity, Capital, Conditions) — informal
--    deliberation notes, not a gate
-- 3. Committee needs document/attachment visibility ("most comprehensive view")

ALTER TABLE public.committee_votes
  ADD COLUMN comment text;

CREATE TABLE public.committee_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_application_id uuid NOT NULL UNIQUE REFERENCES public.loan_applications(id) ON DELETE CASCADE,
  character_notes text,
  capacity_notes text,
  capital_notes text,
  conditions_notes text,
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.committee_assessments ENABLE ROW LEVEL SECURITY;

CREATE POLICY committee_assessments_select ON public.committee_assessments
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.has_module_permission('committee', 'view')
  );

CREATE POLICY committee_assessments_write ON public.committee_assessments
  FOR ALL TO authenticated
  USING (
    public.is_super_admin()
    OR public.has_module_permission('committee', 'edit')
  )
  WITH CHECK (
    public.is_super_admin()
    OR public.has_module_permission('committee', 'edit')
  );

-- Committee needs "the most comprehensive view" of the file, including
-- attachments (Passport, Seaman's Book, Contract, IDs, House Sketch).
DROP POLICY IF EXISTS documents_select ON public.documents;

CREATE POLICY documents_select ON public.documents
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.borrowers b
      WHERE b.id = borrower_id AND b.user_id = auth.uid()
    )
    OR public.has_module_permission('intake', 'view')
    OR public.has_module_permission('committee', 'view')
    OR public.has_module_permission('system_config', 'view')
  );

CREATE POLICY storage_committee_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'loan-documents'
    AND public.has_module_permission('committee', 'view')
  );

-- Committee override power (both the pre-decision adjustment during
-- for_approval and the post-approval override during negotiating_terms) had
-- no RLS grant at all on computations — committeeOverrideAmount() has always
-- silently failed for a real committee account (only is_super_admin() could
-- write). Add committee-scoped insert/update, gated to the two statuses
-- where Committee is allowed to touch the computation.
DROP POLICY IF EXISTS computations_insert ON public.computations;

CREATE POLICY computations_insert ON public.computations
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin()
    OR (
      public.has_module_permission('computation', 'create')
      AND EXISTS (
        SELECT 1 FROM public.loan_applications la
        WHERE la.id = loan_application_id
          AND public.is_csa_editable_status(la.status)
      )
    )
    OR (
      public.has_module_permission('committee', 'edit')
      AND EXISTS (
        SELECT 1 FROM public.loan_applications la
        WHERE la.id = loan_application_id
          AND la.status IN ('for_approval', 'negotiating_terms')
      )
    )
  );

DROP POLICY IF EXISTS computations_update ON public.computations;

CREATE POLICY computations_update ON public.computations
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.has_module_permission('computation', 'edit')
      AND signed_at IS NULL
      AND EXISTS (
        SELECT 1 FROM public.loan_applications la
        WHERE la.id = loan_application_id
          AND public.is_csa_editable_status(la.status)
      )
    )
    OR (
      EXISTS (
        SELECT 1
        FROM public.loan_applications la
        JOIN public.borrowers b ON b.id = la.borrower_id
        WHERE la.id = loan_application_id
          AND b.user_id = auth.uid()
      )
      AND signed_at IS NULL
    )
    OR (
      public.has_module_permission('committee', 'edit')
      AND EXISTS (
        SELECT 1 FROM public.loan_applications la
        WHERE la.id = loan_application_id
          AND la.status IN ('for_approval', 'negotiating_terms')
      )
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR signed_by IS NOT NULL
    OR (
      public.has_module_permission('computation', 'edit')
      AND EXISTS (
        SELECT 1 FROM public.loan_applications la
        WHERE la.id = loan_application_id
          AND public.is_csa_editable_status(la.status)
      )
    )
    OR (
      public.has_module_permission('committee', 'edit')
      AND EXISTS (
        SELECT 1 FROM public.loan_applications la
        WHERE la.id = loan_application_id
          AND la.status IN ('for_approval', 'negotiating_terms')
      )
    )
  );
