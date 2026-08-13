-- Phase 5: unique borrower emails (case-insensitive) + claim support.
-- De-dupe first: keep row with user_id, else newest; repoint FKs; delete losers.

DO $$
DECLARE
  loser RECORD;
  keeper_id uuid;
BEGIN
  FOR loser IN
    SELECT lower(email) AS email_key
    FROM public.borrowers
    GROUP BY lower(email)
    HAVING COUNT(*) > 1
  LOOP
    SELECT id INTO keeper_id
    FROM public.borrowers
    WHERE lower(email) = loser.email_key
    ORDER BY (user_id IS NOT NULL) DESC, created_at DESC NULLS LAST, id DESC
    LIMIT 1;

    UPDATE public.loan_applications
    SET borrower_id = keeper_id
    WHERE borrower_id IN (
      SELECT id FROM public.borrowers
      WHERE lower(email) = loser.email_key AND id <> keeper_id
    );

    UPDATE public.documents
    SET borrower_id = keeper_id
    WHERE borrower_id IN (
      SELECT id FROM public.borrowers
      WHERE lower(email) = loser.email_key AND id <> keeper_id
    );

    UPDATE public.masterlist
    SET borrower_id = keeper_id
    WHERE borrower_id IN (
      SELECT id FROM public.borrowers
      WHERE lower(email) = loser.email_key AND id <> keeper_id
    );

    UPDATE public.leads
    SET borrower_id = keeper_id
    WHERE borrower_id IN (
      SELECT id FROM public.borrowers
      WHERE lower(email) = loser.email_key AND id <> keeper_id
    );

    UPDATE public.payments
    SET borrower_id = keeper_id
    WHERE borrower_id IN (
      SELECT id FROM public.borrowers
      WHERE lower(email) = loser.email_key AND id <> keeper_id
    );

    DELETE FROM public.borrowers
    WHERE lower(email) = loser.email_key AND id <> keeper_id;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS borrowers_email_key
  ON public.borrowers (lower(email));

INSERT INTO public.email_templates (slug, name, subject, body_html)
VALUES (
  'borrower_email_confirm',
  'Borrower Email Confirmation',
  'Confirm your LoanStar account',
  '<p>Hi {{borrower_name}},</p><p>Confirm your email to finish creating your LoanStar borrower account:</p><p><a href="{{confirm_url}}">Confirm email</a></p><p>If you did not register, you can ignore this message.</p>'
)
ON CONFLICT (slug) DO NOTHING;
