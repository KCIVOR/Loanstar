-- Treat Move of Payment's replaced schedule rows as settled historical rows.
-- The replacement row remains the live obligation. No data is changed.
create or replace function public.is_account_fully_settled(p_masterlist_id uuid)
returns boolean
language sql
stable
as $$
  select not exists (
    select 1
    from public.amortization_schedules
    where masterlist_id = p_masterlist_id
      and status not in ('paid', 'rolled', 'moved')
  );
$$;

comment on function public.is_account_fully_settled(uuid) is
  'True only when every amortization_schedules row is paid, rolled, or moved. A moved row is historical because Move of Payment creates a replacement obligation.';
