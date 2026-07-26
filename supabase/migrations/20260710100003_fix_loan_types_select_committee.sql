-- committeeOverrideAmount()/committeeAdjustPreDecision() need to read
-- loan_types to resolve rates for the new computation snapshot. loan_types
-- select was gated to system_config/intake/computation view only — committee
-- had no grant, so both committee override paths have always failed with
-- "Loan type not found" for a real (non-super-admin) committee account.
CREATE POLICY loan_types_committee_select ON public.loan_types
  FOR SELECT TO authenticated
  USING (public.has_module_permission('committee', 'view'));
