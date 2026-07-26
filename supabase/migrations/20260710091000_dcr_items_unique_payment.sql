-- One payment may only appear on one DCR at a time.
-- Rejected DCRs should delete their dcr_items before a payment can be re-batched.
-- Application code also blocks add when payment is on draft/submitted/reconciled.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.dcr_items di
    GROUP BY di.payment_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot add unique(payment_id): duplicate dcr_items still exist';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS dcr_items_payment_id_unique
  ON public.dcr_items (payment_id);
