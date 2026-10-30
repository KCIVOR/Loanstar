-- Explicitly execute ONLY on staging ddsvqjaknuniekygpbdr. Every fixture rolls back.
BEGIN;
DO $test$
DECLARE actor uuid; ordinary uuid; d public.website_drafts%ROWTYPE;
  l public.website_publications%ROWTYPE; published jsonb; restored jsonb;
  request_id uuid:=gen_random_uuid(); denied boolean;
BEGIN
  SELECT ur.user_id INTO STRICT actor FROM public.user_roles ur
    JOIN public.roles r ON r.id=ur.role_id JOIN public.profiles p ON p.id=ur.user_id
    WHERE r.slug='super_admin' AND r.is_active AND p.is_active LIMIT 1;
  SELECT p.id INTO ordinary FROM public.profiles p WHERE p.id<>actor AND p.is_active LIMIT 1;
  SELECT * INTO STRICT d FROM public.website_drafts WHERE site_key='main';
  SELECT * INTO STRICT l FROM public.website_publications WHERE site_key='main';
  denied:=false;
  BEGIN PERFORM public.website_publish(NULL,d.lock_version,l.revision_id,gen_random_uuid(),'null actor');
  EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  ASSERT denied,'NULL actor must be denied';
  denied:=false;
  BEGIN PERFORM public.website_publish(ordinary,d.lock_version,l.revision_id,gen_random_uuid(),'ordinary actor');
  EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  ASSERT denied,'Ordinary actor must not publish';
  denied:=false;
  BEGIN PERFORM public.website_save_draft(actor,NULL,d.content);
  EXCEPTION WHEN SQLSTATE 'PT409' THEN denied:=true; END;
  ASSERT denied,'NULL version must not bypass compare-and-swap';
  PERFORM public.website_save_draft(actor,d.lock_version,d.content);
  denied:=false;
  BEGIN PERFORM public.website_save_draft(actor,d.lock_version,d.content);
  EXCEPTION WHEN SQLSTATE 'PT409' THEN denied:=true; END;
  ASSERT denied,'Stale draft save must conflict';
  SELECT * INTO STRICT d FROM public.website_drafts WHERE site_key='main';
  published:=public.website_publish(actor,d.lock_version,l.revision_id,request_id,'Rollback-only CMS integration');
  ASSERT EXISTS(SELECT 1 FROM public.audit_events WHERE entity_id=published->>'id' AND action='website_published'),'Publication audit missing';
  ASSERT (SELECT public_content->'content' FROM public.website_publications WHERE site_key='main')=d.content,'Public snapshot differs from draft';
  ASSERT public.website_publish(actor,d.lock_version,l.revision_id,request_id,'Rollback-only CMS integration')->>'id'=published->>'id','Retry not idempotent';
  denied:=false;
  BEGIN PERFORM public.website_publish(actor,d.lock_version,l.revision_id,request_id,'Different intent');
  EXCEPTION WHEN SQLSTATE 'PT409' THEN denied:=true; END;
  ASSERT denied,'Request ID reuse must reject different intent';
  SELECT * INTO STRICT d FROM public.website_drafts WHERE site_key='main';
  restored:=public.website_restore(actor,l.revision_id,d.lock_version,(published->>'id')::uuid,gen_random_uuid());
  ASSERT restored->>'id'<>l.revision_id::text,'Restore must create new revision';
  ASSERT restored->>'restored_from_revision_id'=l.revision_id::text,'Restore provenance missing';
  SELECT * INTO STRICT d FROM public.website_drafts WHERE site_key='main';
  ASSERT d.base_revision_id<>(restored->>'id')::uuid,'Restore must preserve stale draft baseline';
  denied:=false;
  BEGIN PERFORM public.website_publish(actor,d.lock_version,(restored->>'id')::uuid,gen_random_uuid(),'Stale baseline');
  EXCEPTION WHEN SQLSTATE 'PT409' THEN denied:=true; END;
  ASSERT denied,'Stale baseline must require explicit reconcile';
  PERFORM public.website_reconcile_draft(actor,d.lock_version,(restored->>'id')::uuid,'reset');
END $test$;
ROLLBACK;
SELECT 'staging CMS transaction checks passed; all fixtures rolled back' AS result;
