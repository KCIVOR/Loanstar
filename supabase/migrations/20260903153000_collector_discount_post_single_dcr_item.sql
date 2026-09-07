-- Phase 5 of the Collector Discount in DCRR feature. See
-- docs/revision-plans/feature-collector-discount-implementation-plan.md.
--
-- Rewrites post_single_dcr_item to apply a Collector's interest/penalty
-- discount ONLY on a row the discount itself causes to close (Option B —
-- confirmed from the source transcripts: both describe the discount as one
-- single "pay this amount and close now" event, never a standing waiver
-- independent of the account actually closing).
--
-- This resolves what would otherwise be a circular check ("is the row paid"
-- depends on the discount; "does the discount apply" depends on whether the
-- row gets paid) via a two-pass evaluation per targeted row, run BEFORE
-- touching that row's discount columns at all:
--   Pass A (no new discount) — exactly today's existing formula, unmodified.
--     If the payment already covers this without any help from a Collector
--     discount, nothing changes: proceed exactly as before.
--   Pass B (with the discount) — only evaluated when Pass A falls short.
--     Interest side: this row's existing discount_amount is REPLACED, never
--     summed (Rule 7 — same precedent post_internal_transfer already
--     established for Offset-vs-Origination: "the two discounts must never
--     be summed on one installment"), only for a row actually selected for
--     the new interest discount. Penalty side: penalty_amount reduced by
--     this row's penalty_discount_amount share.
--   If Pass B succeeds, the discount is exactly what earned this row's
--     closure — write it for real. If Pass B also fails, the discount does
--     not apply at all: no discount_amount/discount_source/
--     penalty_discount_amount written, row proceeds through the function's
--     existing undiscounted logic unchanged (dcr_items keeps its saved
--     figures for the paper trail — what was attempted, even if it didn't
--     take effect).
--
-- A dcr_items row stores one TOTAL discount amount per type plus the list
-- of installment numbers it applies to (mirroring the Offset discount's own
-- internal_transfers.discount_amount / discounted_installment_nos shape) —
-- this function re-derives each row's own share by dividing that total
-- evenly across the selected installment count, same technique
-- post_internal_transfer already uses (no termination-fee first-row
-- special case here, since that concept is specific to a full-loan-closure
-- offset and doesn't apply to this feature).

CREATE OR REPLACE FUNCTION public.post_single_dcr_item(p_dcr_id uuid, p_payment_id uuid, p_allocations jsonb, p_actor_id uuid, p_now timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_payment record;
  v_masterlist_id uuid;
  v_alloc jsonb;
  v_schedule_id uuid;
  v_amount numeric;
  v_schedule record;
  v_total_due_a numeric;
  v_total_due_b numeric;
  v_new_paid numeric;
  v_new_balance numeric;
  v_fully_settled boolean;
  v_dcr_item record;
  v_interest_count int;
  v_penalty_count int;
  v_interest_share numeric;
  v_penalty_share numeric;
  v_pass_b_interest_term numeric;
begin
  select * into v_payment
  from payments
  where id = p_payment_id
  for update;

  if not found or v_payment.status = 'posted' then
    return jsonb_build_object('skipped', true);
  end if;

  v_masterlist_id := v_payment.masterlist_id;

  select
    coalesce(interest_discount_amount, 0) as interest_discount_amount,
    coalesce(interest_discounted_installment_nos, '{}') as interest_discounted_installment_nos,
    coalesce(penalty_discount_amount, 0) as penalty_discount_amount,
    coalesce(penalty_discounted_installment_nos, '{}') as penalty_discounted_installment_nos
  into v_dcr_item
  from dcr_items
  where dcr_id = p_dcr_id and payment_id = p_payment_id;

  v_interest_count := coalesce(array_length(v_dcr_item.interest_discounted_installment_nos, 1), 0);
  v_penalty_count := coalesce(array_length(v_dcr_item.penalty_discounted_installment_nos, 1), 0);

  for v_alloc in select * from jsonb_array_elements(p_allocations)
  loop
    v_schedule_id := nullif(v_alloc ->> 'amortizationScheduleId', '')::uuid;
    v_amount := (v_alloc ->> 'amount')::numeric;

    insert into postings (
      dcr_id, payment_id, masterlist_id, amortization_schedule_id, amount, posted_by, posted_at
    ) values (
      p_dcr_id, p_payment_id, v_masterlist_id, v_schedule_id, v_amount, p_actor_id, p_now
    );

    if v_schedule_id is not null then
      select id, installment_no, amount_due, amount_paid, penalty_amount, discount_amount, status
      into v_schedule
      from amortization_schedules
      where id = v_schedule_id
      for update;

      if found then
        v_interest_share := case
          when v_interest_count > 0
            and v_schedule.installment_no = any(v_dcr_item.interest_discounted_installment_nos)
          then public.half_up(v_dcr_item.interest_discount_amount / v_interest_count)
          else 0
        end;
        v_penalty_share := case
          when v_penalty_count > 0
            and v_schedule.installment_no = any(v_dcr_item.penalty_discounted_installment_nos)
          then public.half_up(v_dcr_item.penalty_discount_amount / v_penalty_count)
          else 0
        end;

        -- Pass A — unmodified from the pre-existing formula.
        v_total_due_a := greatest(0, public.half_up(
          coalesce(v_schedule.amount_due, 0)
          - coalesce(v_schedule.discount_amount, 0)
          + coalesce(v_schedule.penalty_amount, 0)
        ));

        v_new_paid := coalesce(v_schedule.amount_paid, 0) + v_amount;

        if v_new_paid >= v_total_due_a then
          -- Already settles without any help from a Collector discount —
          -- existing behavior, untouched. Any discount entered for this
          -- row simply never applies; nothing to reconcile later.
          update amortization_schedules
          set amount_paid = v_new_paid,
              status = 'paid',
              paid_at = p_now
          where id = v_schedule_id;
        else
          -- Pass B — only reached because Pass A fell short.
          v_pass_b_interest_term := case
            when v_interest_share > 0 then v_interest_share
            else coalesce(v_schedule.discount_amount, 0)
          end;

          v_total_due_b := greatest(0, public.half_up(
            coalesce(v_schedule.amount_due, 0)
            - v_pass_b_interest_term
            + coalesce(v_schedule.penalty_amount, 0)
            - v_penalty_share
          ));

          if v_new_paid >= v_total_due_b then
            -- The discount is exactly what earned this row's closure.
            update amortization_schedules
            set amount_paid = v_new_paid,
                status = 'paid',
                paid_at = p_now,
                discount_amount = case when v_interest_share > 0 then v_interest_share else discount_amount end,
                discount_source = case when v_interest_share > 0 then 'collector' else discount_source end,
                penalty_discount_amount = case when v_penalty_share > 0 then v_penalty_share else penalty_discount_amount end
            where id = v_schedule_id;
          else
            -- Option B: falls short even with the discount. The discount
            -- does not apply at all — row proceeds exactly as it would
            -- have if no discount had ever been entered.
            update amortization_schedules
            set amount_paid = v_new_paid,
                status = 'partial'
            where id = v_schedule_id;
          end if;
        end if;
      end if;
    end if;
  end loop;

  update payments
  set status = 'posted',
      reviewed_by = p_actor_id,
      reviewed_at = p_now,
      flagged_reason = null,
      flagged_at = null
  where id = p_payment_id;

  v_new_balance := public.recompute_outstanding_balance(v_masterlist_id);
  -- F8 (Phase 6) — a 0 derived balance alone doesn't mean the account is
  -- done; every row must genuinely be paid/rolled too.
  v_fully_settled := public.is_account_fully_settled(v_masterlist_id);

  update masterlist
  set outstanding_balance = v_new_balance,
      account_status = case when v_new_balance <= 0 and v_fully_settled then 'paid' else 'active' end
  where id = v_masterlist_id;

  return jsonb_build_object('skipped', false, 'newBalance', v_new_balance);
end;
$function$;
