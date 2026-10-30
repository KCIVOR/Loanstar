-- Register uploaded CMS media and its audit event atomically.
CREATE FUNCTION public.website_register_asset(p_actor uuid,p_id uuid,p_path text,p_mime text,p_size bigint,p_width integer,p_height integer,p_checksum text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE a public.website_assets%ROWTYPE;
BEGIN
  PERFORM public.website_require_actor(p_actor);
  IF p_id IS NULL OR p_path IS NULL OR p_mime IS NULL OR p_size IS NULL OR p_width IS NULL OR p_height IS NULL OR p_checksum IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid image registry request';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='website-drafts' AND name=p_path) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Draft image object is missing';
  END IF;
  INSERT INTO public.website_assets(id,private_path,mime_type,byte_size,width,height,checksum,created_by)
    VALUES(p_id,p_path,p_mime,p_size,p_width,p_height,p_checksum,p_actor) RETURNING * INTO a;
  PERFORM public.website_write_audit(p_actor,'website_asset_uploaded',a.id::text,jsonb_build_object('assetId',a.id,'mimeType',a.mime_type,'byteSize',a.byte_size));
  RETURN to_jsonb(a);
END $$;
REVOKE ALL ON FUNCTION public.website_register_asset(uuid,uuid,text,text,bigint,integer,integer,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.website_register_asset(uuid,uuid,text,text,bigint,integer,integer,text) TO service_role;
