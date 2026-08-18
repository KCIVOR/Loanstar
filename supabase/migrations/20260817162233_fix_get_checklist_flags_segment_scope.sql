-- get_checklist_flags() was defined before the segment/entity_type columns
-- existed on stage_checklists (added by sme_segment_schema_foundation on
-- 2026-07-27) and was never updated. It returned every stage_checklists row
-- for stage='intake' regardless of segment, so any document type with both
-- a seafarer and an SME config row (e.g. valid_ids) came back twice — a
-- duplicate React key on /agent/leads/[id] and inflated checklist-progress
-- counts on the agent Lead pipeline (src/lib/agent/queue.ts), the other
-- caller of this RPC. Scope to the application's segment/entity_type, same
-- rule as getStageChecklist() in src/lib/documents/checklist.ts.
CREATE OR REPLACE FUNCTION public.get_checklist_flags(p_application_id uuid)
RETURNS TABLE (
  document_type_id uuid,
  document_type_slug text,
  document_type_name text,
  stage text,
  is_required boolean,
  is_optional_flag boolean,
  sort_order int,
  completion_status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    dt.id,
    dt.slug,
    dt.name,
    sc.stage,
    sc.is_required,
    sc.is_optional_flag,
    sc.sort_order,
    CASE
      WHEN d.status = 'confirmed' THEN 'complete'
      WHEN d.status = 'uploaded' THEN 'uploaded'
      ELSE 'incomplete'
    END
  FROM public.loan_applications la
  JOIN public.stage_checklists sc
    ON sc.segment = la.segment
    AND (sc.entity_type IS NULL OR sc.entity_type = la.entity_type)
  JOIN public.document_types dt ON dt.id = sc.document_type_id
  LEFT JOIN public.documents d
    ON d.document_type_id = dt.id
    AND d.loan_application_id = p_application_id
    AND d.stage = sc.stage
  WHERE la.id = p_application_id
    AND sc.stage = 'intake'
  ORDER BY sc.sort_order;
$$;
