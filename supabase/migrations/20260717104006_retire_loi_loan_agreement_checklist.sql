-- Phase 11: retire manual upload slots for LOI + Loan Agreement (now generated).
-- Document types remain so historical uploads keep their FK.

DELETE FROM public.stage_checklists sc
USING public.document_types dt
WHERE sc.document_type_id = dt.id
  AND sc.stage = 'release'
  AND dt.slug IN ('letter_of_intent', 'loan_agreement');
