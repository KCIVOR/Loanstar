-- Move of Payment — Fixes Plan, Phase 2 (Issue 3).
-- See docs/revision-plans/move-of-payment-fixes-plan.md.
--
-- Links a recorded surcharge payment to the Move of Payment batch it belongs
-- to. Purely additive: one nullable column, no foreign key (the batch id is
-- a shared marker across the moved amortization_schedules rows, not a row in
-- a parent table). NULL on every existing and every ordinary payment.
--
-- Set only by recordMoveOfPaymentSurcharge (src/lib/ar/move-of-payment.ts).
-- Read by the DCRR allocation preview (Phase 3) to default a surcharge
-- payment to fully-unapplied, and by the ledger (Phase 4) to render it as a
-- distinct "Surcharge received" line that does not net against the loan
-- balance.
alter table public.payments
  add column move_of_payment_batch_id uuid;

comment on column public.payments.move_of_payment_batch_id is
  'Move of Payment (Fixes Plan Phase 2): the batch id of the move this payment is the surcharge for. NULL for every ordinary payment. Set only when a Collector records the surcharge from the Move of Payment page.';
