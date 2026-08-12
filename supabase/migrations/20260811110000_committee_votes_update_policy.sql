-- committee_votes had INSERT + SELECT RLS policies but no UPDATE policy.
-- castCommitteeVote() upserts on (loan_application_id, voter_id), so changing
-- an already-cast vote hits the ON CONFLICT DO UPDATE path, which RLS blocks
-- entirely with no UPDATE policy present ("new row violates row-level
-- security policy (USING expression)"). Mirrors committee_votes_insert's
-- WITH CHECK logic for both USING and WITH CHECK.
CREATE POLICY committee_votes_update ON committee_votes
FOR UPDATE
TO authenticated
USING (
  is_super_admin() OR (
    has_module_permission('committee', 'edit')
    AND voter_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM loan_applications la
      WHERE la.id = committee_votes.loan_application_id
        AND la.status = 'for_approval'
    )
  )
)
WITH CHECK (
  is_super_admin() OR (
    has_module_permission('committee', 'edit')
    AND voter_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM loan_applications la
      WHERE la.id = committee_votes.loan_application_id
        AND la.status = 'for_approval'
    )
  )
);
