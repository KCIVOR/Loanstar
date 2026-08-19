-- Phase 4: seed the document types NOT already covered by the 2026-08-07 SME
-- reconciliation. Audited live document_types first (51 rows) — everything on
-- the SME Sole Prop / Corp clean lists and Individual's clean-list reuses
-- existing slugs (mayors_permit, business_registration, bank_statement_6mo,
-- valid_ids, proof_of_billing, itr_with_fs, proof_of_transaction,
-- business_picture, client_supplier_list, application_form,
-- financial_statements, articles_of_incorporation, owner_authorized_rep_id,
-- company_profile, location_sketch). Only these 7 are genuinely new:
-- 3 collateral documents (car refi + real estate) and 4 Individual-specific.
INSERT INTO document_types (slug, name) VALUES
  ('or_cr_vehicle', 'OR/CR (Vehicle)'),
  ('tax_declaration', 'Tax Declaration'),
  ('title_proof_ownership', 'Title / Proof of Ownership'),
  ('payslip_coe', 'Payslip and Certificate of Employment'),
  ('bank_statement_3mo', '3 Months Latest Bank Statement'),
  ('property_picture', 'Picture of Property'),
  ('proof_of_income', 'Proof of Income')
ON CONFLICT (slug) DO NOTHING;
