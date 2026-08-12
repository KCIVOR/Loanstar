-- CIG Application History Phase 1: flatten return-to-CSA events out of
-- loan_applications.status_history into a queryable view.
--
-- security_invoker = true is load-bearing — without it the view would run
-- with the creator's privileges and silently bypass loan_applications RLS.
--
-- LEFT JOIN borrowers (not a second Phase 2 lookup): embed borrower_no /
-- first_name / last_name / email so getCigReturnedHistory can select them
-- from this view without an N+1 keyed by application_id.
--
-- Stable id = application uuid + JSONB array ordinality: an application
-- can be returned more than once; Phase 2 .order("id") needs a unique key
-- per event, while application_id stays the loan_applications uuid.
--
-- GRANT SELECT to authenticated: first view in this repo; PostgREST cannot
-- read it without an explicit grant even when RLS would allow the rows.

CREATE VIEW public.cig_return_to_csa_events
WITH (security_invoker = true) AS
SELECT
  la.id::text || ':' || hist.ordinality::text AS id,
  la.id AS application_id,
  la.application_no,
  la.borrower_id,
  b.borrower_no,
  b.first_name,
  b.last_name,
  b.email,
  (hist.entry->>'at')::timestamptz AS returned_at,
  hist.entry->>'note' AS note
FROM public.loan_applications la
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(la.status_history, '[]'::jsonb))
  WITH ORDINALITY AS hist(entry, ordinality)
LEFT JOIN public.borrowers b ON b.id = la.borrower_id
WHERE hist.entry->>'note' LIKE 'Returned to CSA by CIG%';

GRANT SELECT ON public.cig_return_to_csa_events TO authenticated;
