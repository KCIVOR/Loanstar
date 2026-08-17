# Classic Account Ledger Alignment — Design Spec

**Date:** 2026-08-17  
**Status:** Approved decisions locked; implementing with hard file gate  
**App:** LoanStar (`loanstar/`)  
**Scope:** Per-account chronological “passbook” ledger on AR, Borrower, and Remedial detail pages only

---

## 1. Goal

Replace the current split amortization table + payment list on **one-borrower** account pages with a single chronological ledger that matches the original passbook layout.

Display only — do **not** change posting, DCRR, payment recording, write-off math, or proof submit rules.

---

## 2. Decisions (locked)

| Decision | Choice |
|---|---|
| Type / CRJ | **Skip** |
| Leftmost identity column | **Check No.** (not Customer ID) |
| Check No. source | `payments.reference_no` |
| Pages | Per-account only: AR masterlist detail, Borrower loan panel, Remedial account detail |
| History / list pages | **Out of scope** |
| Row order | Chronological: opening debit, then payment credits by payment date, running balance |
| Approach | One shared display-only ledger + pure row builder |

**Trans No. (locked for v1):** channel label with optional status note, e.g. `bank deposit` / `check` / `pos cash`. No DCRR composition required in v1.

**Credits that affect Balance:** only payments with status `posted` (and rounding write-offs on AR if already shown as settled amounts). Pending / confirmed / rejected stay out of running balance so the passbook matches books.

---

## 3. Columns

| Column | Source |
|---|---|
| Check No. | `payments.reference_no` (or `—`) |
| Due Date | Linked schedule `due_date` when posting→schedule exists; else blank |
| Target | Linked schedule `amount_due` when known; else blank |
| Penalty | Linked schedule `penalty_amount` when known; else blank / 0 shown as `—` |
| Date | `payments.payment_date` |
| Trans No. | Channel label (`bank_deposit` → readable text) |
| Debit | Opening row = `masterlist.total_loan` |
| Credit | Posted payment amount |
| Balance | Running after each row |

Footer **Report Total**: sum Debit, sum Credit, final Balance. Also show penalty total if any non-zero schedule penalties exist on credit-linked rows.

---

## 4. Architecture

1. **Pure builder** `src/lib/ledger/build-account-ledger-rows.ts`  
   Input: opening debit, schedules, payments (+ optional postings for schedule join).  
   Output: opening / payment / totals rows (numbers + ISO dates only).

2. **Display** `src/components/ledger/AccountLedger.tsx`  
   Renders the classic table with existing `Table` / `Th` / `Td`. No buttons, fetches, or modals.

3. **Page adapters** map local shapes → builder input; keep write-off / proof form / Record payment **outside** the shared table.

---

## 5. Constraints (do not break)

1. No changes to `src/lib/ar/posting.ts`, DCRR create/submit/reconcile, collector payment POST validation.
2. No DB column renames; no route renames.
3. Borrower proof submit + payment proof View remain.
4. AR write-off confirm flow remains (moved beside / below ledger if needed — not inside shared row cells).
5. Remedial Record Payment modal remains.
6. `masterlist.outstanding_balance` remains authoritative header balance; ledger running balance is display derived from opening − posted credits.
7. If a needed change is outside the allowlist — **stop and ask**.

---

## 6. File allowlist / denylist

### ALLOW

| File | Change |
|---|---|
| `src/lib/ledger/build-account-ledger-rows.ts` | **Create** pure builder |
| `src/lib/ledger/format.ts` | **Create** shared date/money (no ₱ prefix, match page tables) |
| `src/lib/ledger/__tests__/build-account-ledger-rows.test.mts` | **Create** unit tests |
| `src/components/ledger/AccountLedger.tsx` | **Create** display table |
| `src/app/ar/masterlist/[id]/page.tsx` | Swap amortization ledger UI; keep write-off outside shared cells |
| `src/components/borrower/LoanActivePanel.tsx` | Swap schedule table only; keep proof + history |
| `src/app/remedial/accounts/[id]/page.tsx` | Swap amortization (+ fold posted credits into ledger); keep Record Payment |
| `src/app/api/remedial/accounts/[id]/route.ts` | Raise/remove payment limit; add postings only if needed for schedule join |
| `src/app/api/borrower/applications/[id]/loan/route.ts` | **GET only**, only if schedule join fields missing |
| `src/app/api/ar/masterlist/[id]/route.ts` | **GET only**, only if schedule join fields missing |
| `docs/superpowers/specs/2026-08-17-classic-account-ledger-design.md` | Spec |
| `docs/superpowers/plans/2026-08-17-classic-account-ledger.md` | Plan |

### DENY

- All DCRR / collector queue / history list pages  
- `src/lib/ar/posting.ts` and reconcile services  
- LRA PDC encoding (already shipped separately)  
- Migrations / RLS unless Remedial postings prove impossible without them — then **ask first**  
- Shared `Table.tsx` redesign  
- Negotiation / CIG / unrelated dirty working-tree files  

---

## 7. Testing

Builder unit tests (required):

1. Opening debit sets starting balance  
2. Posted payment reduces balance chronologically  
3. Non-posted payments excluded from running balance  
4. Schedule join fills Due/Target/Penalty when posting links schedule  
5. Totals row sums debit/credit/final balance  
6. Empty payments → opening + totals only  

Manual: open one AR, one Borrower, one Remedial account and confirm passbook columns + actions still work.
