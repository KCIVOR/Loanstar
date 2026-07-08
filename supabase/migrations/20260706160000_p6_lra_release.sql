-- Phase 6: LRA documentation, PDC, generated docs, briefing, release closure

CREATE TABLE public.release_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_application_id uuid NOT NULL UNIQUE REFERENCES public.loan_applications(id) ON DELETE CASCADE,
  computation_id uuid NOT NULL REFERENCES public.computations(id),
  release_path text CHECK (release_path IS NULL OR release_path IN ('with_pdc', 'without_pdc')),
  status text NOT NULL DEFAULT 'awaiting_path'
    CHECK (status IN (
      'awaiting_path',
      'pdc_encoding',
      'ready_generate',
      'awaiting_signatures',
      'awaiting_briefing',
      'ready_release',
      'released',
      'closed'
    )),
  blank_check_from text,
  blank_check_to text,
  atm_bank_name text,
  atm_card_last4 text,
  assigned_to uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_release_files_status ON public.release_files(status);

CREATE TABLE public.pdc_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  release_file_id uuid NOT NULL REFERENCES public.release_files(id) ON DELETE CASCADE,
  check_number text,
  amount numeric(14,2) NOT NULL,
  check_date date NOT NULL,
  bank_name text NOT NULL,
  ref_account text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pdc_checks_release ON public.pdc_checks(release_file_id);

CREATE TABLE public.generated_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  release_file_id uuid NOT NULL REFERENCES public.release_files(id) ON DELETE CASCADE,
  document_slug text NOT NULL,
  storage_path text NOT NULL,
  content_hash text NOT NULL,
  is_finalized boolean NOT NULL DEFAULT false,
  finalized_at timestamptz,
  signed_at timestamptz,
  signed_by uuid REFERENCES auth.users(id),
  signature_hash text,
  generated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (release_file_id, document_slug)
);

CREATE INDEX idx_generated_documents_release ON public.generated_documents(release_file_id);

CREATE TABLE public.briefings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  release_file_id uuid NOT NULL UNIQUE REFERENCES public.release_files(id) ON DELETE CASCADE,
  acknowledged_at timestamptz,
  acknowledged_by uuid REFERENCES auth.users(id),
  checklist jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.release_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  release_file_id uuid NOT NULL REFERENCES public.release_files(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN (
    'check_released',
    'cash_released',
    'transmitted',
    'closed'
  )),
  notes text,
  signed_voucher_document_id uuid REFERENCES public.documents(id),
  acted_by uuid NOT NULL REFERENCES auth.users(id),
  acted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_release_events_file ON public.release_events(release_file_id);

CREATE TABLE public.ar_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_application_id uuid NOT NULL UNIQUE REFERENCES public.loan_applications(id) ON DELETE CASCADE,
  release_file_id uuid NOT NULL REFERENCES public.release_files(id) ON DELETE CASCADE,
  queued_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER release_files_updated_at
  BEFORE UPDATE ON public.release_files
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- LRA status transitions on loan_applications
CREATE POLICY applications_lra_process ON public.loan_applications
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.has_module_permission('release_lra', 'edit')
      AND status IN ('lra_pending', 'release_signing', 'release_briefing', 'release_ready', 'released')
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR status IN (
      'lra_pending',
      'release_signing',
      'release_briefing',
      'release_ready',
      'released',
      'closed'
    )
  );

CREATE POLICY applications_lra_close ON public.loan_applications
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.has_module_permission('release_lra', 'execute_trigger')
      AND status IN ('release_ready', 'released')
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR status = 'closed'
  );
