-- Co-Borrower section — Phase 0 (schema only, see
-- docs/revision-plans/feature-co-borrower-section.md).
--
-- Purely additive: four new columns on loan_applications, all defaulting to
-- "no co-borrower". No existing column, constraint, value, or row is touched.
-- Every existing row gets co_borrower_required = false and co_borrowers = '[]'
-- — inert, nothing downstream changes.
--
-- The requirement is ADVISORY ONLY (Rovick decision, 2026-09-01): nothing in
-- this feature ever blocks a status transition or a release. These columns
-- only drive UI captions, an LRA warning banner, and document merge fields.
-- In particular, loan_applications.blocker is deliberately NOT used by this
-- feature (it feeds bottleneck / TAT reports and reads as a hard hold).
--
-- co_borrower_required_by is a bare nullable uuid with no FK constraint,
-- matching the existing endorsed_by / privacy_orientation_by /
-- initial_interview_by / agent_user_id columns on this same table.

alter table public.loan_applications
  add column co_borrower_required boolean not null default false,
  add column co_borrowers jsonb not null default '[]'::jsonb,
  add column co_borrower_required_by uuid,
  add column co_borrower_completed_at timestamptz;

comment on column public.loan_applications.co_borrower_required is
  'Co-Borrower feature: true when the approving committee asked for a co-borrower on this loan (set at approve time, Phase 2). Advisory only — never blocks release. Never auto-set.';
comment on column public.loan_applications.co_borrowers is
  'Co-Borrower feature: array of { "fullName": text, "address": text }. Name + address only. Multiple allowed. Filled by CSA/Committee via the dedicated co-borrowers route (Phase 4).';
comment on column public.loan_applications.co_borrower_required_by is
  'Co-Borrower feature: the committee actor who set co_borrower_required. Bare uuid, no FK — matches endorsed_by / privacy_orientation_by convention on this table.';
comment on column public.loan_applications.co_borrower_completed_at is
  'Co-Borrower feature: stamped once, when co_borrowers first becomes non-empty. Lets the LRA banner tell "requested and still missing" from "requested and done".';
