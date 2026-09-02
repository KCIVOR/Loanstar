-- Move of Payment — Addendum 2, Phase 1 (schema only, see
-- docs/revision-plans/feature-move-of-payment-implementation-plan.md,
-- "Addendum 2" and its validation pass).
-- Purely additive: one new nullable column. No existing column, constraint,
-- or row is touched.
--
-- Why a SEPARATE column and not a second meaning on move_of_payment_batch_id:
-- move_of_payment_batch_id already means exactly one thing that multiple
-- consumers depend on — "this row was itself moved away" (build-account-
-- ledger-rows.ts routes any row carrying it into the moved-batch summary
-- render path; the Phase 3 revert query matches status = 'moved' rows by it).
-- The row appended by a Move of Payment (the one-cycle schedule extension,
-- Addendum 2 Gap 1) is the OPPOSITE: a brand-new, ordinary 'pending'
-- installment that exists *because of* a move. Tagging it with
-- move_of_payment_batch_id would (1) make it vanish from every ledger via
-- that same summary-collapse branch and (2) never be found by the revert
-- query (its status is 'pending', not 'moved'). Same class of mistake as
-- Part 1.4's note about not reusing rolled_at / rolled_into_installment_no.
--
-- Set ONLY on the newly-appended installment row(s), at creation, to the
-- batch id of the move that caused the extension. Never set on the
-- originally-moved row. Because build-account-ledger-rows.ts never reads
-- this column, the appended row falls through to the ordinary
-- "installment, no credits yet" render branch — exactly the intent.
alter table public.amortization_schedules
  add column deferred_from_move_of_payment_batch_id uuid;

comment on column public.amortization_schedules.deferred_from_move_of_payment_batch_id is
  'Move of Payment (Addendum 2 Gap 1): set only on the installment row(s) appended to the end of the schedule when a Move of Payment shifts the loan out by one payment cycle. Holds the move_of_payment_batch_id of the move that created this row. Never set on the row that was itself moved (that uses move_of_payment_batch_id). Phase 3 revert deletes rows by this column when the batch reverts.';
