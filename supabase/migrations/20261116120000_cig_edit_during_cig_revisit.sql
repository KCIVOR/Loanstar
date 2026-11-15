-- Let CIG edit while Committee has returned the file to CIG.
--
-- A Committee "Notice to Revisit" routed to CIG moves the application to
-- `for_revision` and opens a `revisit_notices` row (route_to = 'cig',
-- resolved_at IS NULL). CIG's write policies only allowed
-- `status = 'for_verification'`, so CIG could not correct anything. Each policy
-- below keeps its name, command, roles and permission checks and only widens
-- the status test to also accept `for_revision` WITH an open CIG-routed notice.
-- A file returned to CSA, or with no open notice, stays locked for CIG.
-- Forward, return and cancel policies are intentionally not touched.

DROP POLICY IF EXISTS verifications_write ON public.verifications;
CREATE POLICY verifications_write ON public.verifications
  FOR ALL TO authenticated
  USING (
    is_super_admin()
    OR (
      has_module_permission('verification', 'edit')
      AND EXISTS (
        SELECT 1 FROM public.loan_applications la
        WHERE la.id = verifications.loan_application_id
          AND (
            la.status = 'for_verification'
            OR (
              la.status = 'for_revision'
              AND EXISTS (
                SELECT 1 FROM public.revisit_notices rn
                WHERE rn.loan_application_id = la.id
                  AND rn.route_to = 'cig'
                  AND rn.resolved_at IS NULL
              )
            )
          )
      )
    )
  )
  WITH CHECK (
    is_super_admin()
    OR (
      has_module_permission('verification', 'edit')
      AND EXISTS (
        SELECT 1 FROM public.loan_applications la
        WHERE la.id = verifications.loan_application_id
          AND (
            la.status = 'for_verification'
            OR (
              la.status = 'for_revision'
              AND EXISTS (
                SELECT 1 FROM public.revisit_notices rn
                WHERE rn.loan_application_id = la.id
                  AND rn.route_to = 'cig'
                  AND rn.resolved_at IS NULL
              )
            )
          )
      )
    )
  );

DROP POLICY IF EXISTS checks_recorded_cig_write ON public.checks_recorded;
CREATE POLICY checks_recorded_cig_write ON public.checks_recorded
  FOR ALL TO authenticated
  USING (
    is_super_admin()
    OR (
      has_module_permission('verification', 'edit')
      AND stage = 'cig'
      AND EXISTS (
        SELECT 1 FROM public.loan_applications la
        WHERE la.id = checks_recorded.loan_application_id
          AND (
            la.status = 'for_verification'
            OR (
              la.status = 'for_revision'
              AND EXISTS (
                SELECT 1 FROM public.revisit_notices rn
                WHERE rn.loan_application_id = la.id
                  AND rn.route_to = 'cig'
                  AND rn.resolved_at IS NULL
              )
            )
          )
      )
    )
  )
  WITH CHECK (
    is_super_admin()
    OR (
      has_module_permission('verification', 'edit')
      AND stage = 'cig'
      AND EXISTS (
        SELECT 1 FROM public.loan_applications la
        WHERE la.id = checks_recorded.loan_application_id
          AND (
            la.status = 'for_verification'
            OR (
              la.status = 'for_revision'
              AND EXISTS (
                SELECT 1 FROM public.revisit_notices rn
                WHERE rn.loan_application_id = la.id
                  AND rn.route_to = 'cig'
                  AND rn.resolved_at IS NULL
              )
            )
          )
      )
    )
  );

DROP POLICY IF EXISTS borrowers_cig_update ON public.borrowers;
CREATE POLICY borrowers_cig_update ON public.borrowers
  FOR UPDATE TO authenticated
  USING (
    is_super_admin()
    OR (
      has_module_permission('intake', 'edit')
      AND EXISTS (
        SELECT 1 FROM public.loan_applications la
        WHERE la.borrower_id = borrowers.id
          AND (
            la.status = 'for_verification'
            OR (
              la.status = 'for_revision'
              AND EXISTS (
                SELECT 1 FROM public.revisit_notices rn
                WHERE rn.loan_application_id = la.id
                  AND rn.route_to = 'cig'
                  AND rn.resolved_at IS NULL
              )
            )
          )
      )
    )
  )
  WITH CHECK (
    is_super_admin()
    OR (
      has_module_permission('intake', 'edit')
      AND EXISTS (
        SELECT 1 FROM public.loan_applications la
        WHERE la.borrower_id = borrowers.id
          AND (
            la.status = 'for_verification'
            OR (
              la.status = 'for_revision'
              AND EXISTS (
                SELECT 1 FROM public.revisit_notices rn
                WHERE rn.loan_application_id = la.id
                  AND rn.route_to = 'cig'
                  AND rn.resolved_at IS NULL
              )
            )
          )
      )
    )
  );

DROP POLICY IF EXISTS applications_cig_borrower_edit ON public.loan_applications;
CREATE POLICY applications_cig_borrower_edit ON public.loan_applications
  FOR UPDATE TO authenticated
  USING (
    is_super_admin()
    OR (
      has_module_permission('intake', 'edit')
      AND (
        status = 'for_verification'
        OR (
          status = 'for_revision'
          AND EXISTS (
            SELECT 1 FROM public.revisit_notices rn
            WHERE rn.loan_application_id = loan_applications.id
              AND rn.route_to = 'cig'
              AND rn.resolved_at IS NULL
          )
        )
      )
    )
  )
  WITH CHECK (
    is_super_admin()
    OR status = 'for_verification'
    OR (
      status = 'for_revision'
      AND EXISTS (
        SELECT 1 FROM public.revisit_notices rn
        WHERE rn.loan_application_id = loan_applications.id
          AND rn.route_to = 'cig'
          AND rn.resolved_at IS NULL
      )
    )
  );
