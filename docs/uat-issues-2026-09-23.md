# UAT Issues — September 23, 2026

Source: live UAT call (306 min), 67→110/110 test cases run. Full transcript: https://fathom.video/share/5Wc5YFdQessi_xcrc-MwGGiEXyXfjfD4

4 confirmed defects below. Follow-up re-test scheduled Sep 24, 1:00 PM (this file's items only).

---

## 1. DCR receipt zero-out validation

**UAT ref:** #60 / #63 (create new DCR with payment allocation)

**Issue:** Collector received a ₱58,000 payment, applied only ₱20,000 to one installment, submitted the DCR — the remaining ₱38,000 was not visibly applied anywhere.

**Current behavior (code-grounded):**
- `src/app/collector/dcr/page.tsx:255-267` computes `leftover = payment − checked total` and `:542-627` (`confirmAddToDcr`) already auto-appends a leftover allocation line (null schedule ID) before submit.
- `src/lib/ar/posting.ts:264-308` (`validateAllocationLines`) already hard-rejects any submit where `sum(allocations) ≠ payment.amount`.
- So a bare partial submit is not reachable through this modal today — total-matching validation already exists.

**Real gap:** The auto-generated leftover line is only an anonymous, balance-reducing row in `postings` (`amortization_schedule_id = null`) — no dedicated advance/unapplied-credit table exists, and `src/app/ar/dcr/page.tsx` never surfaces that part of a DCR item is unapplied leftover. Money isn't mechanically lost, but it's invisible/untrackable as a distinct advance balance.

**Expected behavior:** Block submit unless fully allocated or explicitly recorded as a trackable advance/leftover credit; surface leftover amounts to AR during reconciliation.

**Open question for client:** Confirm whether the live-test defect was hit on an older build (pre-existing validation), or whether the complaint is really about the visibility gap described above.

---

## 2. AR bounce-check recording

**UAT ref:** #65 area (remedial discussion), general AR/DCR reconciliation flow

**Issue:** When a deposited borrower check later bounces, AR has no way to record it distinctly from a normal rejection — no ledger trail, no visible "bounced" flag.

**Current behavior (code-grounded):**
- `src/app/ar/dcr/page.tsx:879-891` — AR only has **Post** and **Reject** actions.
- `src/lib/ar/posting.ts:1127-1225` (`rejectDcrItem`) snapshots to a jsonb column and **deletes** the `dcr_items` row — no `postings`/ledger entry is ever created.
- `postings` table (`supabase/migrations/20260707000000_p7_ar_collection.sql:134-143`) has a single signed `amount` column — no debit/credit split, no type/kind enum.
- `AccountLedgerRowKind` (`src/lib/ledger/build-account-ledger-rows.ts:141-147`) is a closed union with no `bounce` kind.
- No "bounce," "DAIF," or "returned check" concept exists anywhere in the codebase (confirmed via grep).

**Expected behavior:** Distinct "Bounce" action producing a net-zero debit+credit ledger pair, auto-filled with the bank return reference (e.g. "DAIF – insufficient funds"), visibly flagging the account/ledger as bounced.

**Gap:** Needs to be built from scratch — new AR action, paired-posting mechanism (or two offsetting `postings` rows), new ledger-row kind, reference/remarks field, bounced-flag on the account.

---

## 3. LRA document template layout fixes

**UAT ref:** #45 (generate document), template review during LRA testing

**Issue:** Promissory Note, Check Voucher, BLRI, and Disclosure Statement flagged as not matching agreed layout — specifically name/date placement and co-borrower fields.

**Current behavior (code-grounded, pulled from live published template versions in Supabase, not stale seed migrations):**
- **Promissory Note** (v2 published, v3 draft pending): signature table has borrower left / co-borrower right — but **no date field beside either name**, only one shared `{{executionDate}}` in the prose above the table. `{{coBorrowerName}}` is declared as a mergeable field (`src/lib/documents/templates/fields.ts:39`) but **`src/lib/lra/template-context.ts` never populates it** — always renders blank.
- **Check Voucher** (still original July 14 v1, never revised): single "Received by" line, borrower name only, no date, no co-borrower line.
- **BLRI** (still original v1, never revised): "Co-Borrower:" label exists in the signature table with **no merge token behind it** — dead static label.
- **Disclosure Statement**: most actively revised (6 versions through 2026-09-11) — already gets attention, lowest-risk of the four.

**Expected behavior:** Per-signer name + date side by side (borrower left, co-borrower with own line), functioning co-borrower merge fields, matching client's previously agreed layout.

**Gap:** Concrete bugs — no per-signer date on PN, `coBorrowerName` orphaned from context builder, BLRI co-borrower slot has no token at all. Check Voucher and BLRI have never been touched since initial seeding.

---

## 4. 1st/2nd Notice (demand letter) visibility gap in Remedial

**UAT ref:** #65 (marked "pass with action," not pass)

**Issue:** Business process requires 1st/2nd demand notice + bounced-check record before an account reaches Remedial, but Remedial officer could not find these documents anywhere in the borrower's file/attachments.

**Current behavior (code-grounded):**
- Demand letter generation **already exists and works**: `generateDemandLetter()` (`src/lib/documents/generators/demand-letter.ts`) supports exactly 3 stages (`first_reminder`, `second_demand`, `final_demand`), stored in `rendered_documents` (module: `collection`).
- Only wired to **one UI**: `DemandLetterModal`, used exclusively from the Collector's accounts page (`src/app/collector/accounts/page.tsx`).
- Remedial's case-file panel (`OriginationPacketPanel` → `loadOriginationPacket`, `src/lib/collection/origination-packet.ts:344-568`) never queries `rendered_documents` — only reads the `documents` table (intake uploads), which demand letters never populate. This is why the tester found nothing.
- Turnover to Remedial is **purely aging-based** (91+ days — `supabase/migrations/20260723085213_aging_90_day_remedial_threshold.sql`, `remedial_turnovers` table) — no check anywhere for whether a 1st/2nd notice or bounced-check record actually exists first.

**Expected behavior:** Notices visible in Remedial's case-file view; per stated business rule, notice-existence should arguably gate turnover to Remedial.

**Gap:** Two distinct fixes — (a) give Remedial read access to `rendered_documents` demand letters in its case-file panel, (b) decide whether to enforce notice-existence as a precondition for aging-based turnover, or keep it informational-only.

**Open question for client:** Should missing 1st/2nd notice actually block/delay the 91-day auto-turnover to Remedial, or just be surfaced as a visibility/informational item?

---

## Not in this tracker (housekeeping items from same call, tracked elsewhere)
- Mark UAT #25, #40, #94, #106 as Pass in the main tracker.
- Confirm CIG module access for AA and Sir Dem; enable email reports.
- Sep 24, 1:00 PM follow-up UAT session (re-test these 4 items only).
