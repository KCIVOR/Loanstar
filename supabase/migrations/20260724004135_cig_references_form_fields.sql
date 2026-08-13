-- CI & References Form fields (Phase 1 of loanstar/docs/cig-references-form-plan.md)
-- Additive only: does not touch pic_allotment_awareness, pic_payment_reliability,
-- pic_interview_notes, character_references_notes, char_ref_other_lenders — those
-- stay in place, just unused by the new UI once Phase 3 lands.

alter table public.verifications
  add column pic_verification jsonb,
  add column reference_verifications jsonb,
  add column verification_checklist jsonb,
  add column pic_payment_preference jsonb,
  add column pic_demeanor jsonb,
  add column pic_rating smallint check (pic_rating between 1 and 5),
  add column pic_rating_reason text,
  add column cif_verified_by text,
  add column cif_verified_date date;
