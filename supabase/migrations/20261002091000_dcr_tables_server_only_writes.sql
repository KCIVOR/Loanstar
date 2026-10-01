-- DCR item creation and submission run through the server's service client.
-- Collectors retain only the draft-header INSERT required to start a DCRR.

drop policy if exists dcr_items_write on public.dcr_items;
drop policy if exists dcr_item_allocations_write on public.dcr_item_allocations;

drop policy if exists dcr_collector_write on public.dcr;
create policy dcr_collector_insert_draft on public.dcr
  for insert to authenticated
  with check (
    status = 'draft'
    and collector_user_id = auth.uid()
    and (has_module_permission('collection', 'edit') or has_module_permission('remedial', 'edit'))
  );

create policy dcr_super_admin_write on public.dcr
  for all to authenticated
  using (is_super_admin())
  with check (is_super_admin());
