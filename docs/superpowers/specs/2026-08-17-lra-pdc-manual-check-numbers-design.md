# LRA PDC — manual check numbers + Bank/Branch — Design Spec

**Date:** 2026-08-17  
**Status:** Draft for review (file allowlist/denylist added)  
**App:** LoanStar (`loanstar/`)  
**Scope:** LRA With-PDC encoding UI/API validation only — **hard-gated to §6 allowlist**

---

## 1. Goal

Let LRA staff enter the **real physical check number** and **bank/branch** on **every** PDC row during encoding — matching how PDCs are actually submitted — instead of only capturing the first check number and leaving the rest blank.

Also rename the visible **Bank** column/label to **Bank/Branch**.

---

## 2. Decisions (locked)

| Decision | Choice |
|---|---|
| Check number entry | **Fully manual per row** (no auto-sequence) |
| Bank/Branch | **Editable per row** |
| Column/label rename | **Bank → Bank/Branch** (UI only; DB column stays `bank_name`) |
| Dates + amounts | Stay **auto-generated** from first check date + loan terms / monthly amortization |
| Approach | **Generate skeleton, then edit** — build N rows, then edit Check no. + Bank/Branch before save |
| Check no. required? | **Yes** — every row must have a non-empty trimmed check number before save |
| Bank/Branch required? | **Yes** — every row must have a non-empty trimmed bank/branch before save |

**Out of scope (this change):**

- Classic amortization ledger redesign (separate follow-up)
- DCRR / collector / AR posting / payment proof flows
- Renaming DB columns (`check_number`, `bank_name`)
- Changing blank-check-from / blank-check-to behavior
- Without-PDC / ATM path
- Auto-incrementing check numbers
- Editing dates or amounts in the PDC grid

---

## 3. Current behavior (audit)

### UI — `src/app/lra/applications/[id]/page.tsx`

While `status === "pdc_encoding"` and path includes `with_pdc`:

- Form fields: first check date, bank name, first check number, blank check from/to
- On save, builds `terms` rows where:
  - `checkNumber` is set **only for index 0**
  - indices `1..N-1` get `checkNumber: null`
  - every row gets the same `bankName`
- Saved schedule table columns: `#`, `Check no.`, `Date`, `Bank`, `Amount`
- Empty check numbers render as `—`

### API — `POST /api/lra/applications/[id]/pdc`

- Zod already accepts per-check `checkNumber` (optional/nullable) and required `bankName`
- Delegates to `savePdcChecks` in `src/lib/lra/release-service.ts`

### Service — `savePdcChecks`

- Requires check count `=== computation.terms`
- Requires each amount `=== monthlyAmortization`
- Deletes existing `pdc_checks` for the release file, then inserts the new set
- Writes `check_number`, `bank_name`, `check_date`, `amount`, `sort_order`

### Schema — `pdc_checks`

- `check_number text` (nullable)
- `bank_name text NOT NULL`
- No migration required for this feature

### Downstream consumers (must keep working)

- Document template tokens `checkNumber` / `bankName` via BLRI / template context
- Physical PDC collect gate (`pdcCheckCount >= 1`)
- Close/transmit to AR unchanged

---

## 4. Design

### 4.1 Encoding UX flow

1. Keep a small header form for **First check date** (+ optional blank check range).
2. Remove reliance on a single shared “First check number” / single “Bank name” as the only source of truth for row values.
3. On **Build schedule** (or equivalent primary action while encoding):
   - Create an in-memory draft of `terms` rows:
     - `checkDate` = first date + `i` months
     - `amount` = monthly amortization (read-only)
     - `checkNumber` = `""` (user fills)
     - `bankName` = `""` (user fills; may prefill first row only if helpful, but each row remains independently editable)
4. Show an editable table:

   | # | Check no. | Date | Bank/Branch | Amount |
   |---|-----------|------|-------------|--------|
   | editable input | read-only | editable input | read-only |

5. **Save PDC schedule** submits the full `checks[]` array to the existing API.
6. After save, the read-only “PDC schedule” card uses header **Bank/Branch** (not Bank) and shows the saved values.

### 4.2 Validation

**Client (before POST):**

- Every row has trimmed non-empty `checkNumber`
- Every row has trimmed non-empty `bankName`
- Still uses computation terms/amount (no user override)

**Server (tighten existing Zod / service):**

- `checkNumber`: required non-empty string per check (trim; reject blank/`null`)
- `bankName`: required non-empty string per check (already `min(1)`; keep)
- Preserve existing terms-count and monthly-amortization equality checks

Do **not** add a DB `NOT NULL` on `check_number` in this change (avoids breaking any historical null rows). Enforce at write time only for new saves.

### 4.3 Re-encode / replace

Unchanged semantics: saving again deletes prior `pdc_checks` for that release file and inserts the new set. Staff can rebuild and re-enter check numbers/bank-branch while still in the encoding-capable path/status flow already allowed today.

### 4.4 Labels only

| Location | Old | New |
|---|---|---|
| Schedule table header | `Bank` | `Bank/Branch` |
| Encoding form / draft table label | `Bank name` | `Bank/Branch` |

DB column remains `bank_name`. Template token remains `bankName`.

---

## 5. Constraints (do not break)

### 5.1 Behavioral constraints

1. **No** changes to DCRR create/submit/reconcile or payment posting.
2. **No** route or table renames (`/lra/...`, `pdc_checks`, `bank_name`).
3. Dates and amounts remain system-derived from computation + first check date.
4. Without-PDC / ATM fields untouched (including ATM bank name on the same LRA page).
5. Physical collect + close-to-AR gates unchanged aside from benefiting from complete check numbers.
6. Generated documents continue to read per-row `check_number` / `bank_name`; filling every row improves templates without changing generators.
7. Existing applications with partial check numbers remain readable; only new/re-saved schedules must be complete.
8. **No** Supabase migrations in this revision.
9. **No** edits outside the allowlist in §6 — if something seems needed elsewhere, stop and ask.

### 5.2 Surgical-edit rules (inside allowlisted files)

| File | Allowed touch | Forbidden touch |
|---|---|---|
| `src/app/lra/applications/[id]/page.tsx` | PDC encoding form, draft editable schedule grid, saved PDC schedule card labels/cells, `submitPdc` / related local state only | Path selection, ATM fields, generate/sign/briefing/release/close UI, physical collect card logic, unrelated cards on the same page |
| `src/app/api/lra/applications/[id]/pdc/route.ts` | Zod schema for `checks[].checkNumber` / trim validation only | Auth/permission model, audit shape beyond existing fields, unrelated routes |
| `src/lib/lra/release-service.ts` | **Only** `savePdcChecks` (trim + reject empty check numbers / bank names) | Any other export in this file (`selectReleasePath`, `generateReleaseDocuments`, `closeAndTransmit`, etc.) |
| Test file(s) under allowlist | Cases for missing/present per-row check numbers and bank/branch | Rewriting unrelated LRA suite behavior |

---

## 6. File allowlist / denylist (implementation hard gate)

### 6.1 ALLOW — only these files may be modified

| File | Change |
|---|---|
| `src/app/lra/applications/[id]/page.tsx` | Draft editable grid; per-row Check no. + Bank/Branch inputs; rename Bank → Bank/Branch; submit full `checks[]` |
| `src/app/api/lra/applications/[id]/pdc/route.ts` | Require non-empty trimmed `checkNumber` per check |
| `src/lib/lra/release-service.ts` | Defensive trim/reject empty check numbers inside **`savePdcChecks` only** |
| `src/lib/lra/__tests__/release-service.test.mts` | Extend/add tests for `savePdcChecks` validation (prefer this existing file) |
| `docs/superpowers/specs/2026-08-17-lra-pdc-manual-check-numbers-design.md` | Spec updates only |
| `docs/superpowers/plans/2026-08-17-lra-pdc-manual-check-numbers.md` | Implementation plan and execution checklist |

Optional (only if a new focused test file is cleaner than extending the existing one):

| File | Change |
|---|---|
| `src/lib/lra/__tests__/save-pdc-checks.test.mts` | **Create** only if needed; tests for `savePdcChecks` empty-check rejection / full manual set |

### 6.2 DENY — do not edit (non-exhaustive but binding)

Do **not** modify any of the following for this revision:

**LRA adjacent (leave alone)**  
- `src/lib/lra/pdc-collect.ts` and `src/app/api/lra/applications/[id]/pdc-collect/route.ts`  
- `src/app/api/lra/applications/[id]/route.ts` (GET detail)  
- `src/app/api/lra/applications/[id]/path/route.ts`  
- `src/app/api/lra/applications/[id]/generate/route.ts`  
- `src/app/api/lra/applications/[id]/close/route.ts`  
- `src/app/api/lra/applications/[id]/release/route.ts`  
- `src/lib/lra/blri-data.ts`, `template-context.ts`, `constants.ts`, `release-pipeline.ts`, `history.ts`, `blockers.ts`  
- `src/app/lra/page.tsx`, `src/app/lra/history/page.tsx`  
- Document generators / template seed SQL under `src/lib/documents/**` and `supabase/migrations/**`

**Other modules (leave alone)**  
- Anything under `src/app/ar/**`, `src/app/collector/**`, `src/app/remedial/**`, `src/app/borrower/**`  
- Anything under `src/lib/ar/**`, `src/lib/collector/**`  
- DCRR UI/API (`**/dcr/**`), payments posting, Sidebar/Header (unless unrelated local WIP)  
- Shared UI primitives unless absolutely required (prefer existing `Input` / `Table` already used on the LRA page)

**Infra**  
- No new migrations  
- No RLS policy changes  
- No `.env` / MCP / config changes

### 6.3 If blocked

If implementation discovers a required change outside §6.1, **do not expand scope**. Record the blocker and ask before touching another file.

---


## 7. Testing plan

1. With-PDC application in `pdc_encoding`: build schedule → leave one check number blank → Save fails with clear error.
2. Fill all check numbers + bank/branch (can differ per row) → Save succeeds → table shows all values under **Bank/Branch**.
3. Re-save with edited check numbers → previous rows replaced; count still equals terms.
4. Generate docs → PDC schedule / BLRI rows show per-check numbers and bank/branch text.
5. Physical collect + close still work.
6. Without-PDC path unchanged.
7. Unit/API validation test for empty `checkNumber` rejected.

---

## 8. Follow-up (explicitly not this change)

Account-detail **classic ledger** alignment (Due Date / Target / Penalty / Date / Trans No / Debit / Credit / Balance), using these PDC check numbers for the ledger **Check No.** column, remains a separate design.
