-- Borrowers may update their own negotiation row when submitting a counter-offer.
-- Staff write policy (negotiation/committee edit) does not cover borrower_portal.
CREATE POLICY negotiations_borrower_counter ON public.negotiations
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.loan_applications la
      JOIN public.borrowers b ON b.id = la.borrower_id
      WHERE la.id = loan_application_id
        AND b.user_id = auth.uid()
        AND la.status IN ('approved', 'awaiting_confirmation', 'negotiating_terms')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.loan_applications la
      JOIN public.borrowers b ON b.id = la.borrower_id
      WHERE la.id = loan_application_id
        AND b.user_id = auth.uid()
        AND la.status IN ('approved', 'awaiting_confirmation', 'negotiating_terms')
    )
  );
