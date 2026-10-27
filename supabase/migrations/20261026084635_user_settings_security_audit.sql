-- Record actual Auth changes in the same transaction. An audit insertion failure
-- aborts the identity change rather than silently losing the security event.
CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.audit_identity_security_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_role uuid;
BEGIN
  -- A trigger is invoked only by an UPDATE of auth.users; it cannot be called as
  -- an RPC. Auth service callbacks may have no end-user JWT. Keep their actor
  -- null rather than claiming an anonymous recovery request was authenticated.
  SELECT ur.role_id INTO v_role FROM public.user_roles ur
    WHERE ur.user_id = v_actor ORDER BY ur.assigned_at DESC LIMIT 1;

  IF OLD.encrypted_password IS DISTINCT FROM NEW.encrypted_password THEN
    INSERT INTO public.audit_events
      (actor_id, actor_role_id, module_slug, action, entity_type, entity_id, after_data)
    VALUES (v_actor, v_role, 'account_settings', 'password_changed', 'user', NEW.id::text,
      jsonb_build_object('source', 'auth_database', 'accountEmail', NEW.email));
  END IF;

  IF OLD.email IS DISTINCT FROM NEW.email THEN
    -- Only the confirmed Auth email is authoritative; pending email_change is
    -- never copied into the profile.
    UPDATE public.profiles SET email = NEW.email WHERE id = NEW.id;
    INSERT INTO public.audit_events
      (actor_id, actor_role_id, module_slug, action, entity_type, entity_id, before_data, after_data)
    VALUES (v_actor, v_role, 'account_settings', 'email_changed', 'user', NEW.id::text,
      jsonb_build_object('email', OLD.email),
      jsonb_build_object('email', NEW.email, 'source', 'auth_database'));
  END IF;

  IF NULLIF(NEW.email_change, '') IS NOT NULL
     AND (OLD.email_change IS DISTINCT FROM NEW.email_change
       OR OLD.email_change_sent_at IS DISTINCT FROM NEW.email_change_sent_at) THEN
    INSERT INTO public.audit_events
      (actor_id, actor_role_id, module_slug, action, entity_type, entity_id, before_data, after_data)
    VALUES (v_actor, v_role, 'account_settings', 'email_change_requested', 'user', NEW.id::text,
      jsonb_build_object('email', NEW.email),
      jsonb_build_object('requestedEmail', NEW.email_change, 'source', 'auth_database'));
  END IF;

  IF NEW.recovery_sent_at IS NOT NULL AND OLD.recovery_sent_at IS DISTINCT FROM NEW.recovery_sent_at THEN
    INSERT INTO public.audit_events
      (actor_id, actor_role_id, module_slug, action, entity_type, entity_id, after_data)
    VALUES (v_actor, v_role, 'account_settings', 'password_reset_requested', 'user', NEW.id::text,
      jsonb_build_object('accountEmail', NEW.email, 'source', 'auth_database'));
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.audit_identity_security_change() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER audit_identity_security_change
  AFTER UPDATE OF encrypted_password, email, email_change, email_change_sent_at, recovery_sent_at
  ON auth.users FOR EACH ROW EXECUTE FUNCTION private.audit_identity_security_change();

-- The app fails closed until transactional security logging is installed.
CREATE OR REPLACE FUNCTION public.settings_security_audit_ready()
RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger t
    JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_catalog.pg_proc p ON p.oid = t.tgfoid
    JOIN pg_catalog.pg_namespace pn ON pn.oid = p.pronamespace
    WHERE n.nspname = 'auth' AND c.relname = 'users'
      AND t.tgname = 'audit_identity_security_change' AND t.tgenabled IN ('O', 'A')
      AND pn.nspname = 'private' AND p.proname = 'audit_identity_security_change'
  );
$$;
REVOKE ALL ON FUNCTION public.settings_security_audit_ready() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.settings_security_audit_ready() TO authenticated;
NOTIFY pgrst, 'reload schema';
