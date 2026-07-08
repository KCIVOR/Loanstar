-- Phase 2: Seed document types and stage checklists

INSERT INTO public.document_types (slug, name) VALUES
  ('application_form', 'Application Form'),
  ('declaration_form', 'Declaration Form'),
  ('house_sketch', 'House Sketch'),
  ('agency_consent_letter', 'Agency Consent Letter'),
  ('data_privacy_consent', 'Data Privacy Consent'),
  ('bap_customer_consent', 'BAP Customer Consent'),
  ('valid_ids', 'Valid IDs'),
  ('passport', 'Passport'),
  ('seaman_book', 'Seaman''s Book'),
  ('photo_2x2', '2x2 Picture'),
  ('contract', 'Contract'),
  ('cig_endorsement_letter', 'CIG Endorsement Letter'),
  ('employment_verification', 'Employment Verification'),
  ('pic_interview_record', 'PIC Interview Record'),
  ('accounting_checklist', 'Accounting Checklist'),
  ('ar_check_voucher', 'AR Check Voucher'),
  ('ar_cash_voucher', 'AR Cash Voucher'),
  ('promissory_note', 'Promissory Note'),
  ('disclosure_statement', 'Disclosure Statement'),
  ('blri', 'BLRI'),
  ('affidavit_understanding', 'Affidavit of Understanding'),
  ('bank_authorization', 'Bank Authorization'),
  ('atm_authorization', 'ATM Authorization'),
  ('pdc_encoding_sheet', 'PDC Encoding Sheet'),
  ('check_voucher', 'Check Voucher'),
  ('cash_voucher', 'Cash Voucher'),
  ('letter_of_intent', 'Letter of Intent'),
  ('loan_agreement', 'Loan Agreement'),
  ('briefing_information', 'Briefing Information'),
  ('signed_check_voucher', 'Signed Check Voucher'),
  ('release_transmittal', 'Release Transmittal');

-- Intake checklist
INSERT INTO public.stage_checklists (stage, document_type_id, is_required, is_optional_flag, sort_order)
SELECT 'intake', id, true, false, ord FROM public.document_types, (VALUES
  ('application_form', 1),
  ('declaration_form', 2),
  ('house_sketch', 3),
  ('agency_consent_letter', 4),
  ('data_privacy_consent', 5),
  ('bap_customer_consent', 6),
  ('valid_ids', 7),
  ('passport', 8),
  ('seaman_book', 9),
  ('photo_2x2', 10),
  ('contract', 11)
) AS t(slug, ord) WHERE document_types.slug = t.slug;

UPDATE public.stage_checklists sc
SET is_optional_flag = true, is_required = false
FROM public.document_types dt
WHERE sc.document_type_id = dt.id AND dt.slug = 'contract' AND sc.stage = 'intake';

-- CIG endorsement set
INSERT INTO public.stage_checklists (stage, document_type_id, is_required, sort_order)
SELECT 'cig_endorsement', id, true, ord FROM public.document_types, (VALUES
  ('cig_endorsement_letter', 1),
  ('employment_verification', 2),
  ('pic_interview_record', 3)
) AS t(slug, ord) WHERE document_types.slug = t.slug;

-- Accounting set
INSERT INTO public.stage_checklists (stage, document_type_id, is_required, sort_order)
SELECT 'accounting', id, true, ord FROM public.document_types, (VALUES
  ('accounting_checklist', 1),
  ('ar_check_voucher', 2),
  ('ar_cash_voucher', 3)
) AS t(slug, ord) WHERE document_types.slug = t.slug;

-- Signing with PDC
INSERT INTO public.stage_checklists (stage, document_type_id, is_required, sort_order)
SELECT 'signing_with_pdc', id, true, ord FROM public.document_types, (VALUES
  ('promissory_note', 1),
  ('disclosure_statement', 2),
  ('blri', 3),
  ('affidavit_understanding', 4),
  ('bank_authorization', 5),
  ('pdc_encoding_sheet', 6),
  ('check_voucher', 7)
) AS t(slug, ord) WHERE document_types.slug = t.slug;

-- Signing without PDC
INSERT INTO public.stage_checklists (stage, document_type_id, is_required, sort_order)
SELECT 'signing_without_pdc', id, true, ord FROM public.document_types, (VALUES
  ('promissory_note', 1),
  ('disclosure_statement', 2),
  ('blri', 3),
  ('atm_authorization', 4),
  ('cash_voucher', 5)
) AS t(slug, ord) WHERE document_types.slug = t.slug;

-- Release set
INSERT INTO public.stage_checklists (stage, document_type_id, is_required, sort_order)
SELECT 'release', id, true, ord FROM public.document_types, (VALUES
  ('letter_of_intent', 1),
  ('loan_agreement', 2),
  ('briefing_information', 3),
  ('signed_check_voucher', 4),
  ('release_transmittal', 5)
) AS t(slug, ord) WHERE document_types.slug = t.slug;
