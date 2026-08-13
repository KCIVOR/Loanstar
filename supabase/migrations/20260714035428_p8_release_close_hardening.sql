-- ===========================================================================
-- Phase 6 (code-only fixes) — release/close hardening + retire dead upload slots.
--
-- See docs/document-template-system-plan.md §4 "Phase 6".
--
-- (1) PN/DS scan-back-in gate: the Promissory Note is notarized and the
--     Disclosure Statement is borrower-signed, so both must follow
--     generate -> wet-sign/notarize -> scan-back-in before a release can close.
--     Add `signed_promissory_note` + `signed_disclosure_statement` document
--     types and require them on the 'release' checklist (mirrors the existing
--     `signed_check_voucher`). closeRelease() enforces them in code.
-- (2) Retire `briefing_information`: the borrower briefing is the `briefings`
--     table (Collector click-sign), not an upload — the slot was dead (zero code
--     references). Remove it from the 'release' checklist.
-- (3) Retire `pdc_encoding_sheet`: PDC encoding is the structured `pdc_checks`
--     flow (savePdcChecks), not an upload — the slot was dead. Remove it from
--     the 'signing_with_pdc' checklist.
--
-- Document TYPE rows are left intact (only the stage_checklist slots are
-- removed) so any historical uploaded documents keep their type reference.
-- ===========================================================================

-- (1) New signed-scan document types (idempotent).
INSERT INTO public.document_types (slug, name) VALUES
  ('signed_promissory_note', 'Signed Promissory Note (Notarized)'),
  ('signed_disclosure_statement', 'Signed Disclosure Statement')
ON CONFLICT (slug) DO NOTHING;

-- Require both on the 'release' checklist (after the existing signed voucher).
INSERT INTO public.stage_checklists (stage, document_type_id, is_required, sort_order)
SELECT 'release', dt.id, true, t.ord
FROM public.document_types dt
JOIN (VALUES
  ('signed_promissory_note', 6),
  ('signed_disclosure_statement', 7)
) AS t(slug, ord) ON dt.slug = t.slug
WHERE NOT EXISTS (
  SELECT 1 FROM public.stage_checklists sc
  WHERE sc.stage = 'release' AND sc.document_type_id = dt.id
);

-- (2) Retire the dead briefing_information upload slot (release checklist).
DELETE FROM public.stage_checklists sc
USING public.document_types dt
WHERE sc.document_type_id = dt.id
  AND sc.stage = 'release'
  AND dt.slug = 'briefing_information';

-- (3) Retire the dead pdc_encoding_sheet upload slot (signing_with_pdc checklist).
DELETE FROM public.stage_checklists sc
USING public.document_types dt
WHERE sc.document_type_id = dt.id
  AND sc.stage = 'signing_with_pdc'
  AND dt.slug = 'pdc_encoding_sheet';
