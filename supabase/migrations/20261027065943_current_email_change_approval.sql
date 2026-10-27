CREATE SCHEMA IF NOT EXISTS private;
CREATE TABLE private.account_email_change_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 token_hash text NOT NULL CHECK (token_hash ~ '^[0-9a-f]{64}$'), old_email text NOT NULL, new_email text NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','superseded','delivery_failed','failed')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), expires_at timestamptz NOT NULL DEFAULT clock_timestamp() + interval '30 minutes'
);
CREATE INDEX account_email_change_user_created ON private.account_email_change_requests(user_id,created_at DESC);
CREATE UNIQUE INDEX account_email_change_one_open ON private.account_email_change_requests(user_id) WHERE status IN ('pending','processing');
ALTER TABLE private.account_email_change_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.account_email_change_requests FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.account_email_change(p_action text,p_user_id uuid,p_request_id uuid DEFAULT NULL,p_token_hash text DEFAULT NULL,p_new_email text DEFAULT NULL,p_old_email text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r private.account_email_change_requests%ROWTYPE; v_email text; v_now timestamptz := clock_timestamp();
BEGIN
 -- Serialize all custom transitions with Auth writes using the same user row lock.
 SELECT lower(trim(u.email)) INTO v_email FROM auth.users u WHERE u.id=p_user_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Email change unavailable'; END IF;
 IF p_action='pending' THEN
  SELECT * INTO r FROM private.account_email_change_requests WHERE user_id=p_user_id AND (status='processing' OR (status='pending' AND expires_at>v_now));
  IF NOT FOUND THEN RETURN NULL; END IF;
 ELSIF p_action='start' THEN
  IF v_email IS NULL OR p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' OR p_old_email IS NULL OR p_new_email IS NULL
    OR p_old_email<>lower(trim(p_old_email)) OR p_new_email<>lower(trim(p_new_email))
    OR p_old_email<>v_email OR p_new_email=p_old_email OR p_new_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_user_id AND is_active)
    OR EXISTS(SELECT 1 FROM private.account_email_change_requests WHERE user_id=p_user_id AND status='processing')
    OR EXISTS(SELECT 1 FROM private.account_email_change_requests WHERE user_id=p_user_id AND created_at>v_now-interval '1 minute')
    OR (SELECT count(*) FROM private.account_email_change_requests WHERE user_id=p_user_id AND created_at>v_now-interval '1 hour')>=5
  THEN RAISE EXCEPTION 'Email change unavailable'; END IF;
  IF EXISTS(SELECT 1 FROM auth.users WHERE id<>p_user_id AND lower(trim(email))=p_new_email)
    OR EXISTS(SELECT 1 FROM auth.identities WHERE user_id<>p_user_id AND lower(trim(identity_data->>'email'))=p_new_email)
  THEN RAISE EXCEPTION 'Email change unavailable'; END IF;
  UPDATE private.account_email_change_requests SET status='superseded' WHERE user_id=p_user_id AND status='pending';
  INSERT INTO private.account_email_change_requests(user_id,token_hash,old_email,new_email,created_at,expires_at)
    VALUES(p_user_id,p_token_hash,p_old_email,p_new_email,v_now,v_now+interval '30 minutes') RETURNING * INTO r;
 ELSE
  SELECT * INTO r FROM private.account_email_change_requests WHERE id=p_request_id AND user_id=p_user_id AND token_hash=p_token_hash FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Email change unavailable'; END IF;
  IF p_action IN ('inspect','claim') THEN
   IF r.status='completed' AND v_email=r.new_email THEN NULL;
   ELSE
    IF r.expires_at<=v_now OR r.old_email<>v_email OR r.status NOT IN ('pending','processing')
      OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_user_id AND is_active)
    THEN RAISE EXCEPTION 'Email change unavailable'; END IF;
    IF p_action='claim' THEN
     IF r.status<>'pending' OR EXISTS(SELECT 1 FROM auth.users WHERE id<>p_user_id AND lower(trim(email))=r.new_email)
      OR EXISTS(SELECT 1 FROM auth.identities WHERE user_id<>p_user_id AND lower(trim(identity_data->>'email'))=r.new_email)
     THEN RAISE EXCEPTION 'Email change unavailable'; END IF;
     UPDATE private.account_email_change_requests SET status='processing' WHERE id=r.id RETURNING * INTO r;
    END IF;
   END IF;
  ELSIF (p_action='delivery_failed' AND r.status='pending') OR (p_action='failed' AND r.status='processing') THEN
   UPDATE private.account_email_change_requests SET status=p_action WHERE id=r.id RETURNING * INTO r;
  ELSE RAISE EXCEPTION 'Email change unavailable'; END IF;
 END IF;
 RETURN jsonb_build_object('id',r.id,'oldEmail',r.old_email,'newEmail',r.new_email,'status',r.status,'expiresAt',r.expires_at);
END $$;
REVOKE ALL ON FUNCTION public.account_email_change(text,uuid,uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.account_email_change(text,uuid,uuid,text,text,text) TO service_role;

CREATE FUNCTION private.guard_current_email_approval() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r private.account_email_change_requests%ROWTYPE;
BEGIN
 IF OLD.email IS NOT DISTINCT FROM NEW.email THEN RETURN NEW; END IF;
 SELECT * INTO r FROM private.account_email_change_requests WHERE user_id=NEW.id AND (status='processing' OR (status='pending' AND expires_at>clock_timestamp())) FOR UPDATE;
 IF FOUND AND (r.status<>'processing' OR lower(trim(OLD.email)) IS DISTINCT FROM r.old_email OR lower(trim(NEW.email)) IS DISTINCT FROM r.new_email
   OR EXISTS(SELECT 1 FROM auth.users WHERE id<>NEW.id AND lower(trim(email))=r.new_email)
   OR EXISTS(SELECT 1 FROM auth.identities WHERE user_id<>NEW.id AND lower(trim(identity_data->>'email'))=r.new_email)) THEN
  RAISE EXCEPTION 'Email change unavailable';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_current_email_approval BEFORE UPDATE OF email ON auth.users FOR EACH ROW EXECUTE FUNCTION private.guard_current_email_approval();
CREATE FUNCTION private.complete_current_email_approval() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r private.account_email_change_requests%ROWTYPE; v_role uuid;
BEGIN
 IF OLD.email IS NOT DISTINCT FROM NEW.email THEN RETURN NEW; END IF;
 UPDATE private.account_email_change_requests SET status='completed' WHERE user_id=NEW.id AND status='processing' AND old_email=lower(trim(OLD.email)) AND new_email=lower(trim(NEW.email)) RETURNING * INTO r;
 IF FOUND THEN
  SELECT role_id INTO v_role FROM public.user_roles WHERE user_id=NEW.id ORDER BY assigned_at DESC LIMIT 1;
  INSERT INTO public.audit_events(actor_id,actor_role_id,module_slug,action,entity_type,entity_id,before_data,after_data)
   VALUES(NEW.id,v_role,'account_settings','email_change_current_completed','user',NEW.id::text,jsonb_build_object('email',r.old_email),jsonb_build_object('email',r.new_email,'source','current_email_approval'));
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER complete_current_email_approval AFTER UPDATE OF email ON auth.users FOR EACH ROW EXECUTE FUNCTION private.complete_current_email_approval();
REVOKE ALL ON FUNCTION private.guard_current_email_approval() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.complete_current_email_approval() FROM PUBLIC,anon,authenticated,service_role;
INSERT INTO public.email_templates(slug,name,subject,body_html) VALUES ('account_email_change_current_approval','Approve account email change','Approve your account email change','<p>A change to your account email was requested. The proposed email is <strong>{{newEmail}}</strong>.</p><p><a href="{{approvalUrl}}">Review and approve email change</a></p><p>This link expires in 30 minutes. If you did not request this, do not approve it.</p>') ON CONFLICT(slug) DO NOTHING;
NOTIFY pgrst,'reload schema';
