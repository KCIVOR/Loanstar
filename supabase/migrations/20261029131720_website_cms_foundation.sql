-- Public website CMS only. No existing business/Auth policies or routines change.
CREATE TABLE public.website_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  revision_no bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  schema_version integer NOT NULL DEFAULT 1 CHECK (schema_version=1),
  content jsonb NOT NULL CHECK (jsonb_typeof(content)='object'),
  content_hash text NOT NULL,
  operation text NOT NULL CHECK (operation IN ('bootstrap','publish','restore')),
  publication_request_id uuid UNIQUE,
  request_fingerprint text,
  restored_from_revision_id uuid REFERENCES public.website_revisions(id) ON DELETE RESTRICT,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  change_summary text NOT NULL DEFAULT '' CHECK (length(change_summary)<=500)
);
CREATE INDEX website_revision_created ON public.website_revisions(created_at DESC);
CREATE TABLE public.website_drafts (
  site_key text PRIMARY KEY CHECK (site_key='main'),
  schema_version integer NOT NULL DEFAULT 1 CHECK (schema_version=1),
  content jsonb NOT NULL CHECK (jsonb_typeof(content)='object'),
  lock_version bigint NOT NULL DEFAULT 0 CHECK (lock_version>=0),
  base_revision_id uuid NOT NULL REFERENCES public.website_revisions(id) ON DELETE RESTRICT,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.website_publications (
  site_key text PRIMARY KEY CHECK (site_key='main'),
  revision_id uuid NOT NULL REFERENCES public.website_revisions(id) ON DELETE RESTRICT,
  schema_version integer NOT NULL DEFAULT 1 CHECK (schema_version=1),
  public_content jsonb NOT NULL CHECK (jsonb_typeof(public_content)='object'),
  published_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.website_assets (
  id uuid PRIMARY KEY,
  private_path text NOT NULL UNIQUE,
  public_path text UNIQUE,
  mime_type text NOT NULL CHECK (mime_type IN ('image/png','image/jpeg','image/webp')),
  byte_size bigint NOT NULL CHECK (byte_size>0 AND byte_size<=5242880),
  width integer NOT NULL CHECK (width>0),
  height integer NOT NULL CHECK (height>0),
  checksum text NOT NULL CHECK (checksum ~ '^[a-f0-9]{64}$'),
  state text NOT NULL DEFAULT 'private' CHECK (state IN ('private','prepared')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (width::bigint*height::bigint<=16000000),
  CHECK ((state='private' AND public_path IS NULL) OR (state='prepared' AND public_path IS NOT NULL)),
  CHECK (private_path = id::text || '/' || checksum || CASE mime_type WHEN 'image/png' THEN '.png' WHEN 'image/jpeg' THEN '.jpg' ELSE '.webp' END),
  CHECK (public_path IS NULL OR public_path=private_path)
);
CREATE TABLE public.website_revision_assets (
  revision_id uuid NOT NULL REFERENCES public.website_revisions(id) ON DELETE RESTRICT,
  asset_id uuid NOT NULL REFERENCES public.website_assets(id) ON DELETE RESTRICT,
  PRIMARY KEY (revision_id,asset_id)
);
CREATE INDEX website_revision_asset_lookup ON public.website_revision_assets(asset_id);

ALTER TABLE public.website_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_revision_assets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.website_revisions,public.website_drafts,public.website_publications,public.website_assets,public.website_revision_assets FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.website_publications TO anon,authenticated;
CREATE POLICY website_published_read ON public.website_publications FOR SELECT TO anon,authenticated USING (site_key='main');
GRANT ALL ON public.website_revisions,public.website_drafts,public.website_publications,public.website_assets,public.website_revision_assets TO service_role;
GRANT USAGE,SELECT ON SEQUENCE public.website_revisions_revision_no_seq TO service_role;

CREATE FUNCTION public.website_guard_revision() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF TG_OP='UPDATE' AND OLD.created_by IS NOT NULL AND NEW.created_by IS NULL
    AND (to_jsonb(OLD)-'created_by')=(to_jsonb(NEW)-'created_by') THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Website revisions are immutable';
END $$;
CREATE TRIGGER website_revision_immutable BEFORE UPDATE OR DELETE ON public.website_revisions FOR EACH ROW EXECUTE FUNCTION public.website_guard_revision();
CREATE FUNCTION public.website_guard_asset() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Website asset deletion is disabled'; END IF;
  IF OLD.state='prepared' AND (to_jsonb(OLD)-'created_by') IS DISTINCT FROM (to_jsonb(NEW)-'created_by') THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Prepared website assets are immutable';
  END IF;
  IF NEW.id<>OLD.id OR NEW.private_path<>OLD.private_path OR NEW.checksum<>OLD.checksum OR NEW.mime_type<>OLD.mime_type
    OR NEW.width<>OLD.width OR NEW.height<>OLD.height OR NEW.byte_size<>OLD.byte_size THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Website asset identity is immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER website_asset_immutable BEFORE UPDATE OR DELETE ON public.website_assets FOR EACH ROW EXECUTE FUNCTION public.website_guard_asset();

CREATE FUNCTION public.website_check_content(p_content jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT coalesce(jsonb_typeof(p_content)='object' AND p_content->>'schemaVersion'='1'
    AND jsonb_typeof(p_content->'site')='object'
    AND jsonb_typeof(p_content->'landing')='object'
    AND jsonb_typeof(p_content->'login')='object'
    AND jsonb_typeof(p_content->'register')='object'
    AND octet_length(p_content::text)<=262144,false);
$$;
ALTER TABLE public.website_drafts ADD CONSTRAINT website_draft_content CHECK (public.website_check_content(content));
ALTER TABLE public.website_revisions ADD CONSTRAINT website_revision_content CHECK (public.website_check_content(content));
ALTER TABLE public.website_publications ADD CONSTRAINT website_public_content CHECK (public.website_check_content(public_content->'content') AND jsonb_typeof(public_content->'assets')='array');

CREATE FUNCTION public.website_require_actor(p_actor uuid,p_publish boolean DEFAULT false,p_action text DEFAULT 'edit') RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF p_actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND is_active)
    OR NOT (CASE WHEN p_publish THEN public.is_super_admin(p_actor)
      ELSE public.has_module_permission('website_content',p_action,p_actor) END) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Website permission denied';
  END IF;
END $$;
CREATE FUNCTION public.website_asset_ids(p_content jsonb) RETURNS SETOF uuid
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT DISTINCT value::uuid FROM (VALUES (p_content#>>'{site,logoAssetId}'),(p_content#>>'{site,iconAssetId}')) AS ids(value) WHERE value IS NOT NULL;
$$;
CREATE FUNCTION public.website_projection(p_content jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v_assets jsonb;
BEGIN
  IF NOT public.website_check_content(p_content) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid website content'; END IF;
  IF EXISTS(SELECT 1 FROM public.website_asset_ids(p_content) i LEFT JOIN public.website_assets a ON a.id=i
    WHERE a.id IS NULL OR a.state<>'prepared' OR NOT EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='website-public' AND o.name=a.public_path)) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Published website media is missing';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'publicPath',a.public_path,'mimeType',a.mime_type,'width',a.width,'height',a.height) ORDER BY a.id),'[]'::jsonb)
    INTO v_assets FROM public.website_assets a WHERE a.id IN (SELECT public.website_asset_ids(p_content));
  RETURN jsonb_build_object('content',p_content,'assets',v_assets);
END $$;
CREATE FUNCTION public.website_write_audit(p_actor uuid,p_action text,p_entity text,p_data jsonb) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  INSERT INTO public.audit_events(actor_id,module_slug,action,entity_type,entity_id,after_data)
    VALUES(p_actor,'website_content',p_action,'website',p_entity,p_data);
END $$;

CREATE FUNCTION public.website_save_draft(p_actor uuid,p_expected_version bigint,p_content jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE d public.website_drafts%ROWTYPE;
BEGIN
  PERFORM public.website_require_actor(p_actor);
  SELECT * INTO STRICT d FROM public.website_drafts WHERE site_key='main' FOR UPDATE;
  IF p_expected_version IS NULL OR d.lock_version<>p_expected_version THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Website draft changed; reload before saving'; END IF;
  IF NOT public.website_check_content(p_content) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid website content'; END IF;
  IF EXISTS(SELECT 1 FROM public.website_asset_ids(p_content) i WHERE NOT EXISTS(SELECT 1 FROM public.website_assets a WHERE a.id=i)) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Unknown website asset';
  END IF;
  UPDATE public.website_drafts SET content=p_content,lock_version=lock_version+1,updated_by=p_actor,updated_at=now() WHERE site_key='main' RETURNING * INTO d;
  PERFORM public.website_write_audit(p_actor,'website_draft_saved','main',jsonb_build_object('version',d.lock_version));
  RETURN to_jsonb(d);
END $$;
CREATE FUNCTION public.website_reconcile_draft(p_actor uuid,p_expected_version bigint,p_expected_live uuid,p_mode text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE d public.website_drafts%ROWTYPE; l public.website_publications%ROWTYPE;
BEGIN
  PERFORM public.website_require_actor(p_actor);
  SELECT * INTO STRICT d FROM public.website_drafts WHERE site_key='main' FOR UPDATE;
  SELECT * INTO STRICT l FROM public.website_publications WHERE site_key='main' FOR UPDATE;
  IF p_expected_version IS NULL OR p_expected_live IS NULL OR d.lock_version<>p_expected_version OR l.revision_id<>p_expected_live THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Website changed; reload before reconciling'; END IF;
  IF p_mode IS NULL OR p_mode NOT IN ('reset','rebase') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid reconcile mode'; END IF;
  UPDATE public.website_drafts SET content=CASE WHEN p_mode='reset' THEN l.public_content->'content' ELSE content END,
    base_revision_id=l.revision_id,lock_version=lock_version+1,updated_by=p_actor,updated_at=now() WHERE site_key='main' RETURNING * INTO d;
  PERFORM public.website_write_audit(p_actor,'website_draft_reconciled','main',jsonb_build_object('version',d.lock_version,'mode',p_mode,'revisionId',l.revision_id));
  RETURN to_jsonb(d);
END $$;

CREATE FUNCTION public.website_publish(p_actor uuid,p_expected_version bigint,p_expected_live uuid,p_request_id uuid,p_summary text DEFAULT '') RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE d public.website_drafts%ROWTYPE; l public.website_publications%ROWTYPE; r public.website_revisions%ROWTYPE;
  v_fingerprint text; v_projection jsonb;
BEGIN
  PERFORM public.website_require_actor(p_actor,true);
  IF p_request_id IS NULL OR p_expected_live IS NULL OR p_expected_version IS NULL OR p_summary IS NULL OR length(p_summary)>500 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid publication request'; END IF;
  v_fingerprint:=jsonb_build_object('operation','publish','actor',p_actor,'version',p_expected_version,'live',p_expected_live,'summary',p_summary)::text;
  SELECT * INTO r FROM public.website_revisions WHERE publication_request_id=p_request_id;
  IF FOUND THEN
    IF r.request_fingerprint<>v_fingerprint THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Publication request ID reused'; END IF;
    RETURN to_jsonb(r);
  END IF;
  SELECT * INTO STRICT d FROM public.website_drafts WHERE site_key='main' FOR UPDATE;
  SELECT * INTO STRICT l FROM public.website_publications WHERE site_key='main' FOR UPDATE;
  SELECT * INTO r FROM public.website_revisions WHERE publication_request_id=p_request_id;
  IF FOUND THEN
    IF r.request_fingerprint<>v_fingerprint THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Publication request ID reused'; END IF;
    RETURN to_jsonb(r);
  END IF;
  IF d.lock_version<>p_expected_version OR l.revision_id<>p_expected_live OR d.base_revision_id<>l.revision_id THEN
    RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Website changed; reconcile and reload before publishing';
  END IF;
  v_projection:=public.website_projection(d.content);
  INSERT INTO public.website_revisions(content,content_hash,operation,publication_request_id,request_fingerprint,created_by,change_summary)
    VALUES(d.content,encode(sha256(convert_to(d.content::text,'UTF8')),'hex'),'publish',p_request_id,v_fingerprint,p_actor,p_summary) RETURNING * INTO r;
  INSERT INTO public.website_revision_assets SELECT r.id,public.website_asset_ids(d.content);
  UPDATE public.website_publications SET revision_id=r.id,public_content=v_projection,published_at=now() WHERE site_key='main';
  UPDATE public.website_drafts SET base_revision_id=r.id,lock_version=lock_version+1,updated_by=p_actor,updated_at=now() WHERE site_key='main';
  PERFORM public.website_write_audit(p_actor,'website_published',r.id::text,jsonb_build_object('revisionId',r.id,'revisionNo',r.revision_no,'previousRevisionId',l.revision_id,'summary',p_summary));
  RETURN to_jsonb(r);
END $$;

CREATE FUNCTION public.website_restore(p_actor uuid,p_target_revision uuid,p_expected_version bigint,p_expected_live uuid,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE d public.website_drafts%ROWTYPE; l public.website_publications%ROWTYPE; r public.website_revisions%ROWTYPE; target public.website_revisions%ROWTYPE;
  v_fingerprint text; v_projection jsonb;
BEGIN
  PERFORM public.website_require_actor(p_actor,true);
  IF p_request_id IS NULL OR p_expected_live IS NULL OR p_expected_version IS NULL OR p_target_revision IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid restore request'; END IF;
  v_fingerprint:=jsonb_build_object('operation','restore','actor',p_actor,'version',p_expected_version,'live',p_expected_live,'target',p_target_revision)::text;
  SELECT * INTO r FROM public.website_revisions WHERE publication_request_id=p_request_id;
  IF FOUND THEN
    IF r.request_fingerprint<>v_fingerprint THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Publication request ID reused'; END IF;
    RETURN to_jsonb(r);
  END IF;
  SELECT * INTO STRICT d FROM public.website_drafts WHERE site_key='main' FOR UPDATE;
  SELECT * INTO STRICT l FROM public.website_publications WHERE site_key='main' FOR UPDATE;
  SELECT * INTO r FROM public.website_revisions WHERE publication_request_id=p_request_id;
  IF FOUND THEN
    IF r.request_fingerprint<>v_fingerprint THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Publication request ID reused'; END IF;
    RETURN to_jsonb(r);
  END IF;
  IF d.lock_version<>p_expected_version OR l.revision_id<>p_expected_live THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Website changed; reload before restoring'; END IF;
  SELECT * INTO STRICT target FROM public.website_revisions WHERE id=p_target_revision;
  v_projection:=public.website_projection(target.content);
  INSERT INTO public.website_revisions(content,content_hash,operation,publication_request_id,request_fingerprint,restored_from_revision_id,created_by,change_summary)
    VALUES(target.content,target.content_hash,'restore',p_request_id,v_fingerprint,target.id,p_actor,'Restored revision '||target.revision_no) RETURNING * INTO r;
  INSERT INTO public.website_revision_assets SELECT r.id,public.website_asset_ids(target.content);
  UPDATE public.website_publications SET revision_id=r.id,public_content=v_projection,published_at=now() WHERE site_key='main';
  -- Preserve both draft content and its old baseline. Publication now requires explicit reconciliation.
  UPDATE public.website_drafts SET lock_version=lock_version+1,updated_by=p_actor,updated_at=now() WHERE site_key='main';
  PERFORM public.website_write_audit(p_actor,'website_restored',r.id::text,jsonb_build_object('revisionId',r.id,'revisionNo',r.revision_no,'sourceRevisionId',target.id,'previousRevisionId',l.revision_id));
  RETURN to_jsonb(r);
END $$;

REVOKE ALL ON FUNCTION public.website_guard_revision(),public.website_guard_asset(),public.website_check_content(jsonb),public.website_require_actor(uuid,boolean,text),public.website_asset_ids(jsonb),public.website_projection(jsonb),public.website_write_audit(uuid,text,text,jsonb),public.website_save_draft(uuid,bigint,jsonb),public.website_reconcile_draft(uuid,bigint,uuid,text),public.website_publish(uuid,bigint,uuid,uuid,text),public.website_restore(uuid,uuid,bigint,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.website_guard_revision(),public.website_guard_asset(),public.website_check_content(jsonb),public.website_require_actor(uuid,boolean,text),public.website_asset_ids(jsonb),public.website_projection(jsonb),public.website_write_audit(uuid,text,text,jsonb),public.website_save_draft(uuid,bigint,jsonb),public.website_reconcile_draft(uuid,bigint,uuid,text),public.website_publish(uuid,bigint,uuid,uuid,text),public.website_restore(uuid,uuid,bigint,uuid,uuid) TO service_role;
INSERT INTO public.modules(slug,name,description,sort_order) VALUES('website_content','Website Content','Public website drafts and releases',17);
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES
  ('website-drafts','website-drafts',false,5242880,ARRAY['image/png','image/jpeg','image/webp']),
  ('website-public','website-public',true,5242880,ARRAY['image/png','image/jpeg','image/webp']);
