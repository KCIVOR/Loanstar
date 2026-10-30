-- Expected CMS conflicts are application HTTP409, not retriable database serialization failures.
-- PostgREST14 retries custom40001 indefinitely; PT409 avoids that retry loop.
-- Only four website routines are replaced; CREATE OR REPLACE preserves existing ACLs.

CREATE OR REPLACE FUNCTION public.website_save_draft(p_actor uuid,p_expected_version bigint,p_content jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE d public.website_drafts%ROWTYPE;
BEGIN
  PERFORM public.website_require_actor(p_actor);
  SELECT * INTO STRICT d FROM public.website_drafts WHERE site_key='main' FOR UPDATE;
  IF p_expected_version IS NULL OR d.lock_version<>p_expected_version THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Website draft changed; reload before saving'; END IF;
  IF NOT public.website_check_content(p_content) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid website content'; END IF;
  IF EXISTS(SELECT 1 FROM public.website_asset_ids(p_content) i WHERE NOT EXISTS(SELECT 1 FROM public.website_assets a WHERE a.id=i)) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Unknown website asset';
  END IF;
  UPDATE public.website_drafts SET content=p_content,lock_version=lock_version+1,updated_by=p_actor,updated_at=now() WHERE site_key='main' RETURNING * INTO d;
  PERFORM public.website_write_audit(p_actor,'website_draft_saved','main',jsonb_build_object('version',d.lock_version));
  RETURN to_jsonb(d);
END $$;

CREATE OR REPLACE FUNCTION public.website_reconcile_draft(p_actor uuid,p_expected_version bigint,p_expected_live uuid,p_mode text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE d public.website_drafts%ROWTYPE; l public.website_publications%ROWTYPE;
BEGIN
  PERFORM public.website_require_actor(p_actor);
  SELECT * INTO STRICT d FROM public.website_drafts WHERE site_key='main' FOR UPDATE;
  SELECT * INTO STRICT l FROM public.website_publications WHERE site_key='main' FOR UPDATE;
  IF p_expected_version IS NULL OR p_expected_live IS NULL OR d.lock_version<>p_expected_version OR l.revision_id<>p_expected_live THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Website changed; reload before reconciling'; END IF;
  IF p_mode IS NULL OR p_mode NOT IN ('reset','rebase') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid reconcile mode'; END IF;
  UPDATE public.website_drafts SET content=CASE WHEN p_mode='reset' THEN l.public_content->'content' ELSE content END,
    base_revision_id=l.revision_id,lock_version=lock_version+1,updated_by=p_actor,updated_at=now() WHERE site_key='main' RETURNING * INTO d;
  PERFORM public.website_write_audit(p_actor,'website_draft_reconciled','main',jsonb_build_object('version',d.lock_version,'mode',p_mode,'revisionId',l.revision_id));
  RETURN to_jsonb(d);
END $$;

CREATE OR REPLACE FUNCTION public.website_publish(p_actor uuid,p_expected_version bigint,p_expected_live uuid,p_request_id uuid,p_summary text DEFAULT '') RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE d public.website_drafts%ROWTYPE; l public.website_publications%ROWTYPE; r public.website_revisions%ROWTYPE;
  v_fingerprint text; v_projection jsonb;
BEGIN
  PERFORM public.website_require_actor(p_actor,true);
  IF p_request_id IS NULL OR p_expected_live IS NULL OR p_expected_version IS NULL OR p_summary IS NULL OR length(p_summary)>500 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid publication request'; END IF;
  v_fingerprint:=jsonb_build_object('operation','publish','actor',p_actor,'version',p_expected_version,'live',p_expected_live,'summary',p_summary)::text;
  SELECT * INTO r FROM public.website_revisions WHERE publication_request_id=p_request_id;
  IF FOUND THEN
    IF r.request_fingerprint<>v_fingerprint THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Publication request ID reused'; END IF;
    RETURN to_jsonb(r);
  END IF;
  SELECT * INTO STRICT d FROM public.website_drafts WHERE site_key='main' FOR UPDATE;
  SELECT * INTO STRICT l FROM public.website_publications WHERE site_key='main' FOR UPDATE;
  SELECT * INTO r FROM public.website_revisions WHERE publication_request_id=p_request_id;
  IF FOUND THEN
    IF r.request_fingerprint<>v_fingerprint THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Publication request ID reused'; END IF;
    RETURN to_jsonb(r);
  END IF;
  IF d.lock_version<>p_expected_version OR l.revision_id<>p_expected_live OR d.base_revision_id<>l.revision_id THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Website changed; reconcile and reload before publishing';
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

CREATE OR REPLACE FUNCTION public.website_restore(p_actor uuid,p_target_revision uuid,p_expected_version bigint,p_expected_live uuid,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE d public.website_drafts%ROWTYPE; l public.website_publications%ROWTYPE; r public.website_revisions%ROWTYPE; target public.website_revisions%ROWTYPE;
  v_fingerprint text; v_projection jsonb;
BEGIN
  PERFORM public.website_require_actor(p_actor,true);
  IF p_request_id IS NULL OR p_expected_live IS NULL OR p_expected_version IS NULL OR p_target_revision IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid restore request'; END IF;
  v_fingerprint:=jsonb_build_object('operation','restore','actor',p_actor,'version',p_expected_version,'live',p_expected_live,'target',p_target_revision)::text;
  SELECT * INTO r FROM public.website_revisions WHERE publication_request_id=p_request_id;
  IF FOUND THEN
    IF r.request_fingerprint<>v_fingerprint THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Publication request ID reused'; END IF;
    RETURN to_jsonb(r);
  END IF;
  SELECT * INTO STRICT d FROM public.website_drafts WHERE site_key='main' FOR UPDATE;
  SELECT * INTO STRICT l FROM public.website_publications WHERE site_key='main' FOR UPDATE;
  SELECT * INTO r FROM public.website_revisions WHERE publication_request_id=p_request_id;
  IF FOUND THEN
    IF r.request_fingerprint<>v_fingerprint THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Publication request ID reused'; END IF;
    RETURN to_jsonb(r);
  END IF;
  IF d.lock_version<>p_expected_version OR l.revision_id<>p_expected_live THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Website changed; reload before restoring'; END IF;
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
