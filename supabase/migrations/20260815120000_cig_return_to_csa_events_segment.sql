-- Add loan_applications.segment to cig_return_to_csa_events so
-- getCigReturnedHistory can select + .eq-filter segment server-side
-- (same pattern as application_no / borrower columns already on the view).

DROP VIEW IF EXISTS public.cig_return_to_csa_events;

CREATE VIEW public.cig_return_to_csa_events
WITH (security_invoker = true) AS
SELECT
  la.id::text || ':' || hist.ordinality::text AS id,
  la.id AS application_id,
  la.application_no,
  la.segment,
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
