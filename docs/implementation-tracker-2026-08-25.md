# Implementation Tracker — Aug 25, 2026 Meeting

Source: [meeting-minutes-2026-08-25.md](meeting-minutes-2026-08-25.md), cross-checked against the Fathom transcript (https://fathom.video/calls/797296804) and the live codebase/database on 2026-08-26.

**Legend:** `[ ]` Not started · `[~]` In progress · `[x]` Done

Every item below carries an **Audit** line — the concrete evidence (file:line, DB query result, or transcript quote) it was checked against. Where the evidence didn't match what the item assumed, that's called out explicitly rather than silently corrected.

---

## 🔧 Fixes (Already Built, Needs Correction)

### [x] 1. Offset / Other Loan labels are reversed
- **Issue:** "Other Loan" and "Offset" labels were swapped relative to what they do.
- **Expected:** "Offset" = full settlement, "Other Loan" = partial payment.
- **Audit:** Confirmed in [ComputationPanel.tsx:1105](../src/components/csa/ComputationPanel.tsx) — `Offset{...} (full settlement)` — and [:1180](../src/components/csa/ComputationPanel.tsx) — `Other Loan amount`. Labels match the corrected mapping; six other surfaces (deduction-breakdown, Committee summary, AR transfer labels, API validation messages) were also swapped for consistency and their tests updated.
- **Status: DONE.**

### [x] 2. Add-on Month field doesn't accept 0
- **Issue:** Field rejected `0` — HTML `min="1"` on the input.
- **Audit:** [ComputationPanel.tsx:1083](../src/components/csa/ComputationPanel.tsx) now reads `min={0}` for all segments. Went through two rounds: first made it segment-conditional (SME/Individual=0, Seafarer=1) to match `sf.ts`'s hard `addonMonths < 1` throw; user then explicitly asked for **all segments** to accept 0, so the Seafarer-only G1 constraint was removed from `sf.ts`, the Zod schema comment, and a **DB check constraint** `computations_addon_months_check` (was `>= 1`, unconditional, blocking Seafarer saves even after the app-layer fix) — migration `20260826150000_computations_addon_months_allow_zero.sql`, applied live and confirmed via `pg_get_constraintdef`.
- **Status: DONE.**

### [x] 3. Add-on Month doesn't correctly shift the first payment date
- **Issue:** Entering an add-on value didn't reliably update the displayed first payment date.
- **Audit:** Root cause found: `ComputationPanel`'s "Compute" doesn't set the result directly — it POSTs, then calls `onUpdated()` which triggers the parent page's `load({silent:true})` refetch. That `load()` had no request-ordering guard ([csa/applications/[id]/page.tsx:271](../src/app/csa/applications/[id]/page.tsx:271), [committee/applications/[id]/page.tsx:423](../src/app/committee/applications/[id]/page.tsx:423)). Two recomputes close together could resolve out of order and the stale one would silently overwrite the fresh one. Fixed with a `loadSeq` ref sequence-guard on both pages. A first pass of this fix had its own bug — the `finally` block still cleared `loading` for a stale/superseded call even when it skipped writing `data`, which caused a **new**, worse symptom (a false "Application not found" flash on every page load, reproducible via React StrictMode's double-invoked mount effect in dev). Fixed by gating `finally`'s `setLoading(false)` on the same sequence check.
- **Caveat:** Never visually confirmed in a live browser session — verified by code reasoning and the sequence-guard logic only. If you can reproduce the original symptom, worth a live re-check.
- **Status: DONE (high confidence, not visually verified).**

### [x] 4. SME application form field order is wrong
- **Issue:** Individual/Representative section rendered above Business.
- **Audit:** [ApplicantProfileFields.tsx](../src/components/borrowers/ApplicantProfileFields.tsx) — the two `isSme`-gated blocks (lines ~405–1097 Individual, ~1099–1375 Business) were physically swapped via a line-range reorder (verified: same line count, diff showed only reordering, no logic/label changes). Business now renders first.
- **Note:** `isSme = segment === "sme" || segment === "individual"` — the reorder affects **both** SME and Individual segment applications, since they share this toggle. Flagged to the user; no correction requested, so left as-is.
- **Status: DONE.**

### [x] 5. Redundant "Application Form" upload in document intake
- **Issue:** "Application Form" listed as an upload checklist item, but it's filled out in-system.
- **Audit:** Root cause was **seeded data**, not code — a single `stage_checklists` row (`stage=intake, segment=individual, document_type_id=application_form`). Confirmed via direct query before and after: `select count(*) from stage_checklists where document_type_id = '31ab6298-...'` → 1 before, **0 after**. Migration `20260826160000_remove_application_form_from_intake_checklist.sql` applied live. Only ever seeded for `segment=individual` — SME/Seafarer never had this row.
- **Status: DONE.**

### [x] 6. AR rounded-off amount has no visual border
- **Issue:** Rounded-off amount blends into surrounding numbers.
- **Audit:** Located the "Write off ₱X" buttons on [masterlist/[id]/page.tsx:979](../src/app/ar/masterlist/[id]/page.tsx:979) (rounding write-off candidates). `.btn-ghost` never sets `border-color` (confirmed in [globals.css:357-424](../src/app/globals.css:357) — base `.btn` has `border: 1px solid transparent`, ghost doesn't override it). Changed `variant="ghost"` → `variant="outline"`.
- **Status: DONE.**

### [ ] 7. Print/generate-document button needs a border — **RESCOPED, item description is likely wrong**
- **Issue as written:** "Print/preview trigger button has no border/visible styling."
- **Audit:** No print/generate button was found anywhere in the CSA computation flow (`ComputationPanel.tsx`, `csa/applications/[id]/page.tsx` — grepped for "print", "Preview", "generate", case-insensitive, zero matches). **Went back to the actual transcript** for this moment instead of guessing — it's not about a border at all:
  > **Conference:** "Mag-print ka nga dyan." / **rovick:** "Kaya niya ba mag-print?" / **Conference:** "Print view... Hindi eh. Hindi niya nakukuha yung active print sheet, active print area."
  This describes the print output not correctly scoping to just the intended printable "loan information" sheet (print-CSS/print-area problem) — the button itself was clicked fine. This is a different, more substantive bug than "add a border."
- **Recommendation:** Re-verify with Rovick which screen/button this was (likely the loan-information/computation print view referenced elsewhere in the transcript) and rewrite the ticket around print-area scoping, not styling.
- **Status: NOT STARTED — needs rescoping before work begins.**

### [x] 8. Release Date is not being captured/shown
- **Issue:** No dedicated, reliably populated "Release Date" field.
- **Audit:** Implemented across 7 files by a separate session/Cursor pass; independently verified each claim directly against the current files rather than trusting the summary (per the standing validation workflow):
  - `computations.release_date` and `.first_payment_date` are real `date` columns (confirmed via `information_schema.columns`).
  - Displayed in [ComputationPanel.tsx:1600](../src/components/csa/ComputationPanel.tsx:1600), [committee/applications/[id]/page.tsx:1916](../src/app/committee/applications/[id]/page.tsx:1916), [ComputationSign.tsx:193](../src/components/borrower/ComputationSign.tsx:193).
  - Borrower API forwards it: [borrower/.../computation/route.ts:78](../src/app/api/borrower/applications/[id]/computation/route.ts:78).
  - Set to the real date at actual release: [release-service.ts:994](../src/lib/lra/release-service.ts:994) — `release_date: new Date().toISOString().slice(0,10)` on `recordRelease`.
- **Status: DONE — independently verified, not just summary-trusted.**

### [x] 9. Penalty figures duplicate/combine incorrectly during testing
- **Issue:** Adjusting a payment date caused penalty entries to duplicate/merge; a month's target amount appeared to double.
- **Audit:** Root cause confirmed with live data on a real account (masterlist `93986c2f-...`, loan `AN300420`): the penalty formula included the *already-accrued* penalty in its own base (`outstanding = amount_due - amount_paid + penalty_amount`), so every re-run of the aging check (nightly cron **and** every Collector accounts-list page load, which calls it once per assigned account with zero rate-limiting) computed a strictly larger number and inserted another audit row. Six consecutive test runs produced 6604.83 → 330.24 → 16.51 → 0.83, converging to rate/(1-rate) ≈ 5.26% instead of the configured 5%.
  - **Fixed** in [posting.ts:434](../src/lib/ar/posting.ts:434) and the SQL twin (migration `20260826170000_penalty_accrual_idempotent.sql`, rebuilt from the **live** function definition so a later segment-aware-rate migration wasn't reverted).
  - **Verified live:** ran the fixed function 6x consecutively on the test account — penalty held at exactly ₱971.03, 1 audit row (was 6 escalating charges before).
  - **Separately**, the dev "simulate delinquent" tool had its own bug shifting only *open* installments (not rolled ones), which collapsed 4 installments onto the same calendar date on repeated use — fixed in [dev-simulate-aging/route.ts:37](../src/app/api/ar/masterlist/[id]/dev-simulate-aging/route.ts:37) to shift the whole schedule together.
  - **Data repair:** scanned the whole `penalties` table — **8 accounts total** were affected (not just the test one): AN300420 (dates collapsed, fully rebuilt from source computation, zero real payments existed so nothing lost) and 7 more (AN300357/358/359/360/361/362, AN300418) with intact schedules but one over-accrued installment each, totaling **₱8,721.03** over-charged. All corrected — duplicate accrual rows replaced with a single correct row carrying a note recording what it superseded. Confirmed via a final sweep: 0 installments with incorrect penalty, 0 with duplicate accrual rows, system-wide.
  - Regression tests added (`aging-parity.test.mts`): repeat-run no-op, and a 25-run stability test asserting the penalty stays at exactly one charge.
- **Known pre-existing gap, out of scope for this fix:** the *last* installment in a schedule never compounds — compounding is delivered by the 30-day rollover folding into the *next* installment, but the final installment has no "next," so it accrues once and then never grows again no matter how long it stays unpaid.
- **Status: DONE — fixed, live-verified, and all known corrupted data repaired.**

### [~] 10. Invoice Financing incorrectly allows "Add-on Month" — **mostly moot now, minor UI cleanup left**
- **Issue as written:** Add-on Month is selectable for Invoice Financing loans, which shouldn't have it.
- **Original audit (2026-08-26):** "Invoice Financing" did not exist — no loan type, no code.
- **Re-audit (2026-09-01):** Invoice Financing now exists, delivered as the `weekly` payment frequency (migration `20260828130000_add_weekly_payment_frequency.sql`, plus [invoice.ts](../src/lib/computation/invoice.ts) — weekly interest-only, 1–3 month terms, principal due one week after the last interest payment). It is selectable in [ComputationPanel.tsx:1589](../src/components/csa/ComputationPanel.tsx:1589) as `Weekly (Invoice Financing)`.
  - **Functionally already safe:** the weekly path routes through `computeInvoiceLoan`, which does not take `addonMonths` at all ([computation.ts:239-245](../src/lib/csa/computation.ts:239)) — any add-on value entered is silently ignored for Invoice loans, so it can't corrupt the schedule.
  - **Remaining gap (cosmetic):** the "Addon months" input at [ComputationPanel.tsx:1669-1686](../src/components/csa/ComputationPanel.tsx:1669) is still rendered (and `required`) for every schedule type including `weekly` — it should be hidden/disabled when `selectedScheduleType === "weekly"`, the same way the Seafarer-only "Due date" picker is conditionally rendered.
- **Status: IN PROGRESS — no longer blocked; the underlying bug (add-on affecting Invoice math) can't happen, only the field's visibility for the weekly type still needs a small conditional.

### [x] 11. Discounts can currently be applied to overdue/due amounts — **RESOLVED as part of Feature #1**
- **Original audit (2026-08-26):** No discount feature existed at all — this only made sense as a rule *inside* Feature #1's build.
- **Re-audit (2026-09-01):** Feature #1 (early-settlement discount) is now built, and the due-date cutoff is enforced mechanically, not left to staff judgment — only not-yet-due installments are ever offered as discount targets. Backend: [offset-discount.ts](../src/lib/computation/offset-discount.ts), [discount-units.ts](../src/lib/computation/discount-units.ts); the modal in [ComputationPanel.tsx](../src/components/csa/ComputationPanel.tsx) excludes due/passed installments; regression test [discount-never-negative.test.mts](../src/lib/csa/__tests__/discount-never-negative.test.mts).
- **Status: DONE — the "no discount on due/overdue amounts" rule is enforced by Feature #1's implementation.**

---

## 🆕 Features to Build (Not Yet in the System)

### [x] 1. Early-settlement discount calculator — **BUILT (combined plan, Phases 0–9 + 5b)**
- **Re-audit (2026-09-01):** Built together with Feature #4 (new-loan origination discount) under [feature-loan-discounts-implementation-plan.md](revision-plans/feature-loan-discounts-implementation-plan.md) (note: that plan's header still reads "Plan only" — stale; the body carries per-phase "corrected during validation" notes and a Phase 5b added after the Phase 9 walkthrough).
  - **Schema:** `amortization_schedules.discount_amount`, `computations.origination_discounts` — migrations `20260828100000_loan_discounts_schema.sql`, `20260828110000_origination_discount_reversion.sql`, `20260828120000_offset_discount_closure.sql`, plus balance/rollover fixes (`20260831040000`, `20260831050000`) and live-data repairs (`20260831150000_repair_orphaned_discounted_rows.sql`, `20260831170000_repair_an300430_discount_decision.sql` — real corruption was found and fixed, i.e. this has been exercised on live data).
  - **Offset (early-settlement) math:** [offset-discount.ts](../src/lib/computation/offset-discount.ts) — gross interest of ticked future installments − one-month termination fee, floored at 0. Per-installment target data exposed on the CSA computation `activeLoans` response; modal + row breakdown in [ComputationPanel.tsx](../src/components/csa/ComputationPanel.tsx) (`openDiscountModal`, `discountModalDiscounts`); closure wiring via `post_internal_transfer` (subtracts `discount_amount` in its payoff threshold).
  - **Origination discount:** stored/validated on both CSA ([computation.ts](../src/lib/csa/computation.ts), [computation/route.ts](../src/app/api/csa/applications/[id]/computation/route.ts)) and Committee ([override/route.ts](../src/app/api/committee/applications/[id]/override/route.ts), [negotiation/service.ts](../src/lib/negotiation/service.ts)) paths; per-installment percent input UI in ComputationPanel (`originationDiscountRows`, `originationModalDiscounts`); applied at release in `initializeArAccount`; reverts to 0 when the due date passes via the nightly aging job (TS + SQL twin).
  - **Ledger:** shared `Discount` column in [AccountLedger.tsx:121](../src/components/ledger/AccountLedger.tsx:121).
  - **Tests:** `offset-discount.test.mts`, `offset-discount-closure.test.mts`, `discount-never-negative.test.mts`, `masterlist-discount-basis.test.mts`, `net-installment-due.test.mts`, `discount-units.test.ts`.
- **Still open:** the separate penalty-balance discount for Collection/Remedial (see new Fix/Feature item below) is explicitly **not** part of this and remains unbuilt.
- **Status: DONE — implemented on both CSA and Committee paths, ledger-visible, tested, and exercised against live data (repair migrations).**

<details><summary>Original 2026-08-26 audit (rules confirmed from transcript)</summary>

- **Audit:** Confirmed via the full raw transcript, now saved at [transcription-2026-08-25.md](transcription-2026-08-25.md) — Conference: *"Nasa calculator po kaya yun?"* / rovick: *"Na, hindi. Wala siya sa calculator."* Zero `discount` matches anywhere in `src/` — genuinely not built.
- **All rules below are independently re-verified against the raw transcript (not the meeting-minutes summary) — the two items previously marked "not yet confirmed" are now closed:**
  - **Interest-only — principal always paid back in full:** *"ang bumabalik lang sa company, yung principal... pero yung ibang interest na dini-discount, i-we-waive."*
  - **Separate one-month termination fee on top, subtracted from the discount pool (not added to it):** *"magsisingin lang yan siya ng one month na interest doon sa as surcharge."* Worked numeric example in the transcript: gross discountable interest ₱851.52, minus the one-month-interest termination fee ₱212.88, nets to a **final discount of ₱638.64**.
  - **Per-month selectable, not all-or-nothing:** *"pwede i-tick mo lang na itong two months, eto lang ang interest ang i-discount ko."*
  - **Applies only at the offset/early-termination scenario, never the "other loan" partial-payment scenario:** *"Saan po yun? Sa offset? Sa other loan? Yung sa offset yun, wala sa other loan."*
  - **Due-date cutoff rule — CONFIRMED (previously open):** anything already at or past its due date is "due and demandable" and cannot be discounted at all — only future, not-yet-due installments qualify. Directly stated, repeatedly: *"once na lumagpas kasi ng due date, eto due and demandable na to. Ibig sabihin, wala ng discount to... Bawal na pong discount."* and *"Basta anything na lumabas sa due date, automatic. Yung next na due date, due and demandable... Hindi mo siya pwedeng applyan ng discount."* The transcript also flags this as a **current informal malpractice to fix**: staff sometimes give an ad-hoc "one month" or "50%" discount on an already-due amount to appease a difficult borrower even though the rule forbids it — *"May scenario kasi na pag nainis sila sa borrower... Minsan, binibigyan lang nila ng isang buwan na discount... Kaya, inanok ko na mas maganda kung tickable na lang siya"* — i.e., the ticket's per-month-selectable UI is explicitly meant to close this loophole by making eligible months mechanically enforced, not staff-judgment-based.
  - **Committee/CSA approval-vs-entry split — CONFIRMED (previously open):** CSA can **enter/request** a discount as early as the application stage (*"kay CSA pa lang, nagre-request na sila ng discount"*), but CSA **cannot decide** — *"since si CSA, hindi siya makadesight... ang pwede lang magbigay ng discount, sa committee."* Explicit decision on access: rather than restrict the entry field to one role (risk of becoming a bottleneck — *"baka magiging blocker siya ng computation"*), **anyone with calculator access can enter/edit the proposed discount, but only Committee actually grants it** — matches the ticket's existing framing exactly. Collection/Collector has **no role** in this particular discount — *"Walang nang kinalaman si collection ngayon"* — this scenario is CSA/Committee only, at application/computation time.
- **New, out-of-scope finding — flag for a separate ticket, not part of this build:** the transcript describes a **second, distinct discount scenario** already loosely known from the meeting-minutes (penalty section) but not yet its own tracked item: Collection/Remedial can offer a discount on an **already-accumulated penalty balance** to get a delinquent borrower to settle immediately — *"malami na yung penalty niya... bayaran niyo ako ngayon, kahit i-discount ko na itong, ano, kalahati, 30% o 20%."* This is **not** interest-on-a-future-installment (this Feature #1) — it's a different discount, on penalty, owned by Collection/Remedial, not CSA/Committee. Recommend adding as its own tracker item rather than folding into this one, since the rules, owner, and trigger point are all different.
- **Status (2026-08-26): NOT STARTED.**

</details>

### [x] 2. "Move of Payment" feature — **BUILT + live-verified 2026-09-01 (core); one addendum not started**
- **Original audit (2026-08-26):** Zero matches anywhere in `src/`. Not built.
- **Re-audit (2026-09-01):** Core feature shipped under [feature-move-of-payment-implementation-plan.md](revision-plans/feature-move-of-payment-implementation-plan.md) (Phases 1–7).
  - **Schema:** migrations `20260901010000_move_of_payment_schema.sql`, `20260901020000_move_of_payment_revert_sql_twin.sql` (adds `masterlist.move_of_payment_used_at`, `amortization_schedules.status='moved'` + `moved_at`/`move_of_payment_batch_id`/`move_of_payment_deadline`/`move_surcharge_amount`).
  - **Logic:** [move-of-payment.ts](../src/lib/ar/move-of-payment.ts) — one-time-per-loan, Collector-chosen open due date, surcharge = one month's real interest (`buildDiscountUnits`), Invoice (weekly) excluded, deadline required and must be a real future date; reverts via the aging job (TS + SQL twin) if the deadline passes unpaid.
  - **UI/route:** [collector/accounts/[id]/move-of-payment/page.tsx](../src/app/collector/accounts/[id]/move-of-payment/page.tsx) + [route.ts](../src/app/api/collector/accounts/[id]/move-of-payment/route.ts), with a per-installment candidate list (`listMoveOfPaymentCandidates`) so the Collector picks which due date to move.
  - **Tests:** `move-of-payment.test.mts`, `refresh-masterlist-aging-move-of-payment.test.mts`.
  - **Live-verified 2026-09-01** — see [feature-move-of-payment-validation-checklist.md](revision-plans/feature-move-of-payment-validation-checklist.md) (happy path + already-used guard observed live).
- **Addendum NOT started:** making the surcharge a real posted `payments` row (via `addPaymentToDcr`), appending the deferred final installment row (`deferred_from_move_of_payment_batch_id`), collecting reference no./channel in the form, and the "Terms" label fallback on [ar/masterlist/[id]/page.tsx](../src/app/ar/masterlist/[id]/page.tsx). Two open decisions block it (schedule updates immediately vs. on AR posting; what happens to the surcharge cash on revert) — see the implementation plan's addendum.
- **Status: DONE (core, live-verified). Addendum pending your call on 2 decisions.**

### [x] 3. Co-Borrower section on the application form — **BUILT (2026-09-01)**
- **Audit:** No real co-borrower data capture exists. The only trace is a hardcoded empty placeholder in a PDF template context: [application-form-context.ts:153](../src/lib/documents/generators/application-form-context.ts:153) — `coBorrowerName: ""`, always blank. Confirms this is unbuilt, and explains why generated documents currently show an empty co-borrower field rather than omitting it.
- **Context (transcript, 2026-08-25):** Discussion started from the Promissory Note template, which has a right-side co-borrower slot (name + address). A co-borrower is a second person who also signs the loan documents — distinct from the SME business *representative* (a business application can have both).
- **Expected result:**
  1. **Co-Borrower section on the application form** — repeatable rows (multiple co-borrowers allowed, *"pwede yung madami din"*), each with **Full Name** and **Address** minimum. Optional / not required by default.
  2. **Approving-officer "co-borrower required" flag** at the approval/Committee stage — the approving officer is the one who dictates it, when the primary borrower's capacity isn't sufficient. This is a distinct flag, not a general send-back-for-revision.
  3. **Routing:** flagging it sends the application back to CSA to fill in the co-borrower name/address; after CSA saves, it proceeds **straight to LRA, bypassing CIG** (approval already happened).
  4. **Persistence + propagation:** stored on the application, visible in CI/CIG views, and fed into the document generators so the PN / application form render the real co-borrower details instead of a blank slot.
  5. **Applies to any loan type, secured or unsecured** — *"Hindi, sa lahat yan eh"* was Rovick correcting the idea that it's only for car/collateral loans. It is **not** collateral-only.
  6. **Seafarer segment must NOT see the co-borrower section** — confirmed by Rovick, 2026-09-01. (The transcript's "sa lahat" was about loan types, not segments; seafarer is explicitly excluded.)
- **Plan + build log:** [feature-co-borrower-section.md](revision-plans/feature-co-borrower-section.md) — all 10 phases (0–9) DONE 2026-09-01. `co_borrower_required` + `co_borrowers` jsonb on `loan_applications` (migration `20260901050000`, applied live); Committee sets the requirement via a checkbox on **Approve** (not a revisit / re-vote); a dedicated service-client route (`PATCH /api/applications/[id]/co-borrowers`, `intake.edit` or `committee.execute_trigger`) fills it pre- **and** post-approval with no RLS change; **advisory only** — `queueForLra` / release path untouched, LRA shows an amber "you may still proceed" warning when requested-and-empty; docs populate `coBorrowerName`/`coBorrowerAddress`/`hasCoBorrower`; seafarer excluded at 3 points. Bypassing CIG + a second vote is automatic (the flag never routes anywhere).
- **Verification:** test suite 1509/1509; live end-to-end on the dev server for every path demo data allows (CSA render + edit + persist + audit + reload, all 5 route rejections, application-form PDF containing the co-borrower name, seafarer-exclusion); committee-approval + LRA-render paths locked by unit/source-scan tests (see the plan's Phase 9 status).
- **Status: DONE.**

### [x] 4. Automatic/sequential loan-account numbering — **ALREADY DONE, tracker was wrong**
- **Issue as written:** Loan account number is manually entered; needs auto-generation matching the loan-number series.
- **Audit:** `loan_account_no` is set directly from `app.application_no` at masterlist creation ([masterlist.ts:130](../src/lib/ar/masterlist.ts:130) — `loan_account_no: app.application_no`). `application_no` itself has a DB-level default: `select column_default from information_schema.columns where table_name='loan_applications' and column_name='application_no'` → `generate_application_no()`. No manual-entry UI for this field was found anywhere under `src/app/ar/masterlist` (only read-only display).
- **Status: This already works exactly as requested — auto-generated, sequential, follows the loan-number series. No action needed. Recommend closing this item, not building it.**

### [x] 5. Bi-Monthly (and other) payment frequency options — **BUILT**
- **Original audit (2026-08-26):** Only `monthly` and `semi_monthly` existed; this would be building the computation logic from scratch, not a UI-surfacing task.
- **Re-audit (2026-09-01):** The full set of extra frequencies now has real computation logic and a schedule-type selector in [ComputationPanel.tsx:1589-1592](../src/components/csa/ComputationPanel.tsx:1589) (`Weekly (Invoice Financing)`, `Bi-monthly (every 15 days)`, `Quarterly`, `Two-monthly`) plus `Daily`.
  - **Migrations:** `20260828130000_add_weekly_payment_frequency.sql`, `20260828140000_add_bi_monthly_payment_frequency.sql`, `20260828140448_add_loan_applications_schedule_type.sql`, `20260828150001_add_quarterly_two_monthly_frequencies.sql`, `20260828160000_add_daily_payment_frequency.sql`.
  - **Generators:** `generateBiMonthlySchedule`, `generateQuarterlySchedule`, `generateTwoMonthlySchedule` in [ar/schedule.ts](../src/lib/ar/schedule.ts); `computeInvoiceLoan` in [invoice.ts](../src/lib/computation/invoice.ts); all wired through [csa/computation.ts](../src/lib/csa/computation.ts) and consumed by `buildDiscountUnits`, PDC, and AR off the same generators.
  - **Term guards:** Quarterly must be divisible by 3, Two-monthly by 2, Invoice capped at 1–3 months — enforced client-side ([ComputationPanel.tsx:1277-1281](../src/components/csa/ComputationPanel.tsx:1277)) and in `computeInvoiceLoan`.
  - **Tests:** `schedule.test.ts`, `schedule-f2.test.mts`, `invoice.test.ts`, `release-date.test.mts`, `discount-units.test.ts`.
- **Status: DONE — Bi-Monthly, Quarterly, Two-monthly, Weekly (Invoice), and Daily all have real schedule generation and are selectable on the computation form.**

### [x] 6. Seafarer cutoff-based due date logic — **picker built, shipped, and verified on both CSA and Committee**
- **Issue as written:** Not yet built, blocked on a cutoff explainer doc from Rovick.
- **Audit:** The 22nd-cutoff rule was **already implemented and correct** before this item started: [release-date.ts:5-32](../src/lib/computation/release-date.ts:5) `computeFirstPaymentDate`. What was missing was the due-day picker itself — confirmed live, word-for-word, against the raw Fathom transcript (not just the meeting-minutes summary): CSA picks one of exactly three paydays (5th/15th/25th), matched to whichever is closest to the borrower's actual salary date, Seafarer-only.
- **Built via a 5-phase plan** ([feature-seafarer-due-date-picker.md](revision-plans/feature-seafarer-due-date-picker.md)), implemented directly (not via Cursor, per explicit instruction for this item):
  - **Phase 1:** CSA's computation route now rejects any Seafarer save with a `dueDay` other than 5/15/25, or missing entirely. SME/Individual unchanged (still optional, still defaults to 10).
  - **Phase 2:** Committee's override route had **zero** `dueDay` handling before this — added the same rule there (`OverrideInput` type, `overrideSchema`, `persistOverrideComputation`'s existing-value-preserving pattern), closing the gap where Committee could bypass Phase 1's rule entirely.
  - **Phase 3:** The actual picker — a 3-option Select in [ComputationPanel.tsx](../src/components/csa/ComputationPanel.tsx), Seafarer-only, required, blocks submit client-side if unset, hydrates from an existing computation on reload. Covers both CSA and Committee since they share this component.
  - **Phase 4:** The two duplicated inline guards were extracted into one pure, shared function — `validateSeafarerDueDay()` in [computation.ts](../src/lib/csa/computation.ts) — after confirming this codebase has zero Supabase-mocking test infrastructure anywhere and *every* existing test targets a pure `src/lib` function, never a route directly. 6 new tests in [computation.test.mts](../src/lib/csa/__tests__/computation.test.mts), including explicit SME/Individual regression guards.
- **Verified after every phase:** `tsc --noEmit` clean, full suite green throughout (1363 → 1369, exactly +6 from Phase 4's new cases, no unrelated shift).
- **Phase 5 — manual browser walkthrough — DONE for CSA, unconfirmed for Committee.** Logged in via the login page's own "Quick login (seed accounts)" panel (a one-click dev button per role, not a password — no credentials were entered by Claude), against a real Seafarer application (AN300349), using the in-app "Dev autofill" tool to clear unrelated prerequisites (application form fields, DPA orientation, NCL check, initial interview) so the computation form itself was reachable.
  - **Picker renders Seafarer-only, exactly 3 options:** confirmed via the live DOM — `Due date *` / `Select payday` / `5th` / `15th` / `25th`.
  - **Submit blocked with no due date selected:** clicked Recalculate with the field empty — confirmed via `element.validity.valueMissing === true` and confirmed **no POST request fired** (checked network log) — blocked by the native HTML5 `required` validation before any JS runs, same mechanism as the already-required Amount/Terms fields. Stronger than the JS-level guard, which is a defensive backup only.
  - **Valid submission works end-to-end:** selected 15th, clicked Recalculate → **200 OK** POST. Queried the live DB directly afterward: `due_day = 15`, `first_payment_date = 2026-11-15` — verified against the cutoff math by hand (Aug 13 release, before the 22nd cutoff → counts as August; +2 addon months → November; day 15 → Nov 15). Correct.
  - **Round-trips on reload:** hard-navigated back to the same application URL, read the live DOM again — `dueDay` field value was still `"15"`.
  - **Committee's view — confirmed by Rovick manually**, after Claude's own attempt to reach it was blocked mid-session by a quick-login regression (self-inflicted via a `localStorage.clear()` call). Rovick logged in as Committee and tested directly — behavior confirmed matching CSA's, as expected since both share the exact same `ComputationPanel.tsx` component (only the submit URL differs by `mode`, not the picker's rendering logic).
- **Status: DONE — all 5 phases complete, verified live on both CSA (by Claude) and Committee (by Rovick).**

### [ ] 7. Batch penalty trigger for multiple accounts
- **Audit:** No multi-select UI found in `src/app/collector`. Genuinely not built.
- **Status: NOT STARTED.**

### [ ] 8. Penalty reversal/adjustment for late-submitted proof of payment
- **Audit:** Grepped for reversal/adjustment logic — the only matches are unrelated copy text ("non-reversible" warning on the dev-simulate tool). No reversal mechanism exists.
- **Status: NOT STARTED.** Note: this becomes materially safer to build now that Fix #9 is idempotent — a reversal action won't be fighting a self-compounding penalty anymore.

### [ ] 9. Separate Penalty vs. Amortization tracking in the ledger
- **Audit:** `postings` table schema confirmed via `information_schema.columns`: `id, dcr_id, payment_id, masterlist_id, amortization_schedule_id, amount, posted_by, posted_at` — one undifferentiated `amount` column, no penalty/amortization split field anywhere.
- **Status: NOT STARTED.**

### [ ] 10. Penalty-balance discount for Collection/Remedial — **newly tracked (was flagged out-of-scope under Feature #1)**
- **Audit:** Distinct from Feature #1's interest discount — this is a percentage waiver on an **already-accumulated penalty balance** to get a delinquent borrower to settle immediately (*"bayaran niyo ako ngayon, kahit i-discount ko na itong kalahati, 30% o 20%"*). Different rules (% of penalty, not per-installment interest), different owner (Collection/Remedial, not CSA/Committee), different trigger (an overdue penalty, not an early full settlement). Grep confirms no penalty-discount/waive logic in `src/lib/negotiation` or `src/lib/remedial`.
- **Status: NOT STARTED — needs its own spec (rules, approval path, ledger treatment) before any work.**

---

## ⏳ Pending Input from Rovick (Blocking Further Work)

- [ ] **Seafarer cutoff explainer document** — lower-priority than it looked: the core cutoff logic already existed and matched the transcript's live demo, and the missing due-day picker has since been built (Feature #6, Phases 1-4). Still worth having for edge cases, but no longer blocking anything.
- [ ] **Remedial/restructured account computation document** — the whole Remedial topic was deferred. Note: a real gap was found independently while explaining Remedial to Rovick this session — accounts flagged remedial by the **automatic** nightly job never get a remedial officer assigned (that only happens via the **manual** AR turnover flow), so they become invisible to both the collector and every remedial officer's queue. Confirmed live: 2 accounts (AN300418, AN300420) currently in this state. Worth folding into the same follow-up session.
- [x] ~~**Full penalty logic simulation/sign-off**~~ — superseded by this session's direct fix + live verification of Fix #9. Still worth a walkthrough with Rovick to confirm the fix matches the business's actual expectations (especially the "last installment never compounds" gap noted above), but it's no longer a blind blocker.

---

## Overall Progress

*Updated 2026-09-01 after a second item-by-item re-audit against the live codebase, migrations, and revision-plan status logs.*

**Fixes:** 9 / 11 done (#11 resolved via Feature #1), 1 in progress (#10 — small UI conditional left), 1 rescoped & not started (#7)
**Features to Build:** 5 / 10 done — Auto loan numbering (#4, pre-existing), Seafarer due-date picker (#6), **Early-settlement + origination discount (#1, new)**, **Move of Payment core (#2, new — addendum pending)**, **Extra payment frequencies (#5, new)**. Not started: Co-Borrower section (#3), Batch penalty trigger (#7), Penalty reversal (#8), Penalty/Amortization ledger split (#9), Penalty-balance discount (#10, newly tracked).
**Total actionable items:** 21

### What changed since the 2026-08-26 audit
| Item | Was | Now |
|---|---|---|
| Fix #10 Invoice add-on | Blocked (no such loan type) | In progress — Invoice Financing built as `weekly`; add-on is inert for it, only the input's visibility needs a conditional |
| Fix #11 Discount on due amounts | Duplicate / no feature | Done — Feature #1 enforces the not-yet-due cutoff mechanically |
| Feature #1 Early-settlement discount | Not started | **Done** — Offset + origination discount, both roles, ledger column, tests, live-data repairs |
| Feature #2 Move of Payment | Not started | **Done (core), live-verified 2026-09-01** — surcharge-as-real-payment addendum still pending 2 decisions |
| Feature #5 Extra frequencies | Premise false / from scratch | **Done** — Weekly/Bi-monthly/Quarterly/Two-monthly/Daily all have real schedule logic |

### Still genuinely pending
- **Fix #7** — print-area scoping, still needs rescoping with Rovick before work starts.
- **Fix #10** — hide/disable "Addon months" when schedule type is `weekly` (small, isolated change).
- **Feature #2 addendum** — 2 decisions needed (see item), then surcharge-as-posted-payment + deferred final installment row.
- **Feature #3** — Co-Borrower capture: still only a hardcoded empty `coBorrowerName` in the PDF context; no form fields, no columns.
- **Feature #7** — Batch penalty trigger: no multi-select UI in `src/app/collector`.
- **Feature #8** — Penalty reversal/adjustment: no reversal mechanism exists.
- **Feature #9** — Penalty vs. Amortization split: `postings` still has one undifferentiated `amount` column (no migration touched it); the ledger's separate `Penalty`/`Discount` columns are display-only.
- **Feature #10** — Penalty-balance discount for Collection/Remedial: needs a spec.
- **Pending docs from Rovick** — Seafarer cutoff explainer (no longer blocking), Remedial/restructured computation doc, plus the auto-flagged-remedial-accounts-with-no-officer bug (AN300418, AN300420 as of 2026-08-26).
