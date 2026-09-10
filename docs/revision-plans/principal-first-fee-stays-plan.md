# Principal-first payments — a charged late fee stays a balance

**Status:** IMPLEMENTED (2026-09-10, direct) — uncommitted on `develop`
**Branch:** `develop`
**Origin:** demo finding 2026-09-10 — paying exactly the monthly amount on a late
installment, with "Late fee paid" left blank, ran the automatic fee-first split:
the fee got paid out of the payment and principal was left short. There is no way
to say "apply this whole payment to principal, keep the fee outstanding."

---

## Audit (verified against live DB `acopcwlhkovssjnrqygk`, 2026-09-10)

1. **Mechanical block — a ₱0 "Late fee paid" tag can't reach the DB.** Four spots
   each require `amount > 0`:
   - `src/app/collector/dcr/page.tsx` — `penaltyPaidInstallmentNos` filters
     `Number(v) > 0`; `penaltyPaidFields` sent only when `penaltyPaidTotal > 0`.
   - `src/app/remedial/dcr/page.tsx` — same.
   - `src/app/api/collector/dcr/route.ts` — `hasPenaltyPaid = (penaltyPaidAmount ?? 0) > 0 && …`.
   - `addPaymentToDcr` (`src/lib/ar/posting.ts`) — `penalty_paid_installment_nos`
     saved only when `penaltyPaidAmount > 0`.
   `post_single_dcr_item` itself is fine: a tagged installment with
   `penalty_paid_amount = 0` → `half_up(0/count) = 0` → `v_pen_paid = 0`.
   `dcr_items.penalty_paid_amount` is `numeric not null default 0`.

2. **The real blocker — `recompute_account_penalties` erases the fee.** Live
   dry-run: a skip-fee payment (₱90,933.33 principal, ₱0 fee) on AN300461 #6
   (`overdue`, penalty ₱9,320.67) → after `recompute_account_penalties` the row is
   **`paid`** with **penalty ₱0.00**. The compounding loop starts `v_running := 0`;
   base `= amount_due − (amount_paid − fee_paid) = 0` → `v_target = 0`; the Phase-1
   floor `GREATEST(v_target, v_fee_paid)` = `GREATEST(0, 0)` = 0.

3. **The two penalty engines disagree.** `refresh_one_masterlist_aging` (nightly)
   starts `v_running_penalty := penalty_amount` and only ever *adds* periods — it
   would keep and compound the ₱9,320.67. Only `recompute_account_penalties`
   (on-payment) zeroes it.

4. **Balance + ledger are already correct once the row keeps its penalty.**
   `recompute_outstanding_balance` counts `penalty_amount` for non-`paid` rows; the
   "This month" / "Penalty left" columns compute `0 / 25,123.21` correctly. The
   whole defect is the row being flipped to `paid` with the penalty reversed.

5. **This contradicts the client's own accepted statement** (transcript
   2026-09-09 ~52:10–54:53): the client explicitly asks *"nabayaran niya yung
   target dito na amortization. Pero may natira siyang penalty. Paano siyang
   nagko-compute pa rin siya ng penalty doon sa penalty?"* → Rovick: *"anything
   na balance, regardless kung target siya or penalty siya pa sa balance,
   mag-compute pa nyo ng 5%… since na-recorded siya as balance."* → client:
   *"okay naman po yung calculation mismo. Tama yun. Ganun na yung calculation."*
   So the charged penalty **is** a persistent balance that keeps computing — the
   re-read of Phase 1 as reversing a client decision was wrong; it *implements*
   one. The only gap the client named was UI (no per-month view).

---

## Phase 0 — decision (confirmed by the user 2026-09-10: "implement all phases")

**A charged late fee is a balance in its own right.** Paying down principal never
erases it. It only drops via an explicit penalty waiver
(`penalty_discount_amount`) or the on-time correction (Rule 4a). The recompute may
*raise* it (monthly compounding) but never lower it below what is currently
charged, net of any waiver, and never below what has already been collected
against it.

---

## Phase 1 — `recompute_account_penalties`: the charged fee is a floor

**New migration** (both folders), `CREATE OR REPLACE`. In the late-payment
(`ELSE`) branch, after `v_target := v_running;` change the single floor line to:

```sql
      v_target := GREATEST(
        v_target,
        v_fee_paid,
        GREATEST(0, v_row.penalty_amount - v_row.penalty_discount_amount)
      );
```

And in the `UPDATE … SET status = CASE …`, insert one case so a row whose
**principal is covered but fee is still owed** reads `partial`, not `overdue`:

```sql
      status = CASE
                 WHEN v_row.status = 'paid' THEN 'paid'
                 WHEN v_target = 0 AND v_row.amount_paid >= v_net_due - 0.005 THEN 'paid'
                 WHEN v_target > 0 AND v_row.amount_paid >= v_net_due - 0.005 THEN 'partial'
                 WHEN v_target > 0 THEN 'overdue'
                 ELSE v_row.status
               END,
```

Everything else verbatim: `v_ontime_paid` Rule 4a zeroing, the `status = 'paid'`
CONTINUE, `v_net_due`, `v_delta`/periods skip guard, the `penalties` reversal +
signed compensating-row insert, the base formula's `- GREATEST(0, amount_paid -
v_fee_paid)` carve-out.

**Why it's well-targeted:** the new floor only bites when `v_target < charged`,
which only happens once principal has been paid down while the fee wasn't fully
paid — exactly the principal-first case. For the common fee-first partial payment,
`v_fee_paid == charged`, so `GREATEST` is unchanged.

Dry-run before applying (`BEGIN … ROLLBACK`): repeat the Finding-2 dry-run and
confirm the row stays `partial` with penalty `9,320.67`.

---

## Phase 2 — route + `addPaymentToDcr`: accept a ₱0 tag on a selected installment

`src/app/api/collector/dcr/route.ts`:
```ts
const hasPenaltyPaid = (penaltyPaidInstallmentNos ?? []).length > 0;
```
(drop the `> 0` amount test; still passes `penaltyPaidAmount: penaltyPaidAmount ?? 0`.)

`src/lib/ar/posting.ts` `addPaymentToDcr` insert:
```ts
penalty_paid_amount: Math.max(0, penaltyPaidInput?.penaltyPaidAmount ?? 0),
penalty_paid_installment_nos: penaltyPaidInput?.penaltyPaidInstallmentNos ?? [],
```
(save the list whenever `penaltyPaidInput` is present — the route only passes it
when installments are tagged.)

No zod change (`penaltyPaidAmount: z.number().min(0)` already allows 0).

---

## Phase 3 — DCRR modal: "tick + ₱0 = apply all to principal"

`src/app/collector/dcr/page.tsx` and `src/app/remedial/dcr/page.tsx`:
- `penaltyPaidInstallmentNos` = every key of `penaltyPaidSelections` (every ticked
  row), not just those with `Number(v) > 0`.
- `penaltyPaidFields` sent when `penaltyPaidInstallmentNos.length > 0` (drop the
  `penaltyPaidTotal > 0` test).
- "Late fee paid" subtitle updated: *"…Tick a month and leave it ₱0 to put the
  whole payment toward principal and keep the fee outstanding. Leave a month
  unticked to let the system split automatically (fee first)."*
- `<Input>` gets `placeholder="0 = skip fee"`.

---

## Phase 4 — tests

`src/lib/ar/__tests__/penalty-accrual.test.mts`:
- `simulateRecomputeRow` ELSE floor becomes
  `target = Math.max(target, feePaid, Math.max(0, row.penaltyAmount - row.penaltyDiscountAmount))`.
- New: "principal-first: full monthly paid, ₱0 fee tag → penalty stays at charged,
  row not zeroed / not paid".
- New (Phase 4b shadow): a ₱0 penalty-paid tag on a tagged installment → fee
  portion 0 (whole allocation is principal).

`src/lib/ledger/__tests__/build-account-ledger-rows.test.mts`:
- New: a skip-fee installment (target paid, penalty unpaid) → `monthRemaining 0`,
  `penaltyRemaining = penalty`, and the totals still reconcile to `balance`.

---

## Phase 5 — `refresh_one_masterlist_aging` consistency (verify only)

Its accrual loop already starts `v_running_penalty := v_row.penalty_amount` and
only adds periods, so a skip-fee row's fee is kept and compounds. With Phase 1 the
two engines agree. Dry-run one nightly pass over a skip-fee row and confirm the
fee grows (does not reset). No code change expected.

---

## DO NOT TOUCH

- The **fee-first default** — leaving a month unticked still means "fee first".
- Rule 4a on-time zeroing (`v_ontime_paid >= v_net_due` branch).
- `recompute_outstanding_balance`, the ledger row builder, the "This month" /
  "Penalty left" columns.
- Move of Payment, rollover / quarantine rows, aging-bucket thresholds, remedial
  turnover.
- `post_single_dcr_item` Pass A / Pass B, the interest/penalty *waiver* paths.
- The penalty-fee-paid-protection carve-out (`- GREATEST(0, amount_paid - v_fee_paid)`).

---

## EXECUTION LOG — 2026-09-10 (implemented directly at user request)

| Phase | What landed | Verify |
|---|---|---|
| **1** | Migration `20260909233531_penalty_charged_fee_is_a_floor.sql` (both folders). `recompute_account_penalties`: floor `GREATEST(v_target, v_fee_paid, GREATEST(0, penalty_amount − penalty_discount_amount))`; status CASE gains `WHEN v_target > 0 AND amount_paid >= net_due THEN 'partial'`. | Applied live (`20260909233531`). Dry-run: skip-fee payment on AN300461 #6 → row stays **`partial`**, penalty stays **9,320.67** (was flipping to `paid` / 0). #3/#4/#5 (fee-first partials) unchanged. |
| **2** | `api/collector/dcr/route.ts` — `hasPenaltyPaid = (penaltyPaidInstallmentNos ?? []).length > 0` (drop the `> 0` amount test). `posting.ts` `addPaymentToDcr` — save `penalty_paid_installment_nos` whenever `penaltyPaidInput` is present. | tsc/eslint clean. |
| **3** | `collector/dcr/page.tsx` + `remedial/dcr/page.tsx` — `penaltyPaidInstallmentNos` = every ticked row; `penaltyPaidFields` sent on `.length > 0`; "Late fee paid" subtitle explains "tick + ₱0 = all to principal"; `<Input placeholder="0 = skip fee">`. | tsc clean; only the pre-existing `void load()` eslint warning. |
| **4** | `penalty-accrual.test.mts` — shadow `simulateRecomputeRow` floor updated; `phase4bOverride` shadow added; new "principal-first" describe block (4 cases); two Rule-4b "recompute down" tests updated to the 2026-09-10 semantics. `build-account-ledger-rows.test.mts` — new skip-fee reconciliation case. | `npm test` **1635 / 0 fail**. |
| **5** | Migration `20260909234226_aging_partial_when_principal_covered.sql` (both folders). `refresh_one_masterlist_aging` accrual UPDATE: `status = 'overdue'` → CASE that yields `'partial'` when principal is covered. Everything else verbatim. | Applied live (`20260909234226`). Dry-run: nightly aging over a skip-fee row → fee **grows** 9,320.67 → 10,276.04 (not reset). |

**Full-pipeline E2E** (`post_single_dcr_item` invoked directly, in a rolled-back tx):
skip-fee payment on AN300461 #7 → status **`partial`**, amount_paid **90,933.33**,
penalty_amount **4,546.67** (kept), posting.penalty_amount **0** (nothing booked
as fee), stored balance == derived balance **618,520.65**.

**Files:** 2 migrations (×2 folders) + `route.ts`, `posting.ts`, `collector/dcr/page.tsx`,
`remedial/dcr/page.tsx`, 2 test files. Uncommitted on `develop`.

**Behaviour, confirmed against the 2026-09-09 transcript (re-read 2026-09-10):**
the charged fee no longer recomputes *down* on a principal-heavy payment — once
charged it only rises (compounding) or drops via an explicit waiver / genuine
on-time correction. This is exactly what the client asked for at ~52:10–54:53
(*"mag-compute pa nyo ng 5%… since na-recorded siya as balance"* → *"Tama yun.
Ganun na yung calculation"*), so it is **not** a deviation to flag — it closes
the gap the client identified. The fee-first *default* (leave a month unticked)
is unchanged.
