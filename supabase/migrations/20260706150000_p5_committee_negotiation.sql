-- Phase 5: Committee votes, actions, negotiation, LRA handoff queue

CREATE TABLE public.committee_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_application_id uuid NOT NULL REFERENCES public.loan_applications(id) ON DELETE CASCADE,
  voter_id uuid NOT NULL REFERENCES auth.users(id),
  vote text NOT NULL CHECK (vote IN ('approve', 'deny')),
  voted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (loan_application_id, voter_id)
);

CREATE INDEX idx_committee_votes_application ON public.committee_votes(loan_application_id);

CREATE TABLE public.committee_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_application_id uuid NOT NULL REFERENCES public.loan_applications(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('approve', 'deny', 'revisit', 'hold')),
  comment text,
  acted_by uuid NOT NULL REFERENCES auth.users(id),
  acted_at timestamptz NOT NULL DEFAULT now(),
  votes_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX idx_committee_actions_application ON public.committee_actions(loan_application_id);

CREATE TABLE public.revisit_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_application_id uuid NOT NULL REFERENCES public.loan_applications(id) ON DELETE CASCADE,
  committee_action_id uuid NOT NULL REFERENCES public.committee_actions(id) ON DELETE CASCADE,
  route_to text NOT NULL CHECK (route_to IN ('csa', 'cig')),
  comment text NOT NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.negotiations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_application_id uuid NOT NULL UNIQUE REFERENCES public.loan_applications(id) ON DELETE CASCADE,
  approved_amount numeric(14,2),
  current_amount numeric(14,2),
  last_counter_amount numeric(14,2),
  last_counter_by text CHECK (last_counter_by IS NULL OR last_counter_by IN ('borrower', 'csa', 'committee')),
  active_computation_id uuid REFERENCES public.computations(id),
  status text NOT NULL DEFAULT 'pending_disclosure'
    CHECK (status IN ('pending_disclosure', 'negotiating', 'awaiting_signature', 'signed')),
  disclosed_at timestamptz,
  disclosed_by uuid REFERENCES auth.users(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.release_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_application_id uuid NOT NULL UNIQUE REFERENCES public.loan_applications(id) ON DELETE CASCADE,
  computation_id uuid NOT NULL REFERENCES public.computations(id),
  queued_at timestamptz NOT NULL DEFAULT now(),
  queued_by uuid REFERENCES auth.users(id)
);

INSERT INTO public.email_templates (slug, name, subject, body_html) VALUES
  (
    'application_denied',
    'Application Denied',
    'LoanStar — Application Update',
    '<p>Dear {{borrower_name}},</p><p>Thank you for your loan application. After review, we are unable to proceed with your application at this time.</p><p>If you have questions, please contact our office.</p><p>— LoanStar</p>'
  )
ON CONFLICT (slug) DO NOTHING;

-- Committee final-action status updates
CREATE POLICY applications_committee_action ON public.loan_applications
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.has_module_permission('committee', 'execute_trigger')
      AND status IN ('for_approval', 'negotiating_terms')
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR status IN ('approved', 'denied', 'for_revision', 'on_hold', 'for_approval', 'negotiating_terms', 'awaiting_confirmation', 'lra_pending')
  );

-- Revision complete → back to committee
CREATE POLICY applications_revision_complete ON public.loan_applications
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin()
    OR (
      status = 'for_revision'
      AND (
        public.has_module_permission('intake', 'edit')
        OR public.has_module_permission('verification', 'edit')
      )
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR status = 'for_approval'
  );

-- Negotiation / LRA status updates
CREATE POLICY applications_negotiation_update ON public.loan_applications
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.has_module_permission('negotiation', 'edit')
      AND status IN ('approved', 'negotiating_terms', 'awaiting_confirmation')
    )
    OR (
      public.has_module_permission('borrower_portal', 'edit')
      AND status IN ('approved', 'negotiating_terms', 'awaiting_confirmation')
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR status IN ('negotiating_terms', 'awaiting_confirmation', 'lra_pending', 'approved')
  );

CREATE POLICY applications_lra_queue ON public.loan_applications
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.has_module_permission('borrower_portal', 'edit')
      AND status IN ('approved', 'awaiting_confirmation', 'negotiating_terms')
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR status = 'lra_pending'
  );
