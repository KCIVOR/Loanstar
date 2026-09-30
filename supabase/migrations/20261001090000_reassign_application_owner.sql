-- CSA "Change owner": move an application that already belongs to one borrower
-- portal account to another portal account, atomically (application,
-- masterlist, documents, payments), only in early stages. The walk-in
-- "Connect" RPC (20260922090000) is left untouched.
--
-- Also guards loan_applications.borrower_id so it can only change through a
-- SECURITY DEFINER RPC or the service role — the row-level UPDATE policies
-- otherwise let intake:edit staff rewrite it directly from the browser client.

CREATE OR REPLACE FUNCTION public.reassign_application_borrower_account(
  p_application_id uuid,
  p_target_borrower_id uuid,
  p_actor_id uuid,
  p_reason text
)
RETURNS TABLE (
  borrower_id uuid,
  borrower_user_id uuid,
  previous_borrower_id uuid,
  previous_user_id uuid
)
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
  IF length(trim(coalesce(p_reason, ''))) < 10 THEN
    RAISE EXCEPTION 'A reason of at least 10 characters is required';
  END IF;

  SELECT * INTO v_app
  FROM public.loan_applications
  WHERE id = p_application_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application not found';
  END IF;

  IF v_app.status NOT IN (
    'draft',
    'registered',
    'documents_pending',
    'submitted',
    'on_hold',
    'for_revision',
    'for_verification'
  ) THEN
    RAISE EXCEPTION 'Owner cannot be changed at this stage';
  END IF;

  SELECT * INTO v_source
  FROM public.borrowers
  WHERE id = v_app.borrower_id
  FOR UPDATE;
  IF NOT FOUND OR v_source.user_id IS NULL THEN
    RAISE EXCEPTION 'Application is not linked to a borrower account — use Connect instead';
  END IF;

  IF p_target_borrower_id = v_app.borrower_id THEN
    RAISE EXCEPTION 'Application already belongs to that borrower';
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
          'note', 'CSA changed application owner: ' || trim(p_reason),
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

  RETURN QUERY SELECT v_target.id, v_target.user_id, v_source.id, v_source.user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reassign_application_borrower_account(uuid, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reassign_application_borrower_account(uuid, uuid, uuid, text) TO service_role;

-- Inside a SECURITY DEFINER function current_user is the owner (postgres), and
-- service-role/SQL-editor sessions are not 'authenticated'/'anon', so only
-- direct PostgREST writes made with a user JWT are blocked.
CREATE OR REPLACE FUNCTION public.guard_application_borrower_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.borrower_id IS DISTINCT FROM OLD.borrower_id
     AND current_user IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'Application owner can only be changed through Connect or Change owner'
      USING errcode = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_application_borrower_column ON public.loan_applications;
CREATE TRIGGER guard_application_borrower_column
  BEFORE UPDATE OF borrower_id ON public.loan_applications
  FOR EACH ROW EXECUTE FUNCTION public.guard_application_borrower_column();
