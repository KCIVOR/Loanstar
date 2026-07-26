-- Agents with leads.view must not SELECT full borrower rows (PII).
-- Name lookup goes through search_borrower_names() only.

DROP POLICY IF EXISTS borrowers_select ON public.borrowers;

CREATE POLICY borrowers_select ON public.borrowers
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR user_id = auth.uid()
    OR public.has_module_permission('intake', 'view')
    OR public.has_module_permission('verification', 'view')
    OR public.has_module_permission('committee', 'view')
    OR public.has_module_permission('release_lra', 'view')
    OR public.has_module_permission('accounting_ar', 'view')
    OR public.has_module_permission('collection', 'view')
    OR public.has_module_permission('remedial', 'view')
  );

CREATE OR REPLACE FUNCTION public.search_borrower_names(p_query text)
RETURNS TABLE (id uuid, display_name text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  q text := trim(both FROM coalesce(p_query, ''));
BEGIN
  IF NOT (
    public.is_super_admin()
    OR public.has_module_permission('leads', 'view')
  ) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  IF char_length(q) < 2 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    b.id,
    trim(
      both FROM concat_ws(
        ' ',
        b.first_name,
        NULLIF(trim(both FROM coalesce(b.middle_name, '')), ''),
        b.last_name,
        NULLIF(trim(both FROM coalesce(b.suffix, '')), '')
      )
    ) AS display_name
  FROM public.borrowers b
  WHERE
    b.first_name ILIKE '%' || q || '%'
    OR b.last_name ILIKE '%' || q || '%'
    OR coalesce(b.middle_name, '') ILIKE '%' || q || '%'
    OR concat_ws(' ', b.first_name, b.middle_name, b.last_name) ILIKE '%' || q || '%'
  ORDER BY b.last_name ASC, b.first_name ASC
  LIMIT 20;
END;
$$;

REVOKE ALL ON FUNCTION public.search_borrower_names(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_borrower_names(text) TO authenticated;
