-- Phase 2: Borrowers, applications, documents, signatures, leads

CREATE SEQUENCE public.borrower_no_seq START WITH 300001;

CREATE OR REPLACE FUNCTION public.generate_borrower_no()
RETURNS text
LANGUAGE sql
AS $$
  SELECT 'BN' || lpad(nextval('public.borrower_no_seq')::text, 6, '0');
$$;

CREATE TABLE public.borrowers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  borrower_no text NOT NULL UNIQUE DEFAULT public.generate_borrower_no(),
  email text NOT NULL,
  first_name text NOT NULL,
  middle_name text,
  last_name text NOT NULL,
  suffix text,
  date_of_birth date,
  place_of_birth text,
  citizenship text DEFAULT 'Filipino',
  civil_status text,
  gender text,
  mobile_phone text,
  landline text,
  present_address jsonb NOT NULL DEFAULT '{}'::jsonb,
  permanent_address jsonb NOT NULL DEFAULT '{}'::jsonb,
  manning_agency jsonb NOT NULL DEFAULT '{}'::jsonb,
  financial jsonb NOT NULL DEFAULT '{}'::jsonb,
  allottee jsonb NOT NULL DEFAULT '{}'::jsonb,
  pic_work jsonb NOT NULL DEFAULT '{}'::jsonb,
  dependents jsonb NOT NULL DEFAULT '[]'::jsonb,
  references_data jsonb NOT NULL DEFAULT '[]'::jsonb,
  profile_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.loan_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  borrower_id uuid NOT NULL REFERENCES public.borrowers(id) ON DELETE CASCADE,
  application_no text UNIQUE,
  status text NOT NULL DEFAULT 'documents_pending',
  status_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  blocker text,
  agent_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  is_reloan boolean NOT NULL DEFAULT false,
  parent_application_id uuid REFERENCES public.loan_applications(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_loan_applications_borrower ON public.loan_applications(borrower_id);
CREATE INDEX idx_loan_applications_status ON public.loan_applications(status);

CREATE TABLE public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  borrower_name text NOT NULL,
  business_name text,
  borrower_id uuid REFERENCES public.borrowers(id) ON DELETE SET NULL,
  application_id uuid REFERENCES public.loan_applications(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_leads_agent ON public.leads(agent_user_id);

CREATE TABLE public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  borrower_id uuid NOT NULL REFERENCES public.borrowers(id) ON DELETE CASCADE,
  loan_application_id uuid REFERENCES public.loan_applications(id) ON DELETE CASCADE,
  document_type_id uuid NOT NULL REFERENCES public.document_types(id) ON DELETE RESTRICT,
  stage text NOT NULL,
  storage_path text,
  file_name text,
  mime_type text,
  file_size bigint,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'uploaded', 'confirmed')),
  uploaded_by uuid REFERENCES auth.users(id),
  confirmed_by uuid REFERENCES auth.users(id),
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (loan_application_id, document_type_id, stage)
);

CREATE INDEX idx_documents_application ON public.documents(loan_application_id);
CREATE INDEX idx_documents_borrower ON public.documents(borrower_id);

CREATE TABLE public.signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE RESTRICT,
  signer_id uuid NOT NULL REFERENCES auth.users(id),
  signed_at timestamptz NOT NULL DEFAULT now(),
  document_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.prevent_signature_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'signatures are immutable';
END;
$$;

CREATE TRIGGER signatures_no_update
  BEFORE UPDATE OR DELETE ON public.signatures
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_signature_mutation();

CREATE TRIGGER borrowers_updated_at
  BEFORE UPDATE ON public.borrowers
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER loan_applications_updated_at
  BEFORE UPDATE ON public.loan_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER documents_updated_at
  BEFORE UPDATE ON public.documents
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Checklist status for agents (no storage paths)
CREATE OR REPLACE FUNCTION public.get_checklist_flags(p_application_id uuid)
RETURNS TABLE (
  document_type_id uuid,
  document_type_slug text,
  document_type_name text,
  stage text,
  is_required boolean,
  is_optional_flag boolean,
  sort_order int,
  completion_status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    dt.id,
    dt.slug,
    dt.name,
    sc.stage,
    sc.is_required,
    sc.is_optional_flag,
    sc.sort_order,
    CASE
      WHEN d.status = 'confirmed' THEN 'complete'
      WHEN d.status = 'uploaded' THEN 'uploaded'
      ELSE 'incomplete'
    END
  FROM public.stage_checklists sc
  JOIN public.document_types dt ON dt.id = sc.document_type_id
  LEFT JOIN public.documents d
    ON d.document_type_id = dt.id
    AND d.loan_application_id = p_application_id
    AND d.stage = sc.stage
  WHERE sc.stage = 'intake'
  ORDER BY sc.sort_order;
$$;
