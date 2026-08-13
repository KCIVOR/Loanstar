-- Phase 1 of borrower-draft-submit-plan.md
--
-- `applications_update` (the existing borrower self-update policy) gates on
-- is_csa_editable_status(status), which does NOT include 'draft'. That's
-- intentional — 'draft' is not a CSA-editable status. But it also means a
-- borrower cannot update their OWN draft row (including flipping it to
-- documents_pending on submit), since RLS silently blocks the write.
--
-- Rather than add 'draft' to is_csa_editable_status() (which is shared by six
-- policies, including CSA edit/endorse rights — that would incorrectly grant
-- CSA visibility/edit over drafts), this adds a narrow, additive policy:
-- the application's own borrower may update it only while status='draft',
-- and only into 'draft' (saving edits) or 'documents_pending' (submitting).
-- Postgres RLS combines multiple permissive policies for the same command
-- with OR, so this is purely additive — it cannot narrow any existing grant.

CREATE POLICY applications_borrower_draft_submit
ON public.loan_applications
FOR UPDATE
USING (
  status = 'draft'
  AND EXISTS (
    SELECT 1 FROM public.borrowers b
    WHERE b.id = loan_applications.borrower_id
      AND b.user_id = auth.uid()
  )
)
WITH CHECK (
  status IN ('draft', 'documents_pending')
  AND EXISTS (
    SELECT 1 FROM public.borrowers b
    WHERE b.id = loan_applications.borrower_id
      AND b.user_id = auth.uid()
  )
);
