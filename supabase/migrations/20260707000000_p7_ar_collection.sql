-- Phase 7: AR masterlist, portfolios, assignments, amortization, payments, DCR, posting, penalties, remedial

CREATE TABLE public.portfolios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  investor_label text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.portfolios (name, investor_label) VALUES
  ('Portfolio A', 'Investor A'),
  ('Portfolio B', 'Investor B');

CREATE TABLE public.masterlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_application_id uuid NOT NULL UNIQUE REFERENCES public.loan_applications(id) ON DELETE CASCADE,
  borrower_id uuid NOT NULL REFERENCES public.borrowers(id) ON DELETE CASCADE,
  release_file_id uuid REFERENCES public.release_files(id) ON DELETE SET NULL,
  computation_id uuid REFERENCES public.computations(id) ON DELETE SET NULL,
  loan_account_no text,
  borrower_no text NOT NULL,
  borrower_name text NOT NULL,
  loan_amount numeric(14,2) NOT NULL,
  principal numeric(14,2) NOT NULL,
  total_loan numeric(14,2) NOT NULL,
  net_released numeric(14,2) NOT NULL,
  monthly_amortization numeric(14,2) NOT NULL,
  terms int NOT NULL,
  first_payment_date date,
  release_date date,
  loan_type_name text,
  manning_agency text,
  vessel_name text,
  portfolio_id uuid REFERENCES public.portfolios(id) ON DELETE SET NULL,
  coverage_ratio numeric(8,4),
  release_path text,
  atm_bank_name text,
  atm_card_last4 text,
  check_transmittal_status text NOT NULL DEFAULT 'pending'
    CHECK (check_transmittal_status IN ('pending', 'transmitted', 'received')),
  check_clearing_status text NOT NULL DEFAULT 'pending'
    CHECK (check_clearing_status IN ('pending', 'clearing', 'cleared')),
  outstanding_balance numeric(14,2) NOT NULL,
  aging_bucket text NOT NULL DEFAULT 'current'
    CHECK (aging_bucket IN ('current', '1-30', '31-60', '61-90', '91+')),
  account_status text NOT NULL DEFAULT 'active'
    CHECK (account_status IN ('active', 'paid', 'default', 'remedial')),
  remedial_flag boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_masterlist_borrower ON public.masterlist(borrower_id);
CREATE INDEX idx_masterlist_portfolio ON public.masterlist(portfolio_id);
CREATE INDEX idx_masterlist_aging ON public.masterlist(aging_bucket);
CREATE INDEX idx_masterlist_status ON public.masterlist(account_status);

CREATE TABLE public.assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  masterlist_id uuid NOT NULL UNIQUE REFERENCES public.masterlist(id) ON DELETE CASCADE,
  collector_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  remedial_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  remedial_assigned_at timestamptz
);

CREATE INDEX idx_assignments_collector ON public.assignments(collector_user_id);
CREATE INDEX idx_assignments_remedial ON public.assignments(remedial_user_id);

CREATE TABLE public.amortization_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  masterlist_id uuid NOT NULL REFERENCES public.masterlist(id) ON DELETE CASCADE,
  installment_no int NOT NULL,
  due_date date NOT NULL,
  amount_due numeric(14,2) NOT NULL,
  penalty_amount numeric(14,2) NOT NULL DEFAULT 0,
  amount_paid numeric(14,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'partial', 'paid', 'overdue')),
  paid_at timestamptz,
  UNIQUE (masterlist_id, installment_no)
);

CREATE INDEX idx_amortization_masterlist ON public.amortization_schedules(masterlist_id);
CREATE INDEX idx_amortization_due ON public.amortization_schedules(due_date);

CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  masterlist_id uuid NOT NULL REFERENCES public.masterlist(id) ON DELETE CASCADE,
  loan_application_id uuid NOT NULL REFERENCES public.loan_applications(id) ON DELETE CASCADE,
  borrower_id uuid NOT NULL REFERENCES public.borrowers(id) ON DELETE CASCADE,
  reference_no text,
  payment_date date NOT NULL,
  amount numeric(14,2) NOT NULL,
  channel text NOT NULL
    CHECK (channel IN ('bank_deposit', 'check', 'pos_cash')),
  storage_path text,
  file_name text,
  status text NOT NULL DEFAULT 'pending_verification'
    CHECK (status IN ('pending_verification', 'confirmed', 'rejected', 'posted')),
  uploaded_by uuid NOT NULL REFERENCES auth.users(id),
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_payments_masterlist ON public.payments(masterlist_id);
CREATE INDEX idx_payments_status ON public.payments(status);

CREATE TABLE public.dcr (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collector_user_id uuid NOT NULL REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted', 'reconciled', 'rejected')),
  submitted_at timestamptz,
  reconciled_by uuid REFERENCES auth.users(id),
  reconciled_at timestamptz,
  deposit_reference text,
  deposit_proof_path text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.dcr_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dcr_id uuid NOT NULL REFERENCES public.dcr(id) ON DELETE CASCADE,
  payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE RESTRICT,
  amount numeric(14,2) NOT NULL,
  UNIQUE (dcr_id, payment_id)
);

CREATE TABLE public.postings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dcr_id uuid NOT NULL REFERENCES public.dcr(id) ON DELETE RESTRICT,
  payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE RESTRICT,
  masterlist_id uuid NOT NULL REFERENCES public.masterlist(id) ON DELETE RESTRICT,
  amortization_schedule_id uuid REFERENCES public.amortization_schedules(id) ON DELETE SET NULL,
  amount numeric(14,2) NOT NULL,
  posted_by uuid NOT NULL REFERENCES auth.users(id),
  posted_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.penalties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  masterlist_id uuid NOT NULL REFERENCES public.masterlist(id) ON DELETE CASCADE,
  amortization_schedule_id uuid REFERENCES public.amortization_schedules(id) ON DELETE SET NULL,
  amount numeric(14,2) NOT NULL,
  rate_applied numeric(8,6) NOT NULL,
  calculated_at timestamptz NOT NULL DEFAULT now(),
  notes text
);

CREATE TABLE public.remedial_turnovers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  masterlist_id uuid NOT NULL REFERENCES public.masterlist(id) ON DELETE CASCADE,
  from_collector_id uuid REFERENCES auth.users(id),
  to_remedial_user_id uuid REFERENCES auth.users(id),
  confirmed_by uuid REFERENCES auth.users(id),
  turnover_reason text NOT NULL DEFAULT 'aging_91_plus',
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.collector_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  masterlist_id uuid NOT NULL REFERENCES public.masterlist(id) ON DELETE CASCADE,
  collector_user_id uuid NOT NULL REFERENCES auth.users(id),
  contact_type text NOT NULL
    CHECK (contact_type IN ('call', 'sms', 'email', 'visit')),
  notes text,
  callback_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER masterlist_updated_at
  BEFORE UPDATE ON public.masterlist
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Extend ar_queue with processing marker
ALTER TABLE public.ar_queue
  ADD COLUMN IF NOT EXISTS processed_at timestamptz,
  ADD COLUMN IF NOT EXISTS masterlist_id uuid REFERENCES public.masterlist(id) ON DELETE SET NULL;
