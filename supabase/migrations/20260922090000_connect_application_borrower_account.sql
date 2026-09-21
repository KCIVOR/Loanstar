-- Atomic re-link of a walk-in application to an existing portal borrower
-- account. Replaces the sequential service-role updates in
-- src/lib/csa/connect-borrower.ts so a mid-way failure can't leave
-- loan_applications / masterlist / documents / payments pointing at
-- different borrowers. Creates one function only; no table/policy/index change.

CREATE OR REPLACE FUNCTION public.connect_application_to_borrower_account(
  p_application_id uuid,
  p_target_borrower_id uuid,
  p_actor_id uuid
)
RETURNS TABLE (borrower_id uuid, borrower_user_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app public.loan_applications%ROWTYPE;
  v_source public.borrowers%ROWTYPE;
  v_target public.borrowers%ROWTYPE;
  v_target_name text;
BEGIN
  SELECT * INTO v_app
  FROM public.loan_applications
  WHERE id = p_application_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application not found';
  END IF;

  SELECT * INTO v_source
  FROM public.borrowers
  WHERE id = v_app.borrower_id
  FOR UPDATE;
  IF FOUND AND v_source.user_id IS NOT NULL THEN
    RAISE EXCEPTION 'Application is already connected to a borrower account';
  END IF;

  IF p_target_borrower_id = v_app.borrower_id THEN
    RAISE EXCEPTION 'Application is already linked to that borrower record';
  END IF;

  SELECT * INTO v_target
  FROM public.borrowers
  WHERE id = p_target_borrower_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Selected borrower record not found';
  END IF;
  IF v_target.user_id IS NULL THEN
    RAISE EXCEPTION 'Selected borrower does not have a portal account';
  END IF;

  v_target_name := concat_ws(
    ' ',
    NULLIF(v_target.first_name, ''),
    NULLIF(v_target.middle_name, ''),
    NULLIF(v_target.last_name, '')
  );

  UPDATE public.loan_applications
  SET borrower_id = p_target_borrower_id,
      status_history = COALESCE(status_history, '[]'::jsonb) || jsonb_build_array(
        jsonb_build_object(
          'status', v_app.status,
          'note', 'CSA connected application to an existing borrower account',
          'at', to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
          'actorId', p_actor_id
        )
      )
  WHERE id = p_application_id;

  UPDATE public.masterlist
  SET borrower_id = p_target_borrower_id,
      borrower_no = COALESCE(v_target.borrower_no, borrower_no),
      borrower_name = COALESCE(NULLIF(v_target_name, ''), borrower_name)
  WHERE loan_application_id = p_application_id;

  UPDATE public.documents
  SET borrower_id = p_target_borrower_id
  WHERE loan_application_id = p_application_id;

  UPDATE public.payments
  SET borrower_id = p_target_borrower_id
  WHERE loan_application_id = p_application_id;

  RETURN QUERY SELECT v_target.id, v_target.user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.connect_application_to_borrower_account(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.connect_application_to_borrower_account(uuid, uuid, uuid)
  TO service_role;
