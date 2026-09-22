# UAT demo data — seeding implementation plan

**Written:** 2026-09-22 · **Status:** PLAN ONLY.
**Inventory of what's needed:** `uat-demo-data-inventory.md` (11 gaps).
**Governing requirement:** seeded records must survive being *clicked on and acted upon*, not merely exist as rows.

---

## 0. Why a row is not enough

A `loan_applications` row with `status = 'on_hold'` looks right in a queue and breaks the moment anyone touches it. Three verified examples from this codebase:

**Clear hold reads history, not the hold row.** `resolveStatusAfterClearHold` (`src/lib/csa/clear-hold.ts`) walks `loan_applications.status_history` backwards for the last non-`on_hold` entry and restores *that*. Seed an `on_hold` app with empty history and clicking "Clear hold" silently drops it to the fallback `submitted` — wrong status, in front of the client. The hold also needs a `file_holds` row and `loan_applications.blocker` set, because `recordApplicationHold` writes all three and the UI reads the blocker for the on-screen reason.

**Release artifacts are a chain, not a flag.** `release_files.computation_id` and `release_queue.computation_id` are both `NOT NULL`, and `briefings.release_file_id` is `NOT NULL`. So a briefing record is only reachable as: computation → release_file → briefing. Set `status = 'release_briefing'` without that chain and the briefing queue renders an item that opens onto nothing.

**A DCR line needs a real payment.** `dcr_items.payment_id` is `NOT NULL`. A "submitted DCR" therefore requires: masterlist → amortization_schedules → payments → dcr → dcr_items. Skip the payment and the insert fails outright; fake the payment and AR's reconcile screen shows a line that reconciles against nothing.

The rest of this plan is built around those chains.

**What is safe to omit:** `verifications` is created on demand by `getOrCreateVerification`, so CIG applications don't need one pre-seeded. The CSA and Committee detail routes use `.maybeSingle()` for related rows, so a missing computation degrades gracefully rather than 500-ing. The one `.single()` in the LRA route is on the application itself.

---

## 1. Ground rules

1. **Inserts only.** Never `update` or `delete` an existing row. Every gap is closed by creating something new.
2. **Scoped identity.** All borrower emails `demo.borrower.*@example.local`; all staff `demo.*@loanstar.local`; any free-text field the seed writes is prefixed `[UAT]`. One `ILIKE` finds everything this script ever made.
3. **Dry run by default.** Prints the full plan and exits. `--apply` writes.
4. **Idempotent.** Check for the scoped identifier before each insert; re-running after a partial failure must not duplicate.
5. **Money comes from the app's own code.** `computations` has 16 `NOT NULL` numeric columns (`principal`, `processing_fee`, `doc_stamp`, `notary_fee`, `security_fee`, `total_deductions`, `net_released`, `total_interest`, `total_loan`, `monthly_amortization`, …). These must come from `computeSeafarerLoan` / `computeSmeLoan` and `generateAmortizationSchedule`, exactly as `scripts/reseed-demo-data.ts` already does. Hand-typed figures will disagree with the BLRI/voucher documents the same data renders into.
6. **Rollback list.** Append every inserted `(table, id)` to `scripts/.uat-seed-log.json` as it goes, so one companion script can remove precisely what was added.

---

## 2. Phases

Each phase is independently runnable and independently verifiable. Run them in order — later phases depend on borrowers and computations from earlier ones.

### Phase 1 — Borrower logins (unblocks 7 test cases)

Create 5 auth users + `borrowers` rows + `user_roles` (borrower), password `Loanstar2026`:

| Account | Owns | For |
|---|---|---|
| `demo.borrower.new@example.local` | nothing | UAT-008 |
| `demo.borrower.active@example.local` | 1 `documents_pending` (2 of 5 docs) + 1 `draft` | UAT-011, 012, 015 |
| `demo.borrower.history@example.local` | 1 `paid_off` + 1 `denied` | UAT-013, 014 |
| `demo.borrower.servicing@example.local` | 1 `loan_active`, balance ≈ 120,000, amort ≈ 23,000 | UAT-016 |
| `demo.borrower.reloan@example.local` | 1 `paid_off`, good standing | UAT-017 |

Required chain per owned application: `loan_applications` → `application_details` → `computations`. The servicing and reloan accounts additionally need `release_files` → `masterlist` → `amortization_schedules` (and `payments` for the paid-off one, or its balance won't be zero).

**Must survive:** opening the dashboard, opening each application, deleting the draft (UAT-012), filtering history by status (UAT-014), clicking "Apply for reloan" (UAT-017 — verify against `canStartReloan`'s real eligibility rule, don't assume).

### Phase 2 — Deactivated staff account

One profile with `is_active = false`. Currently **zero** exist, so UAT-079 has nothing to reactivate.

**Must survive:** clicking "Activate", then signing in as that account to prove reactivation worked.

### Phase 3 — Workflow-status applications (6 apps)

All six need `loan_applications` + `application_details` + `computations` as a baseline. Then:

| Status | Extra rows required | Must survive |
|---|---|---|
| `on_hold` | `file_holds` row (reason + `recorded_by`), `blocker` set, **`status_history` ending `[…, submitted, on_hold]`** | "Clear hold" restoring to `submitted`, not the fallback |
| `committee_hold` | `committee_actions` entry | appearing in the "On hold" KPI, releasing back to the queue |
| `negotiating_terms` | `negotiations` + at least one `negotiation_messages` | opening the negotiation panel, reading counter-offer history |
| `for_revision` | `revisit_notices` row with `route_to` and unresolved `resolved_at` | CIG revision-complete routing it to `for_approval` |
| `lra_pending` | `release_queue` (needs `computation_id`) | "Start processing", saving a release path |
| `release_briefing` | `computation` → `release_files` → `briefings` | the briefing check-off advancing it to `release_ready` |

### Phase 4 — Collateral applications in CIG (2 apps)

Both in `for_verification` so the forms are actually editable (`verifications_write` RLS requires `status = 'for_verification'` — outside it, Postgres blocks the write and the form silently fails to save).

- 1 SME + `car_refinancing`, CM Inspection empty → UAT-105, 106, plus the SME Field Visit cases 098/099
- 1 Individual + `real_estate`, REM Inspection empty → UAT-100–103, 107, 108. **This is the only REM Inspection data that will exist anywhere in the system.**

**Must survive:** opening the Field Visit form, adding/removing informants and neighborhood entries, adding/removing vehicles and properties, saving, then submitting the CI report to Committee (which runs the full completeness gate).

### Phase 5 — Submitted DCR

Chain: pick an existing `loan_active` masterlist account assigned to `collector@loanstar.local` → create 2–3 `payments` → `dcr` with `status = 'submitted'` → `dcr_items` referencing those `payment_id`s → `dcr_item_allocations` against real `amortization_schedules` installments.

**Must survive:** AR opening the DCR, reconciling it (which validates deposit amount against item totals — a known hard block), and the resulting postings landing on the right installments.

---

## 3. Verification — the part that proves "not broken"

Seeding isn't done when the inserts succeed. Two gates:

**Gate A — automated, after each phase.** Re-run the inventory's existence queries and confirm each gap now returns ≥1 row. Then `npm test` and `npm run build` to confirm nothing in the app broke.

**Gate B — manual click-through, before handing to the client.** Every seeded record gets opened and acted on once. This is the gate that matters, and it's non-negotiable — this project has repeatedly shipped bugs that unit tests passed clean (the Field Visit footer overlap, the informants list resetting itself, the autofill leaving 40 fields blank were all found only by clicking).

| Seeded item | Action to perform | Pass condition |
|---|---|---|
| Each borrower login | Sign in, open dashboard | Correct empty/populated state, no error |
| `demo.borrower.active` draft | Delete it | Card disappears, returns to empty state |
| `demo.borrower.history` | Filter by "Paid Off" | Only the paid-off row remains |
| `demo.borrower.reloan` | Click "Apply for reloan" | Picker opens, new application is created |
| Deactivated account | Click "Activate", then sign in | Sign-in succeeds |
| `on_hold` app | Click "Clear hold" | Restores to `submitted`, **not** a blank/wrong status |
| `committee_hold` app | Open, release from hold | Returns to the decision queue |
| `negotiating_terms` app | Open negotiation panel | Counter-offer history renders |
| `lra_pending` app | "Start processing", save path | Advances to setup/signing |
| `release_briefing` app | Check off the briefing | Advances to `release_ready` |
| SME collateral app | Fill Field Visit, add 3 vehicles, remove 1 | Saves; 2 vehicles persist after reopening |
| Individual collateral app | Field Visit + add 2 properties | Saves; REM data persists |
| Both CIG apps | Submit CI report | Passes the completeness gate, reaches Committee |
| Submitted DCR | AR reconciles it | Deposit validation passes, postings land correctly |

Any row that fails its action is a seeding bug, not a product bug — fix the seed and re-verify before moving on.

---

## 4. Two things to confirm before writing the script

Neither is assumed anywhere above:

1. **`canStartReloan`'s real eligibility rule** — read it before deciding what `demo.borrower.reloan` must own, rather than guessing that "one paid-off loan" qualifies.
2. **Remedial "Critical" severity** — whether it's computed from days-past-due or stored. If computed, the existing 91+ accounts already satisfy UAT-065 and nothing is needed; if stored, it's a twelfth gap.

---

## 5. Rollback

`scripts/.uat-seed-log.json` holds every inserted id in insertion order. The companion teardown deletes in reverse order (children before parents): `dcr_item_allocations` → `dcr_items` → `dcr` → `payments` → `amortization_schedules` → `masterlist` → `briefings` → `release_files` / `release_queue` → `negotiation_messages` → `negotiations` → `revisit_notices` → `committee_actions` → `file_holds` → `computations` → `application_details` → `loan_applications` → `borrowers` → `user_roles` → auth users.

Because every insert is scoped to `demo.*` identifiers, the teardown can also be verified independently: after it runs, the scoped `ILIKE` queries must return zero rows, and the pre-existing counts in `uat-demo-data-inventory.md` must be unchanged.
