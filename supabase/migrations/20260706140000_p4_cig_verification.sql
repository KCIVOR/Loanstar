-- Phase 4: CIG verification, callbacks, committee visibility

CREATE TABLE public.verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_application_id uuid NOT NULL UNIQUE REFERENCES public.loan_applications(id) ON DELETE CASCADE,
  field_completeness_ok boolean,
  field_completeness_notes text,
  pic_allotment_awareness text,
  pic_payment_reliability text,
  pic_interview_notes text,
  cm_departure_date date,
  cm_salary numeric(14,2),
  cm_position text,
  cm_contract_status text,
  cm_notes text,
  character_references_notes text,
  finding text CHECK (finding IS NULL OR finding IN ('positive', 'negative')),
  finding_notes text,
  is_complete boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  completed_by uuid REFERENCES auth.users(id),
  forwarded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.callbacks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_application_id uuid NOT NULL REFERENCES public.loan_applications(id) ON DELETE CASCADE,
  scheduled_at timestamptz NOT NULL,
  notes text,
  recorded_by uuid NOT NULL REFERENCES auth.users(id),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_callbacks_application ON public.callbacks(loan_application_id);
CREATE INDEX idx_callbacks_scheduled ON public.callbacks(scheduled_at)
  WHERE resolved_at IS NULL;

-- Committee can view applications pending decision
DROP POLICY IF EXISTS applications_select ON public.loan_applications;

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
    OR public.has_module_permission('verification', 'view')
    OR public.has_module_permission('committee', 'view')
  );

-- CIG auto-forward to committee
CREATE POLICY applications_cig_forward ON public.loan_applications
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.has_module_permission('verification', 'execute_trigger')
      AND status = 'for_verification'
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR status = 'for_approval'
  );

-- CIG may edit borrower profile during verification (via intake edit grant)
CREATE POLICY applications_cig_borrower_edit ON public.loan_applications
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.has_module_permission('intake', 'edit')
      AND status = 'for_verification'
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR status = 'for_verification'
  );
