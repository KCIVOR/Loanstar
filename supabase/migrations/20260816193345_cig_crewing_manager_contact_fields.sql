-- Crewing manager contact details, distinct from the existing cm_* columns
-- (which describe the crew member's own contract terms, not the crewing
-- manager as a person). Requested so CIG can record who they verified with.
alter table public.verifications
  add column if not exists cm_manager_name text,
  add column if not exists cm_manager_position text,
  add column if not exists cm_manager_contact text,
  add column if not exists cm_manning_agency_name text,
  add column if not exists cm_joining_port text;
