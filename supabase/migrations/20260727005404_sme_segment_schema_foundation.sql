-- Stage 0 of SME loan segment build: additive schema only, zero behavior change.
-- Every new column is nullable or defaulted so existing (seafarer) rows/queries are unaffected.

-- 1. loan_applications: segment identity, set once at CSA creation, before loan_type_id exists.
alter table public.loan_applications
  add column segment text not null default 'seafarer' check (segment in ('seafarer', 'sme')),
  add column entity_type text check (entity_type in ('individual', 'corporate')),
  add constraint loan_applications_entity_type_sme_only
    check (segment <> 'sme' or entity_type is not null);

create index idx_loan_applications_segment on public.loan_applications(segment);

-- 2. loan_types: nullable segment tag, backfill all existing rows to 'seafarer'.
alter table public.loan_types
  add column segment text;

update public.loan_types set segment = 'seafarer' where segment is null;

-- 3. stage_checklists: nullable segment + entity_type, widen the uniqueness constraint.
alter table public.stage_checklists
  add column segment text,
  add column entity_type text;

alter table public.stage_checklists
  drop constraint stage_checklists_stage_document_type_id_key;

alter table public.stage_checklists
  add constraint stage_checklists_stage_document_type_id_segment_entity_key
    unique (stage, document_type_id, segment, entity_type);

-- 4. stage_check_mapping: nullable segment, widen the uniqueness constraint.
alter table public.stage_check_mapping
  add column segment text;

alter table public.stage_check_mapping
  drop constraint stage_check_mapping_stage_check_type_id_key;

alter table public.stage_check_mapping
  add constraint stage_check_mapping_stage_check_type_id_segment_key
    unique (stage, check_type_id, segment);

-- 5. borrowers: SME business data, same loose-JSONB convention as manning_agency/allottee/pic_work.
alter table public.borrowers
  add column business_info jsonb not null default '{}'::jsonb;

-- 6. verifications: CIG Field Visit sections, following the 2026-07-24 JSONB-column precedent.
alter table public.verifications
  add column field_visit jsonb,
  add column sme_reloan_verification jsonb;

-- 7. masterlist: denormalized segment tag (same pattern as existing loan_type_name/manning_agency/vessel_name),
-- backfilled from the linked application so getPenaltyRate can branch without an extra join at read time.
alter table public.masterlist
  add column segment text;

update public.masterlist m
set segment = la.segment
from public.loan_applications la
where la.id = m.loan_application_id;

-- 8. config_settings: SME penalty rate key, parallel to the existing global penalty_rate.
insert into public.config_settings (key, value, description)
values ('penalty_rate_sme', '0.05'::jsonb, 'Maximum penalty rate per month (5% - SME)')
on conflict (key) do nothing;
