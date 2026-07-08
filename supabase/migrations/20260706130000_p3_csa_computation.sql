-- Phase 3: CSA intake, checks, computations, file holds

CREATE OR REPLACE FUNCTION public.is_csa_editable_status(p_status text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_status IN (
    'registered',
    'documents_pending',
    'submitted',
    'on_hold',
    'for_revision'
  );
$$;

ALTER TABLE public.loan_applications
  ADD COLUMN IF NOT EXISTS endorsed_at timestamptz,
  ADD COLUMN IF NOT EXISTS endorsed_by uuid REFERENCES auth.users(id);

CREATE TABLE public.application_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_application_id uuid NOT NULL UNIQUE REFERENCES public.loan_applications(id) ON DELETE CASCADE,
  loan_type_id uuid REFERENCES public.loan_types(id) ON DELETE SET NULL,
  internal_flags jsonb NOT NULL DEFAULT '{}'::jsonb,
  staff_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.checks_recorded (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_application_id uuid NOT NULL REFERENCES public.loan_applications(id) ON DELETE CASCADE,
  check_type_id uuid NOT NULL REFERENCES public.check_types(id) ON DELETE RESTRICT,
  stage text NOT NULL,
  result text NOT NULL DEFAULT 'pending' CHECK (result IN ('pass', 'fail', 'pending')),
  proof_storage_path text,
  proof_file_name text,
  proof_mime_type text,
  checked_by uuid REFERENCES auth.users(id),
  checked_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (loan_application_id, check_type_id)
);

CREATE TABLE public.computations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_application_id uuid NOT NULL REFERENCES public.loan_applications(id) ON DELETE CASCADE,
  version int NOT NULL DEFAULT 1,
  input_mode text NOT NULL CHECK (input_mode IN ('NET_SARADO', 'NET_LESS_SECURITY', 'PRINCIPAL')),
  input_amount numeric(14,2) NOT NULL,
  terms int NOT NULL CHECK (terms >= 1),
  addon_months int NOT NULL DEFAULT 2 CHECK (addon_months >= 1),
  pf_rate numeric(8,6) NOT NULL,
  interest_rate numeric(8,6) NOT NULL,
  security_fee_rate numeric(8,6) NOT NULL,
  loan_type_id uuid REFERENCES public.loan_types(id) ON DELETE SET NULL,
  loan_type_name text,
  other_deductions jsonb NOT NULL DEFAULT '{}'::jsonb,
  principal numeric(14,2) NOT NULL,
  processing_fee numeric(14,2) NOT NULL,
  admin_cost numeric(14,2) NOT NULL,
  doc_stamp numeric(14,2) NOT NULL,
  notary_fee numeric(14,2) NOT NULL,
  security_fee numeric(14,2) NOT NULL,
  other_deductions_total numeric(14,2) NOT NULL DEFAULT 0,
  total_deductions numeric(14,2) NOT NULL,
  net_released numeric(14,2) NOT NULL,
  total_interest numeric(14,2) NOT NULL,
  total_loan numeric(14,2) NOT NULL,
  monthly_amortization numeric(14,2) NOT NULL,
  release_date date,
  first_payment_date date,
  due_day int DEFAULT 10,
  line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  coverage_ratio numeric(8,4),
  coverage_warning boolean NOT NULL DEFAULT false,
  computed_by uuid REFERENCES auth.users(id),
  signed_at timestamptz,
  signed_by uuid REFERENCES auth.users(id),
  signature_hash text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_computations_application ON public.computations(loan_application_id);
CREATE INDEX idx_computations_active ON public.computations(loan_application_id, is_active)
  WHERE is_active = true;

CREATE TABLE public.file_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_application_id uuid NOT NULL REFERENCES public.loan_applications(id) ON DELETE CASCADE,
  reason text NOT NULL,
  recorded_by uuid NOT NULL REFERENCES auth.users(id),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_file_holds_application ON public.file_holds(loan_application_id);

-- Replace application update policy: CSA edit only before endorsement
DROP POLICY IF EXISTS applications_update ON public.loan_applications;

CREATE POLICY applications_update ON public.loan_applications
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin()
    OR (
      EXISTS (
        SELECT 1 FROM public.borrowers b
        WHERE b.id = borrower_id AND b.user_id = auth.uid()
      )
      AND public.is_csa_editable_status(status)
    )
    OR (
      public.has_module_permission('intake', 'edit')
      AND public.is_csa_editable_status(status)
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR (
      EXISTS (
        SELECT 1 FROM public.borrowers b
        WHERE b.id = borrower_id AND b.user_id = auth.uid()
      )
      AND public.is_csa_editable_status(status)
    )
    OR (
      public.has_module_permission('intake', 'edit')
      AND public.is_csa_editable_status(status)
    )
  );

-- Endorse trigger updates status beyond CSA edit — allow via execute_trigger permission
CREATE POLICY applications_endorse ON public.loan_applications
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.has_module_permission('intake', 'execute_trigger')
      AND public.is_csa_editable_status(status)
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR status = 'for_verification'
  );
