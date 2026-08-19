-- Fix: Individual segment was never given stage_checklists rows for the LRA
-- signing_with_pdc / signing_without_pdc / release stages. Those document
-- types (promissory note, disclosure statement, BLRI, bank/ATM authorization,
-- check/cash voucher, and their signed-scan-back counterparts) are the same,
-- verbatim, generic loan-closing paperwork every borrower signs regardless of
-- segment — Seafarer and SME already have byte-identical rows for these three
-- stages. Individual having zero rows meant getStageChecklist() always
-- returned an empty list for it at these stages, so LRA's "Upload signed
-- documents" combined upload silently wrote zero documents, and closing the
-- release file always failed with all three signed slugs reported missing
-- (surfaced to the user as a 500 "Upload the following signed scan(s)..."
-- error that could never be satisfied). Copies SME's rows verbatim for
-- segment='individual'.

INSERT INTO stage_checklists (stage, document_type_id, is_required, is_optional_flag, sort_order, segment, entity_type, collateral_type)
SELECT sc.stage, sc.document_type_id, sc.is_required, sc.is_optional_flag, sc.sort_order, 'individual', NULL, NULL
FROM stage_checklists sc
WHERE sc.stage IN ('release', 'signing_with_pdc', 'signing_without_pdc')
  AND sc.segment = 'sme'
  AND sc.entity_type IS NULL
  AND sc.collateral_type IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM stage_checklists sc2
    WHERE sc2.stage = sc.stage
      AND sc2.document_type_id = sc.document_type_id
      AND sc2.segment = 'individual'
      AND sc2.entity_type IS NULL
      AND sc2.collateral_type IS NULL
  );
