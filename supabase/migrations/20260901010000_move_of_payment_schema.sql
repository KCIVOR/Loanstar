-- Move of Payment — Phase 1 (schema only, see
-- docs/revision-plans/feature-move-of-payment-implementation-plan.md).
-- Purely additive: extends one CHECK constraint with a new allowed status
-- value, and adds new nullable columns. No existing column, constraint
-- value, or row is touched.
--
-- line_type is untouched — a moved row keeps its original 'standard' /
-- 'interest' / 'principal' line_type; only status changes to 'moved'.
--
-- rolled_at / rolled_into_installment_no are deliberately NOT reused here —
-- see Part 1.4 of the plan doc for why a delinquency rollover and a
-- voluntary, reversible Move of Payment must never share columns.
alter table public.amortization_schedules
  drop constraint amortization_schedules_status_check,
  add constraint amortization_schedules_status_check
    check (status in ('pending','partial','paid','overdue','rolled','moved'));

alter table public.amortization_schedules
  add column moved_at timestamptz,
  add column moved_to_installment_no integer,
  add column move_surcharge_amount numeric,
  -- Collector-entered, not computed (Part 2, item 2 of the plan) — the date
  -- by which the shifted payment must come in before Phase 3 reverts this row.
  add column move_of_payment_deadline date,
  -- Links every row moved together in the same action (Part 2, item 5) —
  -- 1 row for Monthly/Salary/Bi-Monthly, 2 rows (interest + principal) for
  -- Quarterly/Two-Monthly, since those store one payment date as two rows.
  add column move_of_payment_batch_id uuid;

comment on column public.amortization_schedules.moved_at is
  'Move of Payment: when this row was moved. Null unless status = ''moved'' or it was moved and later reverted (cleared on revert).';
comment on column public.amortization_schedules.moved_to_installment_no is
  'Move of Payment: informational only — the lowest installment_no in the next open due-date group at the time this row was moved. Not used by any balance/status mechanics.';
comment on column public.amortization_schedules.move_surcharge_amount is
  'Move of Payment: the one-month-interest surcharge paid for this row. Zero on a principal-line row within a moved batch — only the interest line ever carries a non-zero amount.';
comment on column public.amortization_schedules.move_of_payment_deadline is
  'Move of Payment: Collector-entered deadline for the shifted payment. Never computed — see Part 2 item 2 of the implementation plan.';
comment on column public.amortization_schedules.move_of_payment_batch_id is
  'Move of Payment: shared id linking every row moved together in one action. Always act on the whole batch, never a single row within it — see Part 2 item 5 of the implementation plan.';

-- One-time-use tracking, masterlist-level (the rule is once per LOAN, not
-- once per installment).
alter table public.masterlist
  add column move_of_payment_used_at timestamptz;

comment on column public.masterlist.move_of_payment_used_at is
  'Move of Payment: when this account used its one-time relief. Once set, never cleared — the rule is exactly once per loan, ever, even if the moved payment is later missed and reverted.';
