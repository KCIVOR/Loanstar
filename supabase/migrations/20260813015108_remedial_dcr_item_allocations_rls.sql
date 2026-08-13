-- Fix: Remedial users get "new row violates row-level security policy for
-- table dcr_item_allocations" when allocating a payment into a DCR draft.
-- remedial_payment_rls (20260813011700) added a remedial OR-branch to dcr
-- and dcr_items, but missed dcr_item_allocations one level deeper in the
-- same chain -- its write policy was still gated on
-- has_module_permission('collection', 'edit') only. Its select policy
-- needed no change (ownership-only, no module gate).

alter policy dcr_item_allocations_write on public.dcr_item_allocations
  using (
    is_super_admin()
    or exists (
      select 1 from dcr_items di join dcr d on d.id = di.dcr_id
      where di.id = dcr_item_allocations.dcr_item_id
        and d.collector_user_id = auth.uid()
        and d.status = 'draft'
        and has_module_permission('collection', 'edit')
    )
    or exists (
      select 1 from dcr_items di join dcr d on d.id = di.dcr_id
      where di.id = dcr_item_allocations.dcr_item_id
        and d.collector_user_id = auth.uid()
        and d.status = 'draft'
        and has_module_permission('remedial', 'edit')
    )
  )
  with check (
    is_super_admin()
    or exists (
      select 1 from dcr_items di join dcr d on d.id = di.dcr_id
      where di.id = dcr_item_allocations.dcr_item_id
        and d.collector_user_id = auth.uid()
        and d.status = 'draft'
        and has_module_permission('collection', 'edit')
    )
    or exists (
      select 1 from dcr_items di join dcr d on d.id = di.dcr_id
      where di.id = dcr_item_allocations.dcr_item_id
        and d.collector_user_id = auth.uid()
        and d.status = 'draft'
        and has_module_permission('remedial', 'edit')
    )
  );
