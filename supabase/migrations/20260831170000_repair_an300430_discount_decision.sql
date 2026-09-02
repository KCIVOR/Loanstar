-- Phase 7c data repair (F4, see
-- docs/ledger-balance-consistency-fix-implementation-plan.md). AN300430's
-- origination_discounts field reads as "3 weeks" under today's meaning, but
-- its 12 schedule rows already reflect "3 months = 12 weeks" of discount
-- (₱67,003.20 waived) under the old, pre-refactor meaning — a genuine
-- interpretation conflict flagged in the audit as requiring a human
-- decision before any data changes.
--
-- Decision (obtained 2026-08-31, via AskUserQuestion): honor the rows —
-- the 12-week/₱67,003.20 figure the account has effectively been running
-- on. No discount_amount is rewritten. This is the same repair pattern as
-- Phase 7a: mark the 12 already-zero-net rows 'paid' (each row's
-- amount_due - discount_amount is exactly 0), then re-derive
-- outstanding_balance/account_status via the same functions every live
-- posting path uses. Unlike AN300435/AN300431, this DOES change the stored
-- balance — it was never actually adjusted for these discounts at all
-- (₱362,426.40 stored vs. ₱304,560.00 derived from the rows, a real
-- ₱57,866.40 difference this repair corrects in the borrower's favor,
-- consistent with the "honor the rows" decision).
update amortization_schedules s
set status = 'paid',
    paid_at = m.release_date
from masterlist m
join loan_applications la on la.id = m.loan_application_id
where s.masterlist_id = m.id
  and la.application_no = 'AN300430'
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
where id = (
  select m.id
  from masterlist m
  join loan_applications la on la.id = m.loan_application_id
  where la.application_no = 'AN300430'
);
