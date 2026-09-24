alter table public.dcr_items drop constraint dcr_items_status_check;
alter table public.dcr_items
  add constraint dcr_items_status_check
  check (status in ('pending', 'posted', 'rejected', 'bounced'));
