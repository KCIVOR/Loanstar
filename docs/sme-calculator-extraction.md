# SME Calculator — Extracted Specification

**Source file:** `Downloads\SYSTEM DEV\Step 1 - Processing-CSA\SME - Individual\Calculator SME.xlsm`
(4.86 MB, macro-enabled, 29 sheets — 10 hidden; original author path `C:\Users\rene_delapena\Desktop\SYSTEM\Step 1 - Processing\`)
**Extracted:** 2026-08-07 · **Method:** raw OOXML parse (formulas + cached values), VBA decompiled via `oletools`
**Verification:** replayed against the workbook's own register of 35 real released loans — **270/271 checks matched (99.6%)**

---

## 0. How this was extracted and verified (read before trusting any number below)

Nothing here is inferred from labels or assumed from the SF engine. Every rule below was read out of a
cell formula, then **replayed against real historical loans recorded in the workbook itself**.

1. **Parsed raw XML, not a rendering.** Both the formula string and Excel's cached result were read for
   every cell, so each rule can be checked against the number the client's own sheet produced.
2. **Parser was self-tested before use.** An early regex bug silently mislabelled cell references
   (`F3`'s formula was being reported as `D3`), which would have corrupted the whole extraction. It was
   caught by cross-checking against raw XML, fixed, and then proven: **57,922 / 57,922 cells parsed, all
   ground-truth spot-checks pass** (`06_selftest.py`).
3. **Model replayed against 35 real released loans** from the workbook's `Data` register
   (`08_parity.py` / `10_parity2.py`). Core loan math — principal, interest, total loan, monthly
   amortisation — matched **100%** on all 35. See §6.
4. **VBA was decompiled and confirmed to contain no loan math** (§7), so worksheet formulas are the
   complete source of truth for computation.

**One discrepancy remains unexplained and is NOT resolved** — see §6.2. Do not treat this document as
complete until the client answers it.

---

## 1. Scope of the workbook (bigger than "a calculator")

The file is the client's whole Step-1 processing tool, not just a computation sheet:

| Sheet | State | Purpose |
|---|---|---|
| `SME` | visible | **The calculator** — inputs, rate lookups, fee block, outputs |
| `Data` | visible | Register of released loans (44 rows; 35 with complete rate data). Written by a macro |
| `Principal loan calculator` | visible | Iterative gross-up helper (unrolled convergence rows) |
| `MasterList` | visible | 57,574 formulas — loan register |
| `BLRI (Regular)` / `(18)` / `(24)` / `(36)` | mixed | Disclosure statement per term length |
| `BLRI (CWT)12/24`, `BLRI (invoice)` | hidden | Variant disclosure statements |
| `CV`, `CashVoucher`, `AR Check`, `AR cash`, `Fund Trans`, `Single/Multiple Check` | visible | Release/voucher documents |
| `Conso-Restructure` | visible | Consolidation / restructuring |
| `Vienovo` + 8 `(Vienovo)` sheets | hidden | A separate lender/product family |
| `DataFilter` | hidden | 548K cells of staging/lookup data |

**`BLRI` is the same document type already seeded in the system** (`20260714020000_p8_seed_blri_pn_ds_templates.sql`).

---

## 2. Inputs (sheet `SME`)

| Cell | Meaning | Example |
|---|---|---|
| `C4` | **Account/product selector** — drives every rate lookup | `SME - FVALENTIN` |
| `C5` | Mode toggle: `Loan Desired` vs `Net Desired` | `Loan Desired` |
| `F5` | Amount (per `C5` mode) | 2,040,816.3264 |
| `F6` | Terms (months) | 6 |
| `F8` | Add-on Interest (months) | 0 |
| `F19` | Released date | 2026-03-24 |
| `F12` / `F16` / `F17` | Other Loan / Offset Amount / Advance Payment | 0 / 269,478.11 / 0 |
| `G10`, `H10` | Bank for account-opening fee; manual amount | `OTHER BANK` |
| `B11` | `ProrateDS` toggle (`YES`/`NO`) — prorates doc stamp by days | `NO` |

---

## 3. Rate configuration — **per-account, not per-product** (critical)

Rates come from a lookup table at `SME!EN3:ES500`, keyed by the `C4` selector:

| Column | Field | `SME!` cell |
|---|---|---|
| `EN` | Account name (key) | — |
| `EO` | Interest rate (monthly) | `F4` |
| `EP` | Processing fee rate | `F3` |
| `EQ` | Admin cost rate | `H5` |
| `ER` | Chattel mortgage rate (CMF) | `H8` |
| `ES` | `With DS & Notary` / `No DS & Notary` | `G5` |

**This is the single most important structural finding.** There is no fixed "SME rate". The table holds
**~58+ individually-named accounts** — `SME - HUAT CHAY`, `SME - RC RAMOS CONSTRUCTION`,
`SME - MONDIAL MEDICAL TECHNOLOGIES INC.` — each with its own negotiated rates. Observed ranges:

- **Interest:** 1.5% – 3.5% per month
- **Processing fee:** 0% – 11%
- **Admin cost:** 0% – 2%
- **DS & Notary:** per-account on/off flag

The product family is derived, not stored: `I31 = LEFT(C4, FIND(" ")-1)` → `SME`, `MPL`, `Salary`,
`Invoice`, `Auto`, `DAILY`, `QUARTERLY`; then remapped (`2months`→`quarterly`, `refinancing`→`auto`).

> ⚠️ `SME - SPECTRUM` exists in this table at **3.5% interest / 5% PF / 1.5% admin**, but the
> corresponding seeded row in the system's DB (`20260706100002_p1_seed_data.sql:146`) is
> **2.25% interest / 6% PF and `is_active = false`**. These disagree. Must be reconciled with the client.

---

## 4. The computation model (verified)

With `C5 = "Loan Desired"` (note: Excel text comparison is case-insensitive, so `C5 = U4` is TRUE —
this selects the `V35`–`V40` result block):

```
pf_bundle  = loan_desired × pf_rate                      (SME!G13 → Z23)
principal  = loan_desired + pf_bundle
           = loan_desired × (1 + pf_rate)                (SME!BM13 → V35)
interest   = principal × monthly_rate × terms            (SME!BM12 → V36)   [add-on]
total_loan = principal + interest                        (SME!BM11 → V37)
monthly    = total_loan ÷ terms                          (SME!F23  → V38)
```

Worked example (the file's live state): desired 2,040,816.33, PF 10%, interest 3%/mo, 6 months
→ pf_bundle 204,081.63 · principal 2,244,897.96 · interest 404,081.63 · total 2,648,979.59 ·
monthly 441,496.60. All match the workbook's cached values exactly.

### 4.1 Deduction block (`SME!D9:F18`)

| Line | Cell | Formula | Base |
|---|---|---|---|
| Admin Cost | `F9` | `loan_desired × admin_rate` | **loan desired** |
| Account Opening | `F10` | bank-dependent lookup (`V43:V46`, `X47`) or manual `H10` | — |
| Documentary Stamp | `F11` | `principal ÷ 200 × 1.50 × (days ÷ 365)` | principal |
| Other Loan | `F12` | input | — |
| **Processing Fee** | `F13` | `pf_bundle − doc_stamp − notary` (**residual**) | — |
| Security Fee | `F14` | label present, **unused in SME flow** | — |
| Notary Fee | `F15` | `principal × 0.09%` | principal |
| Offset Amount | `F16` | input | — |
| Advance Payment | `F17` | input | — |
| Chattel Mortgage Fee | `H11` | `principal × chattel_rate` | principal |
| **TOTAL** | `F18` | `SUM(F9:F17) + H11` | — |

`net_released = principal − total_deductions` (`SME!W5`; equivalently `SME!V4` from loan desired).

**Doc stamp** is ₱1.50 per ₱200 of principal (= 0.75%), **prorated by days only when `B11 = "YES"`**;
`V22 = IF(AND(B11="yes", U22<365), U22, 365)`, so the default is a full-year (unprorated) charge.

**When the account's flag is `No DS & Notary`** (`G5`), both doc stamp and notary are forced to 0, and
the processing fee line therefore equals the entire PF bundle.

### 4.2 Collateral branches present but out of current scope

Many formulas branch on `I31 = "auto"` or `I31/I33 = "REM"`, routing to a parallel block (`AD46:AD51`)
for Car Refinancing and REM. These are **out of scope per the 2026-07-27 decision** but are wired into
the same sheet — relevant if that scope reopens.

---

## 5. **SME vs the system's existing SF engine — they are NOT the same**

Compared against `src/lib/computation/sf.ts` (`computeSfLoan`):

| Aspect | SF (built) | SME (this calculator) | Same? |
|---|---|---|---|
| Gross-up relationship | `pfBundle = principal × pf/(1+pf)` | `principal = desired × (1+pf)` | ✅ mathematically identical |
| **Processing fee** | **fixed 6% of principal** | **residual** (`bundle − DS − notary`) | ❌ |
| **Admin cost** | **residual inside PF bundle** | **separate rate × loan desired, outside the bundle** | ❌ |
| Doc stamp | 0.75% of principal, flat | 0.75% of principal, **optionally prorated by days** | ⚠️ |
| **Notary** | **0.1%** (`1/1000`) | **0.09%** (`0.0009`) | ❌ |
| Security fee | `principal × securityFeeRate` | not used | ❌ |
| Interest periods | `terms + addonMonths`, **addon ≥ 1 enforced (G1)** | `terms` (+ optional add-on months, **0 in practice**) | ❌ |
| Solving for principal | binary search | direct algebra | ⚠️ implementation only |
| PF rate floor | **G2 guard ≥ 7.354%** | observed rates **0% – 11%**, incl. 3% and 0% | ❌ |

### Consequences for the build

1. **`computeSfLoan` cannot be reused for SME.** The residual logic is *inverted* (SF: admin is the
   plug; SME: processing fee is the plug) and admin sits outside the bundle entirely. SME needs its own
   engine — the earlier plan's assumption that Phase 4 was "just enrol a new rate" is **wrong**.
2. **The G2 7.354% PF floor must not apply to SME.** This resolves the plan's open question
   empirically: real released SME loans carry 3%, 5%, 6% PF rates, and some products 0%.
3. **`addonMonths ≥ 1` (G1) would reject valid SME loans**, which run with add-on = 0.
4. **Rates are per-account, not per-loan-type.** The system's `loan_types` table (one row per named
   product) does not fit ~58 individually-negotiated accounts. This needs a data-model decision before
   any SME computation is built.
5. **Notary rate differs** (0.09% vs 0.1%) — a small but real money difference.

---

## 6. Verification results

### 6.1 Parity against 35 real released loans

| Check | Matched | Tested | Rate |
|---|---|---|---|
| principal | 35 | 35 | **100.0%** |
| interest | 35 | 35 | **100.0%** |
| total loan | 35 | 35 | **100.0%** |
| monthly amortisation | 35 | 35 | **100.0%** |
| notary | 33 | 33 | 100.0% |
| doc stamp | 33 | 33 | 100.0% |
| processing fee line | 34 | 34 | 100.0% |
| admin cost | 30 | 31 | 96.8% |
| **OVERALL** | **270** | **271** | **99.6%** |

Spot examples reproduced exactly:
- `LA900021` — desired 934,579.44 @ 7% PF, 3% × 3mo → principal **1,000,000.00**, interest **90,000**,
  total **1,090,000**, monthly **363,333.33**
- `LA900022` — desired 102,040.82 @ 8% PF, 3% × 6mo → principal **110,204.08**, interest **19,836.74**,
  total **130,040.82**, monthly **21,673.47**

### 6.2 ⚠️ One unresolved discrepancy — needs the client

**Row 21, `LA900039` (SOUTHTECH STEEL MANUFACTURING CORP.), Admin Cost.**
Recorded admin = **61,224.49**; the stated 1% rate on the recorded loan desired (6,061,224.49) gives
**60,612.24** — a **₱612.25** difference.

The recorded figure equals `6,122,449 × 1%`, where `6,122,449 = 6,000,000 ÷ 0.98` — i.e. admin appears
computed on a base grossed up at **2%**, while the loan desired was grossed at **1%**. This looks like a
mid-edit artifact or manual override in a historical record rather than a rule.

**It is NOT confirmed, and I am not treating it as a rule.** Ask the client whether admin cost is ever
computed on a different base, or whether this row was manually adjusted.

---

## 7. VBA macros — no business logic

35 modules, 714 non-blank lines. Decompiled in full; **none contain loan math**:

| Module | Purpose |
|---|---|
| `Module1` | `SpellNumber` — peso amount-in-words for printed documents |
| `Module3` | `Data_Entry` — copies the form to the `Data` register, then **clears the input cells** |
| `Module5` | `extract` — loads a staged record back into the input cells |
| `Module4` | Navigation helpers |
| `Sheet1` | Autocomplete combo box for the `C:C` dropdowns |

**Implication:** worksheet formulas are the complete and only source of computation truth.

---

## 8. Data quality notes (observed, not assumed)

- **Broken defined names.** Many workbook-level names (`bank`, `banks`, `com`, …) resolve to `#REF!`.
- **Live `#VALUE!` / `#REF!` cells** exist in the SME sheet (`I6`, `I8`, `I11`, `J11`, `I20`, `I23`,
  `J23`, `I24`, `J24`) — dependent on chattel/collateral inputs that are empty in the SME path. They do
  not affect the SME results verified above, but confirm the sheet is not error-clean.
- The `Data` register is **cleared on save** by `Data_Entry`, so it is an append-only historical log.

---

## 9. Open questions for the client (do not build past these)

1. **Admin-cost base** — resolve the `LA900039` discrepancy (§6.2).
2. **Per-account rates** — should the system model ~58 negotiated accounts, or collapse them into
   fewer products? This determines the entire `loan_types` data-model decision.
3. **`SME - SPECTRUM` conflict** — calculator says 3.5%/5%/1.5%; the DB seed says 2.25%/6%, inactive.
4. **Doc-stamp proration** — when is `ProrateDS` set to `YES` in practice? Default observed is `NO`.
5. **Add-on months for SME** — always 0, or sometimes used?
6. **Security fee** — the label exists in the SME deduction block but is unused. Dead, or conditional?
7. **Rounding** — the workbook carries full float precision (e.g. `2,040,816.3263999999`) and rounds
   only at display/specific `ROUND()` calls. The SF engine works in integer centavos with HALF-UP. The
   intended rounding policy for SME must be confirmed before implementation.

---

## 10. Reproducing this extraction

Scripts are in the session scratchpad (`.../scratchpad/`):
`03_dump.py` (parser) · `06_selftest.py` (parser proof) · `07_cells.py` (targeted cells) ·
`08_parity.py` / `10_parity2.py` (parity harness) · `12_vbamods.py` (VBA).
