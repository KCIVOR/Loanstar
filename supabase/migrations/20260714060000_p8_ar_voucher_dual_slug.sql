-- ===========================================================================
-- Phase 6 (code-only fix 4) — disambiguate the AR voucher dual-slug collision.
--
-- See docs/document-template-system-plan.md §4 "Phase 6".
--
-- `ar_check_voucher` / `ar_cash_voucher` meant two different things:
--   * LRA-generated accounting vouchers — `generated_documents.document_slug`
--     (+ the Phase 4 document_templates of the same slug). Heavily wired
--     (AUTO_GENERATED_SLUGS, legacy renderer). LEFT UNTOUCHED.
--   * AR upload slots on the 'accounting' checklist — `document_types` rows.
--
-- Per the chosen resolution, the AR UPLOAD slots are renamed so AR attaches its
-- own posted/stamped voucher under a distinct name, and the LRA-generated slug
-- is unambiguous.
--
-- Rename-in-place: `document_types` are referenced by id (stage_checklists,
-- existing documents), so the slug rename carries no data migration and no code
-- change (nothing references the AR-upload slug by name).
-- ===========================================================================

UPDATE public.document_types
SET slug = 'ar_check_voucher_posting', name = 'AR Check Voucher (Posted)'
WHERE slug = 'ar_check_voucher';

UPDATE public.document_types
SET slug = 'ar_cash_voucher_posting', name = 'AR Cash Voucher (Posted)'
WHERE slug = 'ar_cash_voucher';
