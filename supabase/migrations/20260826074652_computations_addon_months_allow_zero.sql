-- Addon months: allow 0 for all segments (previously Seafarer required >= 1 per G1 spec).
alter table public.computations
  drop constraint computations_addon_months_check;

alter table public.computations
  add constraint computations_addon_months_check check (addon_months >= 0);
