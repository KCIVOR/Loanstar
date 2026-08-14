CREATE TABLE public.application_cancellations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_application_id uuid NOT NULL REFERENCES public.loan_applications(id) ON DELETE CASCADE,
  reason text NOT NULL,
  cancelled_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_application_cancellations_application ON public.application_cancellations(loan_application_id);

ALTER TABLE public.application_cancellations ENABLE ROW LEVEL SECURITY;

CREATE POLICY application_cancellations_select ON public.application_cancellations
  FOR SELECT TO authenticated
  USING (
    is_super_admin()
    OR has_module_permission('verification', 'view')
  );

CREATE POLICY application_cancellations_insert ON public.application_cancellations
  FOR INSERT TO authenticated
  WITH CHECK (
    is_super_admin()
    OR has_module_permission('verification', 'execute_trigger')
  );

CREATE POLICY applications_cig_cancel ON public.loan_applications
  FOR UPDATE TO authenticated
  USING (
    is_super_admin()
    OR (
      has_module_permission('verification', 'execute_trigger')
      AND status = 'for_verification'
    )
  )
  WITH CHECK (
    is_super_admin()
    OR status = 'cancelled'
  );
