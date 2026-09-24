-- UAT: Clear Committee Hold — expand committee_actions.action to allow a
-- distinct, audited "clear_hold" event that transitions committee_hold ->
-- for_approval. Forward-only: drops and recreates the existing inline CHECK
-- constraint (Postgres auto-generated name committee_actions_action_check,
-- originally defined in 20260706150000_p5_committee_negotiation.sql) with
-- one additional permitted value. No data rewrite; no other table, policy,
-- or function touched. Does not affect CSA's separate file_holds/on_hold
-- mechanism or committee_votes.

ALTER TABLE public.committee_actions
  DROP CONSTRAINT committee_actions_action_check;

ALTER TABLE public.committee_actions
  ADD CONSTRAINT committee_actions_action_check
  CHECK (action IN ('approve', 'deny', 'revisit', 'hold', 'clear_hold'));
