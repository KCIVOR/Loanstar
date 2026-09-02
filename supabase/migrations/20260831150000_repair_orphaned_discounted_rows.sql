-- Phase 7a data repair (F1/F3, see
-- docs/ledger-balance-consistency-fix-implementation-plan.md). Settles the
-- 11 orphaned 100%-discounted installments on AN300435 (4 rows) and
-- AN300431 (7 rows) that were born 'pending' before the Phase 2 fix
-- (initialScheduleRowStatus) existed — each row's net due
-- (amount_due - discount_amount) is exactly 0, but no code path ever had a
-- reason to mark a row "paid" without an actual posting or write-off.
--
-- AN300430's 12 matching rows are DELIBERATELY excluded — that account's
-- origination_discounts value has a documented interpretation conflict
-- (F4) requiring a human decision before any of its data is touched. See
-- docs/ledger-balance-consistency-deep-audit.md.
--
-- paid_at is set to each account's own release_date (the discount was
-- fixed and, in effect, "honored" at release — there is no more accurate
-- timestamp available for a row that was never actually posted).
--
-- Balance/account_status are then re-derived via the same functions every
-- live posting path now uses (Phase 4/6) — for both accounts this is
-- expected to be a no-op on outstanding_balance (recompute_outstanding_balance
-- already nets a 100%-discounted row to 0 whether it's 'pending' or 'paid'),
-- confirming this repair only fixes status/visibility, not money.
do $$
declare
  v_an300435_id uuid;
  v_an300431_id uuid;
begin
  select m.id into v_an300435_id
  from masterlist m
  join loan_applications la on la.id = m.loan_application_id
  where la.application_no = 'AN300435';

  select m.id into v_an300431_id
  from masterlist m
  join loan_applications la on la.id = m.loan_application_id
  where la.application_no = 'AN300431';

  if v_an300435_id is null or v_an300431_id is null then
    raise exception 'AN300435 or AN300431 masterlist not found — aborting repair';
  end if;

  -- AN300435: installments 1, 4, 8, 9 (all 100%-discounted, verified
  -- amount_due = discount_amount exactly).
  update amortization_schedules s
  set status = 'paid',
      paid_at = m.release_date
  from masterlist m
  where s.masterlist_id = m.id
    and m.id = v_an300435_id
    and s.status not in ('paid', 'rolled')
    and (s.amount_due - coalesce(s.discount_amount, 0)) <= 0;

  update masterlist
  set outstanding_balance = public.recompute_outstanding_balance(id),
      account_status = case
        when public.recompute_outstanding_balance(id) <= 0
          and public.is_account_fully_settled(id)
        then 'paid'
        else 'active'
      end
  where id = v_an300435_id;

  -- AN300431: installments 1, 2, 5, 6, 9, 10, 12 (all 100%-discounted).
  -- Installments 7, 11, 13 remain genuinely open — untouched.
  update amortization_schedules s
  set status = 'paid',
      paid_at = m.release_date
  from masterlist m
  where s.masterlist_id = m.id
    and m.id = v_an300431_id
    and s.status not in ('paid', 'rolled')
    and (s.amount_due - coalesce(s.discount_amount, 0)) <= 0;

  update masterlist
  set outstanding_balance = public.recompute_outstanding_balance(id),
      account_status = case
        when public.recompute_outstanding_balance(id) <= 0
          and public.is_account_fully_settled(id)
        then 'paid'
        else 'active'
      end
  where id = v_an300431_id;
end $$;
