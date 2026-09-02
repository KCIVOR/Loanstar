-- Phase 7b data repair (F2, see
-- docs/ledger-balance-consistency-fix-implementation-plan.md). AN300420 was
-- settled via post_internal_transfer before the Phase 4 fix — every
-- amortization_schedules row already reached 'paid' at the time (the
-- per-row loop was always correct), but outstanding_balance was stuck at
-- ₱16,852.50 (exactly the transfer's discount_amount) because the old
-- balance line subtracted only the cash portion (v_transfer.amount), never
-- the discount. No row data needs to change here — only the stored
-- balance, re-derived via the same function every live posting path now
-- uses (Phase 4).
update masterlist
set outstanding_balance = public.recompute_outstanding_balance(id),
    account_status = case
      when public.recompute_outstanding_balance(id) <= 0
        and public.is_account_fully_settled(id)
      then 'paid'
      else 'active'
    end
where id = (
  select m.id
  from masterlist m
  join loan_applications la on la.id = m.loan_application_id
  where la.application_no = 'AN300420'
);
