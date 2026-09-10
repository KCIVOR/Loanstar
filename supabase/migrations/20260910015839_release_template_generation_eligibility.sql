-- Per-segment eligibility for release-category document templates.
-- Replaces the hardcoded AUTO_GENERATED_SLUGS / COLLATERAL_GENERATED_SLUGS lists:
-- an admin now sets, per template, whether it is auto-generated ('always'),
-- offered in the LRA generate picker ('optional'), or not shown ('hidden') for
-- each of the two segment groups (seafarer / sme+individual). The path and
-- collateral *conditions* stay in application code.
--
-- Seed reproduces today's behaviour exactly:
--   * core packet + every voucher slug -> 'always' for both groups
--     (code still narrows the voucher pair by release path)
--   * chattel / real-estate mortgage   -> 'hidden' seafarer, 'always' sme
--     (code still gates on collateral_type)
--   * acknowledgement_receipt / ar_cash_voucher / endorsement_letter
--                                      -> 'hidden' seafarer, 'optional' sme
--   * every non-'release' template     -> 'hidden' both (columns unused there)

DO $$ BEGIN
  CREATE TYPE public.doc_generation_eligibility AS ENUM ('always', 'optional', 'hidden');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.document_templates
  ADD COLUMN IF NOT EXISTS seafarer_generation public.doc_generation_eligibility
    NOT NULL DEFAULT 'hidden',
  ADD COLUMN IF NOT EXISTS sme_generation public.doc_generation_eligibility
    NOT NULL DEFAULT 'hidden';

UPDATE public.document_templates
   SET seafarer_generation = 'always', sme_generation = 'always'
 WHERE slug IN (
   'blri', 'promissory_note', 'disclosure_statement', 'letter_of_intent',
   'loan_agreement', 'check_voucher', 'ar_check_voucher',
   'cash_voucher', 'ar_atm_voucher'
 );

UPDATE public.document_templates
   SET seafarer_generation = 'hidden', sme_generation = 'always'
 WHERE slug IN ('deed_of_chattel_mortgage', 'real_estate_mortgage');

UPDATE public.document_templates
   SET seafarer_generation = 'hidden', sme_generation = 'optional'
 WHERE slug IN ('acknowledgement_receipt', 'ar_cash_voucher', 'endorsement_letter');
