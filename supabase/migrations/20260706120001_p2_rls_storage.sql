-- Phase 2: RLS + storage bucket policies

ALTER TABLE public.borrowers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signatures ENABLE ROW LEVEL SECURITY;

-- borrowers
CREATE POLICY borrowers_select ON public.borrowers
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR user_id = auth.uid()
    OR public.has_module_permission('intake', 'view')
    OR public.has_module_permission('leads', 'view')
  );

CREATE POLICY borrowers_insert ON public.borrowers
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin()
    OR user_id = auth.uid()
    OR public.has_module_permission('borrower_portal', 'create')
  );

CREATE POLICY borrowers_update ON public.borrowers
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin()
    OR user_id = auth.uid()
    OR public.has_module_permission('intake', 'edit')
  )
  WITH CHECK (
    public.is_super_admin()
    OR user_id = auth.uid()
    OR public.has_module_permission('intake', 'edit')
  );

-- loan_applications
CREATE POLICY applications_select ON public.loan_applications
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.borrowers b
      WHERE b.id = borrower_id AND b.user_id = auth.uid()
    )
    OR agent_user_id = auth.uid()
    OR public.has_module_permission('intake', 'view')
    OR public.has_module_permission('leads', 'view')
  );

CREATE POLICY applications_insert ON public.loan_applications
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.borrowers b
      WHERE b.id = borrower_id AND b.user_id = auth.uid()
    )
    OR public.has_module_permission('leads', 'create')
    OR public.has_module_permission('borrower_portal', 'create')
  );

CREATE POLICY applications_update ON public.loan_applications
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.borrowers b
      WHERE b.id = borrower_id AND b.user_id = auth.uid()
    )
    OR public.has_module_permission('intake', 'edit')
  )
  WITH CHECK (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.borrowers b
      WHERE b.id = borrower_id AND b.user_id = auth.uid()
    )
    OR public.has_module_permission('intake', 'edit')
  );

-- leads
CREATE POLICY leads_select ON public.leads
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR agent_user_id = auth.uid()
    OR public.has_module_permission('leads', 'view')
  );

CREATE POLICY leads_write ON public.leads
  FOR ALL TO authenticated
  USING (
    public.is_super_admin()
    OR agent_user_id = auth.uid()
    OR public.has_module_permission('leads', 'edit')
  )
  WITH CHECK (
    public.is_super_admin()
    OR agent_user_id = auth.uid()
    OR public.has_module_permission('leads', 'create')
    OR public.has_module_permission('leads', 'edit')
  );

-- documents: borrowers/staff full; agents metadata only via RPC (no direct select for agents)
CREATE POLICY documents_select ON public.documents
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.borrowers b
      WHERE b.id = borrower_id AND b.user_id = auth.uid()
    )
    OR public.has_module_permission('intake', 'view')
    OR public.has_module_permission('system_config', 'view')
  );

CREATE POLICY documents_insert ON public.documents
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.borrowers b
      WHERE b.id = borrower_id AND b.user_id = auth.uid()
    )
    OR public.has_module_permission('leads', 'create')
    OR public.has_module_permission('leads', 'edit')
    OR public.has_module_permission('intake', 'edit')
  );

CREATE POLICY documents_update ON public.documents
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.borrowers b
      WHERE b.id = borrower_id AND b.user_id = auth.uid()
    )
    OR public.has_module_permission('leads', 'edit')
    OR public.has_module_permission('intake', 'edit')
  )
  WITH CHECK (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.borrowers b
      WHERE b.id = borrower_id AND b.user_id = auth.uid()
    )
    OR public.has_module_permission('leads', 'edit')
    OR public.has_module_permission('intake', 'edit')
  );

-- signatures
CREATE POLICY signatures_select ON public.signatures
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR signer_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.documents d
      JOIN public.borrowers b ON b.id = d.borrower_id
      WHERE d.id = document_id AND b.user_id = auth.uid()
    )
    OR public.has_module_permission('intake', 'view')
  );

CREATE POLICY signatures_insert ON public.signatures
  FOR INSERT TO authenticated
  WITH CHECK (signer_id = auth.uid() OR public.is_super_admin());

-- Storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'loan-documents',
  'loan-documents',
  false,
  10485760,
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO NOTHING;

-- Borrowers: read/write own folder objects
CREATE POLICY storage_borrower_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'loan-documents'
    AND (
      public.is_super_admin()
      OR public.has_module_permission('intake', 'view')
      OR (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.borrowers b
        WHERE b.user_id = auth.uid()
          AND (storage.foldername(name))[1] = b.id::text
      )
    )
  );

CREATE POLICY storage_borrower_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'loan-documents'
    AND (
      public.is_super_admin()
      OR public.has_module_permission('leads', 'edit')
      OR public.has_module_permission('intake', 'edit')
      OR EXISTS (
        SELECT 1 FROM public.borrowers b
        WHERE b.user_id = auth.uid()
          AND (storage.foldername(name))[1] = b.id::text
      )
    )
  );

CREATE POLICY storage_borrower_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'loan-documents'
    AND (
      public.is_super_admin()
      OR public.has_module_permission('intake', 'edit')
      OR EXISTS (
        SELECT 1 FROM public.borrowers b
        WHERE b.user_id = auth.uid()
          AND (storage.foldername(name))[1] = b.id::text
      )
    )
  );

-- Agents: can upload to borrower folders linked to their leads but cannot read
CREATE POLICY storage_agent_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'loan-documents'
    AND public.has_module_permission('leads', 'edit')
    AND EXISTS (
      SELECT 1 FROM public.leads l
      JOIN public.borrowers b ON b.id = l.borrower_id
      WHERE l.agent_user_id = auth.uid()
        AND (storage.foldername(name))[1] = b.id::text
    )
  );
