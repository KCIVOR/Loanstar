-- Allow a borrower to delete their own draft application only.
-- No DELETE policy existed on loan_applications before this; child FKs
-- already CASCADE (or SET NULL), so a draft delete is structurally safe.

CREATE POLICY applications_borrower_delete_draft ON public.loan_applications
  FOR DELETE
  USING (
    status = 'draft'
    AND EXISTS (
      SELECT 1 FROM public.borrowers b
      WHERE b.id = loan_applications.borrower_id
        AND b.user_id = auth.uid()
    )
  );
