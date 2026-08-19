-- Phase 1.4: penalty_rate_for_segment() throws on unknown segment by design
-- (never silently use the Seafarer rate). Add 'individual', reading the
-- penalty_rate_individual config key seeded in Phase 1.3, same as the
-- existing seafarer/sme arms. Called by refresh_one_masterlist_aging().
CREATE OR REPLACE FUNCTION public.penalty_rate_for_segment(p_segment text)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_key text;
  v_cfg jsonb;
  v_rate numeric := 0.05;
BEGIN
  IF p_segment IS NULL OR p_segment NOT IN ('seafarer', 'sme', 'individual') THEN
    RAISE EXCEPTION
      'masterlist.segment is missing or unknown (%) — cannot choose penalty rate; backfill segment before aging',
      COALESCE(p_segment, 'null');
  END IF;

  v_key := CASE
    WHEN p_segment = 'sme' THEN 'penalty_rate_sme'
    WHEN p_segment = 'individual' THEN 'penalty_rate_individual'
    ELSE 'penalty_rate'
  END;

  SELECT value INTO v_cfg
  FROM public.config_settings
  WHERE key = v_key;

  IF v_cfg IS NOT NULL THEN
    v_rate := COALESCE((v_cfg #>> '{}')::numeric, 0.05);
  END IF;

  RETURN v_rate;
END;
$function$
