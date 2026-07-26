-- Follow-up to 20260723000000_borrower_draft_submit_policy.sql.
--
-- Discovered by live impersonation testing (not theoretical): Postgres
-- combines every UPDATE policy's WITH CHECK for a table with OR, GLOBALLY --
-- not paired with whichever policy's USING clause happened to grant access
-- to the old row. Several existing policies on loan_applications have
-- WITH CHECK clauses that only check the new status value, with no
-- accompanying permission/ownership condition in that same clause (e.g.
-- applications_committee_action: `is_super_admin() OR status = ANY([...]))`
-- -- correct only because no policy's USING previously let a borrower reach
-- a row at all. applications_borrower_draft_submit's USING now lets a
-- borrower reach their own 'draft' row, which means the OR-combined
-- WITH CHECK from every OTHER policy becomes reachable too -- e.g. a
-- borrower could flip their own draft straight to 'approved' or 'denied',
-- since those policies' WITH CHECK never re-checks who is asking.
--
-- Verified via SET LOCAL ROLE authenticated impersonation in a rolled-back
-- transaction: draft -> submitted and draft -> approved both succeeded
-- before this guard existed.
--
-- Fix: a BEFORE UPDATE trigger, which sees OLD and NEW directly and closes
-- the gap unconditionally, regardless of which RLS policy's WITH CHECK
-- fired. This mirrors the existing guard_template_version_immutability
-- pattern already used in this codebase for the same class of problem.

-- SECURITY INVOKER (the default, matching guard_template_version_immutability /
-- prevent_signature_mutation / prevent_finalized_generated_doc_mutation /
-- prevent_audit_mutation): this function only reads OLD/NEW and calls
-- is_super_admin(), which is itself SECURITY DEFINER and self-elevates.
-- No reason for this function to also run with elevated privilege.
CREATE OR REPLACE FUNCTION public.guard_draft_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'draft'
     AND NEW.status <> 'draft'
     AND NEW.status <> 'documents_pending'
     AND NOT public.is_super_admin()
  THEN
    RAISE EXCEPTION 'Draft applications may only move to documents_pending (submit), got %', NEW.status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_draft_status_transition
BEFORE UPDATE ON public.loan_applications
FOR EACH ROW
EXECUTE FUNCTION public.guard_draft_status_transition();
