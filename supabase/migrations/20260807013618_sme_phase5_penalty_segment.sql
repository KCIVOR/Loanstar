-- Phase 5: segment-aware penalty rates (TS + SQL parity).
-- 5.0 backfill masterlist.segment from loan_applications
-- 5.2 refresh_one_masterlist_aging reads penalty_rate vs penalty_rate_sme by segment
-- NULL/unknown segment RAISES — must not silently use Seafarer rate.

-- Expected before: any NULL segment rows created after Stage-0 one-time backfill.
UPDATE public.masterlist m
SET segment = COALESCE(la.segment, 'seafarer')
FROM public.loan_applications la
WHERE m.loan_application_id = la.id
  AND m.segment IS NULL;

-- Orphans (no application): still cannot be NULL for aging — default seafarer explicitly.
UPDATE public.masterlist
SET segment = 'seafarer'
WHERE segment IS NULL;

CREATE OR REPLACE FUNCTION public.penalty_rate_for_segment(p_segment text)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_key text;
  v_cfg jsonb;
  v_rate numeric := 0.05;
BEGIN
  IF p_segment IS NULL OR p_segment NOT IN ('seafarer', 'sme') THEN
    RAISE EXCEPTION
      'masterlist.segment is missing or unknown (%) — cannot choose penalty rate; backfill segment before aging',
      COALESCE(p_segment, 'null');
  END IF;

  v_key := CASE
    WHEN p_segment = 'sme' THEN 'penalty_rate_sme'
    ELSE 'penalty_rate'
  END;

  SELECT value INTO v_cfg
  FROM public.config_settings
  WHERE key = v_key;

  IF v_cfg IS NOT NULL THEN
    v_rate := COALESCE((v_cfg #>> '{}')::numeric, 0.05);
  END IF;

  RETURN v_rate;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_one_masterlist_aging(
  p_masterlist_id uuid,
  p_as_of date DEFAULT CURRENT_DATE
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_segment text;
  v_penalty_rate numeric := 0.05;
  v_t30 int := 30;
  v_t60 int := 60;
  v_t90 int := 90;
  v_cfg jsonb;
  v_overdue RECORD;
  v_next RECORD;
  v_has_overdue boolean := false;
  v_has_next boolean := false;
  v_dpd int := 0;
  v_aging_bucket text := 'current';
  v_outstanding numeric;
  v_penalty numeric;
  v_existing_penalty numeric;
  v_final_penalty numeric := 0;
  v_roll_amount numeric;
  v_now timestamptz := now();
BEGIN
  SELECT segment INTO v_segment
  FROM public.masterlist
  WHERE id = p_masterlist_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Masterlist % not found', p_masterlist_id;
  END IF;

  v_penalty_rate := public.penalty_rate_for_segment(v_segment);

  SELECT value INTO v_cfg
  FROM public.config_settings
  WHERE key = 'aging_thresholds';
  IF v_cfg IS NOT NULL AND jsonb_typeof(v_cfg) = 'object' THEN
    v_t30 := COALESCE((v_cfg ->> '30')::int, 30);
    v_t60 := COALESCE((v_cfg ->> '60')::int, 60);
    v_t90 := COALESCE((v_cfg ->> '90')::int, 90);
  END IF;

  SELECT
    s.id,
    s.installment_no,
    s.due_date,
    s.status,
    s.amount_due,
    s.amount_paid,
    COALESCE(s.penalty_amount, 0) AS penalty_amount,
    s.rolled_at
  INTO v_overdue
  FROM public.amortization_schedules s
  WHERE s.masterlist_id = p_masterlist_id
    AND s.status <> 'paid'
    AND s.status <> 'rolled'
    AND (p_as_of - s.due_date) > 0
  ORDER BY s.due_date ASC, s.installment_no ASC
  LIMIT 1;

  v_has_overdue := FOUND;

  IF v_has_overdue THEN
    v_dpd := p_as_of - v_overdue.due_date;
    IF v_dpd <= 0 THEN
      v_aging_bucket := 'current';
    ELSIF v_dpd <= v_t30 THEN
      v_aging_bucket := '1-30';
    ELSIF v_dpd <= v_t60 THEN
      v_aging_bucket := '31-60';
    ELSIF v_dpd < v_t90 THEN
      v_aging_bucket := '61-90';
    ELSE
      v_aging_bucket := '91+';
    END IF;

    v_final_penalty := COALESCE(v_overdue.penalty_amount, 0);
  END IF;

  IF v_has_overdue AND v_dpd >= 1 THEN
    v_existing_penalty := COALESCE(v_overdue.penalty_amount, 0);
    v_outstanding :=
      COALESCE(v_overdue.amount_due, 0)
      - COALESCE(v_overdue.amount_paid, 0)
      + v_existing_penalty;
    v_penalty := public.half_up(v_outstanding * v_penalty_rate);

    IF v_penalty > v_existing_penalty THEN
      UPDATE public.amortization_schedules
      SET
        penalty_amount = v_penalty,
        status = 'overdue'
      WHERE id = v_overdue.id;

      INSERT INTO public.penalties (
        masterlist_id,
        amortization_schedule_id,
        amount,
        rate_applied,
        notes
      ) VALUES (
        p_masterlist_id,
        v_overdue.id,
        public.half_up(v_penalty - v_existing_penalty),
        v_penalty_rate,
        'Missed payment penalty'
      );

      v_final_penalty := v_penalty;
    END IF;

    IF v_dpd >= v_t30 AND v_overdue.rolled_at IS NULL THEN
      SELECT
        s.id,
        s.installment_no,
        s.amount_due
      INTO v_next
      FROM public.amortization_schedules s
      WHERE s.masterlist_id = p_masterlist_id
        AND s.status <> 'paid'
        AND s.status <> 'rolled'
        AND s.id <> v_overdue.id
      ORDER BY s.installment_no ASC
      LIMIT 1;

      v_has_next := FOUND;

      IF v_has_next THEN
        v_roll_amount := public.half_up(
          COALESCE(v_overdue.amount_due, 0)
          - COALESCE(v_overdue.amount_paid, 0)
          + v_final_penalty
        );

        UPDATE public.amortization_schedules
        SET amount_due = COALESCE(amount_due, 0) + v_roll_amount
        WHERE id = v_next.id;

        UPDATE public.amortization_schedules
        SET
          status = 'rolled',
          rolled_at = v_now,
          rolled_into_installment_no = v_next.installment_no
        WHERE id = v_overdue.id;

        INSERT INTO public.penalties (
          masterlist_id,
          amortization_schedule_id,
          amount,
          rate_applied,
          notes
        ) VALUES (
          p_masterlist_id,
          v_overdue.id,
          v_roll_amount,
          v_penalty_rate,
          format(
            '30-day rollover: %s rolled into installment #%s',
            to_char(v_roll_amount, 'FM999999990.00'),
            v_next.installment_no
          )
        );
      END IF;
    END IF;
  END IF;

  UPDATE public.masterlist
  SET
    aging_bucket = v_aging_bucket,
    remedial_flag = (v_aging_bucket = '91+'),
    account_status = CASE
      WHEN v_aging_bucket = '91+' THEN 'remedial'
      ELSE account_status
    END
  WHERE id = p_masterlist_id;
END;
$$;

REVOKE ALL ON FUNCTION public.penalty_rate_for_segment(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.penalty_rate_for_segment(text) TO postgres, service_role;
