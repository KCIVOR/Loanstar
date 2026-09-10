-- Make the 7 LSLGC "servicing" documents available in the LRA release
-- "Generate documents" modal as OPTIONAL picks for SME loans (not auto-
-- generated with "Generate all"). Seafarer stays hidden — these are SME-side.
--
-- `buildReleaseTemplateContext` is extended in the same change to supply their
-- party / amount / date fields; collateral-detail repeats (vehicles / properties)
-- and post-event fields (mortgage registration nos., surrender amount,
-- redemption period, replacement-check schedule, prior-loans list) render blank
-- for the notary / officer to complete, per this system's uncaptured-field
-- convention.

UPDATE public.document_templates
SET category = 'release',
    sme_generation = 'optional',
    seafarer_generation = 'hidden'
WHERE slug IN (
  'agreement_for_consolidation',
  'agreement_check_replacement',
  'cancellation_of_chattel_mortgage',
  'cancellation_of_real_estate_mortgage',
  'spa_mortgage_cancellation',
  'voluntary_surrender_deed_auto',
  'voluntary_surrender_deed_rem'
);
