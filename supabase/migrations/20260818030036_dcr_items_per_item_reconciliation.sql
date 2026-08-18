alter table dcr_items
  add column status text not null default 'pending',
  add column deposit_reference text null,
  add column deposit_amount numeric null,
  add column posted_by uuid null,
  add column posted_at timestamptz null;

alter table dcr_items
  add constraint dcr_items_status_check
  check (status in ('pending', 'posted', 'rejected'));
