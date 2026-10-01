-- Audit trail hardening (docs/audit-trail-complete-logging-implementation-plan.md, Phase 1).
--
-- Writes go through the service role only (src/lib/audit/writer.ts,
-- src/app/api/borrower/register/route.ts). The authenticated INSERT policy was
-- unused by the app and let any signed-in user forge rows under their own id.
DROP POLICY IF EXISTS audit_insert ON public.audit_events;

-- Loan an event belongs to, when it is stored on the row itself. Child-entity
-- rows (release_file, masterlist, …) are resolved to their loan at read time.
CREATE OR REPLACE FUNCTION public.audit_event_application_id(
  p_entity_type text, p_entity_id text, p_after jsonb, p_before jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT COALESCE(
    CASE WHEN p_entity_type IN ('loan_application', 'application') THEN p_entity_id END,
    p_after ->> 'applicationId',
    p_after ->> 'loanApplicationId',
    p_before ->> 'applicationId'
  )
$$;

CREATE INDEX IF NOT EXISTS idx_audit_events_actor_created
  ON public.audit_events (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_module_created
  ON public.audit_events (module_slug, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_entity
  ON public.audit_events (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_application
  ON public.audit_events (
    public.audit_event_application_id(entity_type, entity_id, after_data, before_data)
  );
