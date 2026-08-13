-- Recovered 2026-08-15: this migration was applied live (tracked as
-- 20260723024640_borrower_draft_transition_guard_drop_secdef) but the local
-- .sql file was never committed to the repo. Recovered byte-exact from
-- supabase_migrations.schema_migrations.statements on the live project.
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
