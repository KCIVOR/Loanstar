-- Collection flow alignment: 30-day penalty rollover status + reminder email template.
-- collector_contacts already has the right shape/RLS (callback_at, contact_type) from P7 —
-- this only adds what's actually new.

ALTER TABLE public.amortization_schedules
  ADD COLUMN rolled_at timestamptz,
  ADD COLUMN rolled_into_installment_no int;

-- Widen the status check to add 'rolled' without assuming the auto-generated
-- constraint name.
DO $$
DECLARE
  con_name text;
BEGIN
  SELECT conname INTO con_name
  FROM pg_constraint
  WHERE conrelid = 'public.amortization_schedules'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%status%IN%';

  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.amortization_schedules DROP CONSTRAINT %I', con_name);
  END IF;
END $$;

ALTER TABLE public.amortization_schedules
  ADD CONSTRAINT amortization_schedules_status_check
  CHECK (status IN ('pending', 'partial', 'paid', 'overdue', 'rolled'));

INSERT INTO public.email_templates (slug, name, subject, body_html) VALUES
  (
    'payment_due_reminder',
    'Payment Due Reminder',
    'LoanStar — Upcoming Payment Reminder',
    '<p>Dear {{borrower_name}},</p><p>This is a reminder that your loan payment of <b>₱{{amount_due}}</b> for account <b>{{loan_account_no}}</b> is due on <b>{{due_date}}</b>.</p><p>Please settle this on or before the due date to avoid penalties.</p><p>— LoanStar Collection</p>'
  )
ON CONFLICT (slug) DO NOTHING;
