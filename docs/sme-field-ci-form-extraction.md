# SME Field CI Form — Extracted Field Specification

**Source:** `Downloads\SYSTEM DEV\Step 2 - CIG\SME-IND\FIELD CI FORM (SME) revised.xlsx` (167 KB, 6 sheets, no macros)
**Extracted:** 2026-08-07 · **Method:** raw OOXML parse using the parser self-tested in the calculator extraction
**Completeness:** **3,332 / 3,332 cells parsed across the 4 in-scope sheets — zero missing.**

| Sheet | In scope | Cells parsed | Merges | Formulas |
|---|---|---|---|---|
| Residence Checking | ✅ | 1,032 / 1,032 | 69 | 0 |
| Business Checking | ✅ | 1,092 / 1,092 | 67 | 0 |
| Recommendation | ✅ | 473 / 473 | 55 | 1 |
| Re-loan Verification | ✅ | 735 / 735 | 72 | 3 |
| CM Inspection | ❌ out of scope (collateral) | — | 109 | 0 |
| REM Inspection | ❌ out of scope (collateral) | — | 58 | 0 |

---

## What "100% accurate" does and does not mean here

**Verified exactly** — every cell was read from the raw file and accounted for:
- All field **labels**, verbatim (including the client's own typos, preserved below).
- All **input regions** (merged blank ranges and bordered write-on lines).
- All **tick boxes**, identified from the workbook's own border styles.
- All **formulas** (there are only 4 — see §6).
- Sheet names carry **trailing spaces**, and `Re-loan  Verification` has a **double space** — matters if anything matches on sheet name.

**NOT determinable from the file** — these need the client, and are flagged inline:
- **Data types.** The form is a print layout; a blank line does not declare text vs number vs date. Types below are inferred from labels and marked `?` where genuinely ambiguous.
- **Single- vs multi-select.** Tick boxes carry no grouping metadata. Grouping below is inferred from visual layout.
- **Required vs optional.** Nothing in the file marks any field mandatory.
- **The business-income arithmetic is NOT in the file** — those cells are manually typed (see §6.2). Do not infer the formulas.

There are **no dropdowns, no data validation, and no form controls** anywhere in this workbook — it is a print-and-write form.

---

## 1. Sheet: Residence Checking (Page 1)

### 1.1 Header
| Field | Cell(s) | Type |
|---|---|---|
| Date Requested | `H4:K4` | date |
| Date Visited | `R4:U4` | date |
| Requested By | `H5:N5` | text |
| Visited By | `R5:X5` | text |
| Client Name | `H6:R6` | text |
| Client Address | `H7:X7` | text |
| Company Name | `H8:X8` | text |
| Company Address | `H9:Y9` + `H10:X10` | text (2 lines) |
| Client/s Availability — Date | `G13:I13` | date |
| Client/s Availability — Time | `M13:O13` | time |

### 1.2 Section I — Residence Checking
| Field | Cell(s) | Type |
|---|---|---|
| Address Provided | *(label `D16` — no adjacent input region)* | ⚠ see §7.1 |
| Year of Stay | `L16:N16` | number |
| Estimated Floor Area (SQM) | `T16:U16` | number |
| Provincial Residence | `I17:R17` | text |
| Provincial — Years of Stay | `W17:Y17` | number |
| Owned By | `I18:R18` | text |
| *(unlabelled field)* | `W18:Y18` | ⚠ see §7.2 |
| Previous Address | `I19:R19` | text |
| Previous — Years of Stay | `W19`, `X19:Y19` | number |
| Name of Landlord | `S23:Y23` + `P24:X24` | text |
| *(note line)* | `L25:T25` | text |

**Type of Residence** — 8 tick boxes (likely single-select, confirm):
`Bungalow`(H21) · `Town house`(L21) · `Condominium`(H22) · `Tenement`(L22) · `2-Storey`(H23) · `Apart ment`(L23) *[sic]* · `Mansion`(H24) · `Others`(L24)

> The sheet contains a literal note at `E25`: **"NOTE : the rest please ask the developer"** — an instruction left in the client's own form. Worth raising; it implies the option list may be incomplete.

**Neighborhood** — a 3 × 2 grid of tick boxes, **18 boxes total**:

| Area type | Class (Low/Middle/Upper) | Quality (Poor/Fair/Good) |
|---|---|---|
| Residencial | `H28`/`H29`/`H30` | `J28`/`J29`/`J30` |
| Commercial | `M28`/`M29`/`M30` | `O28`/`O29`/`O30` |
| Mixed | `R28`/`R29`/`R30` | `T28`/`T29`/`T30` |

### 1.3 Findings
| Field | Cell(s) | Type |
|---|---|---|
| Findings Report | `H32:W32`, `H33:W33`, `H34:W34` | textarea (3 lines) |
| Adverse Findings — For Client | `H36:W36`, `H37:W37`, `H38:W38` | textarea |
| Adverse Findings — To the Area | `H39:W39`, `H40:W40` | textarea |

### 1.4 Informant/s — repeating, **3 rows**
| Name | Address |
|---|---|
| `E43:K43` | `M43:W43` |
| `E44:K44` | `M44:W44` |
| `E45:K45` | `M45:W45` |

### 1.5 Adjudication of Expenses
| Field | Tick | Value cell(s) | Type |
|---|---|---|---|
| Is property mortgage | `F47` | — | boolean |
| → To whom | | `N47:X47` | text |
| → Monthly Amort | | `N48:P48` | money |
| → Years to pay | | `S48:T48` | number |
| → Months left | | `X48:Y48` | number |
| With Vehicles | `F49` | — | boolean |
| → How many | | `M49:N49` | number |
| → What Kind / model | | `S49:Y49` | text |
| under mortgage | `F50` | — | boolean |
| → To whom | | `N50:X50` | text |
| → Monthly Amort | | `N51:P51` | money |
| → Years to pay | | `S51:T51` | number |
| → Months left | | `X51:Y51` | number |
| how many are leaving in the house *[sic — "living"]* | `F52` | `M52:O52` | number |
| If any there is a maid — How many | | `T53:W53` | number |
| If any there is a maid — Salary | | `T54:W54` | money |
| Electrical expense monthly | `F53` | `M53:O53` | money |
| Water expenses monthly | `F54` | `M54:O54` | money |
| Internet expenses monthly | `F55` | `M55:O55` | money |
| Food expenses monthly | `F56` | `M56:O56` | money |
| School Expenses | `F57` | `M57:O57` | money |

| Other Remarks | `H59:W59` + `D60:W62` | textarea (4 lines) |

---

## 2. Sheet: Business Checking (Page 2)

### 2.1 Header
Client/s Availability — Date `G6:I6`, Time `M6:O6`.

### 2.2 Section II — Business Detailed
| Field | Cell(s) | Type |
|---|---|---|
| Address Provided | *(label `D9` — no adjacent input)* | ⚠ §7.1 |
| Year of Stay | `L9:N9` | number |
| Estimated Floor Area (SQM) | `U9:V9` | number |
| If Rented — Name of Landlord | `K10:S10` | text |
| If Rented — Telephone Number | `W10:Y10` | phone |
| Previous Address | `I11:R11` | text |
| Previous — Years of Stay | `W11`, `X11:Y11` | number |
| Reason of Transfer | `J12:Y12` | text |

**Neighborhood grid #1 (main business site)** — 18 tick boxes, same layout as §1.2: rows 15–17, columns `H`/`J` (Residencial), `M`/`O` (Commercial), `R`/`T` (Mixed).
**Findings Report:** `H19:W19`, `H20:W20`.

### 2.3 Other Offices
| Field | Cell(s) | Type |
|---|---|---|
| BRANCH | tick `H22` | boolean |
| WAREHOUSE | tick `L22` | boolean |
| Address | `F23:R23` | text |
| Year of Stay | `W23:Y23` | number |
| If Rented — Name of Landlord | `K24:S24` | text |
| If Rented — Telephone Number | `W24:Y24` | phone |
| Estimated Floor Area (SQM) | `M25:N25` + `M26:N26` | number |

**Neighborhood grid #2 (the branch/warehouse)** — a second, independent 18-box grid, rows 28–30.
**Findings Report:** `H31:W31`, `H32:W32`.

### 2.4 Adverse Findings & Informants
- For Client: `H34:W34`, `H35:W35`, `H36:W36`
- To the Area: `H37:W37`, `H38:W38`
- Informant/s — **3 rows**: Name `E41:K41`/`E42:K42`/`E43:K43`, Address `M41:W41`/`M42:W42`/`M43:W43`

### 2.5 Adjudication (business)
| Field | Tick | Value cell(s) | Type |
|---|---|---|---|
| With Stocks | `E45` | — | boolean |
| → How Many | | `M45:O45` | number |
| → Estimated Amount | | `S45:W45` | money |
| Employees | `E46` | — | boolean |
| → How Many | | `M46:O46` | number |
| → Total Salary per Month | | `T46:W46` | money |
| Electricity Espenses Monthly *[sic]* | | `M47:O47` | money |
| Water Espense Monthly *[sic]* | | `T47:W47` | money |
| Operation Problem encountered | `E48` | `K48:Y48`, `F49:Y49` | textarea |
| Collection Problems | `E50` | `J50:Y50`, `F51:Y51` | textarea |
| Operation Problem encountered at the Branch / warehouse | `E52` | `P52:Y52`, `F53:Y53` | textarea |
| Number of Clients | `E54` | `L54:N54` | number |
| → Major Clients | | `R54:Y54` | text |
| → Name and Contact Number | | `L55:Y55`, `G56:Y56` | textarea |
| Number of Suppliers | `E57` | `L57:N57` | number |
| → Major Suppliers | | `R57:V57` | text |
| → Name and Contact Number | | `L58:Y58`, `G59:Y59` | textarea |

| Other Remarks | `H61:W61` + `D62:W66` | textarea (6 lines) |

---

## 3. Sheet: Recommendation (Page 3)

| Field | Cell(s) | Type |
|---|---|---|
| Evaluation Summary | `D6:N13` (8 lines) | textarea |
| Credit Realization — RISK | ticks `F17` HIGH · `H17` MEDIUM · `J17` LOW | single-select |
| *(notes under risk)* | `D18:N21` (4 lines) | textarea |

### 3.1 Combined Expenses Adjudication — **House Expenses** (left column)
`Rental` G26 · `Salary` G27 · `Electricity` G28 · `School Expenses` G29 · `Water` G30 · `Internet` G31 · `Foods` G32 · `Others` G33
→ **TOTAL `G34` is the form's only computed field on this sheet** (see §6.1).

### 3.2 Combined Expenses Adjudication — **Business Income** (right column)
Header: *"BASE ON INTERIM INCOME STATEMENT"* (`K25`)

| Label | Value cell |
|---|---|
| TOTAL SALES (YEARLY) | `M26:N26` |
| Net Income (YEARLY) | `M27:N27` |
| Net income percantage *[sic]* | `M28:N28` |
| OPERATIONAL EXPENSES/BUSINESS EXP 82% | `M29:N29` |
| Net income per month | `M30:N30` |
| Net income | `M31:N31` |
| 30% of monthly NET INCOME | `M32:N32` |
| *(unlabelled)* | `M33:N33` |
| TOTAL | `M34:N34` |

> ⚠ **None of these are formulas.** Despite labels naming "82%" and "30%", the values are typed by hand. See §6.2 — do not guess the intended arithmetic.

### 3.3 Recommendation & sign-off
| Field | Cell(s) |
|---|---|
| FOR APPROVAL | tick `D43` |
| FOR DISAPPROVAL | tick `D44` |
| Prepared by | `F47` — **pre-filled: "ADRIAN MAGNO"** |
| Prepared date | `F48:J48` |
| Review by | `F51` — **pre-filled: "JUN REPASO"** |
| Review date | `F52:J52` |

---

## 4. Sheet: Re-loan Verification

Title: **"RE-VERIFICATION OF FIELD INVESTIGATION"** — the lighter form for repeat borrowers.

### 4.1 Header
Date Requested `E4:J4` · Date Visited `M4:O4` · Requested By `E5` — **pre-filled "JUN P. REPASO"** · Visited By `M5:O5` · Client Name `E6:O6` · Client Address `E7:O7` · Company Name `E8:O8` · Company Address `E9:O9` + `E10:O10`

### 4.2 Residence Verification
| Field | Cell(s) | Type |
|---|---|---|
| Type of Residence | `E14:J14` | text |
| Still Residing | tick `E15` | boolean |
| OWNED | `H15:L15` | text ? |
| Years of Stay (owned) | `O15` | number |
| Transfer Residence | tick `E16` | boolean |
| RENTING | tick `H16` | boolean |
| Monthly Rental | `K16:L16` | money |
| Years of Stay (renting) | `O16` | number |
| If Transfer, New Address | `F17:O17` | text |

**Household Expenses:** Electricity `E19:F19` · Water `E20:F20` · Internet `E21:F21` · Subdivision Dues `E22:F22` · School Expenses `E23:F23` · Helpers Salary `L19:M19` · Monthly Amortization (if mortgage) `L20:M20`
→ **Total Household Expenses `L23`** (computed, §6.3)

**Other Remarks:** `C26:O29` (4 lines)

### 4.3 Business Verification
| Field | Cell(s) | Type |
|---|---|---|
| Condition of the Business | ticks `H31` POOR · `J31` GOOD · `L31` EXCELENT *[sic]* | single-select |
| Permits Registration | ticks `H32` UPDATED · `L32` NOT UPDATED | single-select |
| Stocks — No. | `G33` | number |
| Stocks — Estimated Cost | `L33:N33` | money |
| Collection Problem | `E34:O34` | text |
| Operation Problem | `E35:O35` | text |

**Business Expenses:** Salary of Employee `F37:G37` · Water `F38:G38` · Electricity `F39:G39` · Internet `F40:G40` · Rental `F41:G41` · Operational Expenses `L37:M37` · *(extra)* `F42:G42`
→ **Total Business Expenses `L41`** (computed, §6.4)

**Other Remarks:** `C44:O47` (4 lines)

### 4.4 Base on FS / Risk / Sign-off
| Field | Cell(s) |
|---|---|
| TOTAL SALES | label `C49` |
| Net Income Percentage | label `C50` |
| Opex/Business Expense | label `C51` |
| Net Income per month | label `J49`, value `M49` |
| TOTAL NET INCOME | `M50` (computed, §6.5) |
| RISK | ticks `F52` LOW · `H52` MEDIUM · `J52` HIGH — single-select |
| Recommendation | `C55:O60` (6 lines) |
| **Verified by** | `C63:G63` → role label **"Field Investigator"** |
| **Noted by** | `K63:O63` → role label **"Marketing Officer"** |

---

## 5. Roles named in the form (⚠ neither exists in the system)

The form is signed off by **Field Investigator** and **Marketing Officer**. The system's roles are
`super_admin, borrower, agent, csa, cig, committee, lra, ar, collector, remedial` — **neither role exists**.
This is direct evidence for the open question already flagged at Phase 6.4 of the implementation plan:
whether CIG performs the field visit, or a distinct Field Investigator role must be created.

Pre-filled names in the file (`ADRIAN MAGNO`, `JUN REPASO`, `JUN P. REPASO`) are the client's own staff
defaults — treat as sample data, **not** as values to hardcode.

---

## 6. All formulas in the form (there are only 4)

**6.1 Recommendation `G34` — Total House Expenses**
`=+G33+G31+G32+G30+G29+G28+G27+G26` → sums all 8 house-expense lines. ✅ complete and correct.

**6.2 Recommendation — Business Income column has NO formulas.**
Every value in `M26:N34` is typed by hand, including the cells labelled "OPERATIONAL EXPENSES/BUSINESS EXP **82%**" and "**30%** of monthly NET INCOME". **Do not infer these.** Ask the client:
is opex literally 82% of sales? Is "30% of monthly net income" their lending-capacity rule (and is it
compared against the household-expenses total)? This is the SME equivalent of the Seafarer 35% coverage
ratio and must be confirmed, not guessed.

**6.3 Re-loan `L23` — Total Household Expenses**
`=E19+E20+E21+E22+E23+L19+L20` → Electricity + Water + Internet + Subdivision Dues + School + Helpers Salary + Monthly Amortization. ✅ 7 inputs.

**6.4 Re-loan `L41` — Total Business Expenses**
`=L37+F41+F40+F39+F38+F37` → Operational Expenses + Rental + Internet + Electricity + Water + Salary of Employee. ✅ 6 inputs. **Note `F42` (the extra blank line under Rental) is NOT included in the total** — confirm whether that is intentional.

**6.5 Re-loan `M50` — Total Net Income**
`=-M49-L23` → **negative** net income per month, minus household expenses. The sign convention is unusual
and would produce a negative result for positive inputs. ⚠ Flag to the client rather than "correcting" it —
it may reflect how they enter `M49`.

---

## 7. Ambiguities requiring client confirmation (do not resolve by assumption)

1. **"ADDRESS PROVIDED"** (Residence `D16`, Business `D9`) has **no adjacent input region**. Either the address is taken from the header (Client/Company Address), or the write-in area is unstyled and invisible in the file. Confirm.
2. **Unlabelled field `W18:Y18`** on Residence Checking sits beside "OWNED BY" with no caption.
3. **Tick-box grouping** — nothing in the file says whether "Type of Residence" (8 options) or the Neighborhood grid allow one or multiple selections. Layout suggests single-select per group; confirm.
4. **The embedded note "NOTE : the rest please ask the developer"** (Residence `E25`) suggests the residence-type list was left unfinished.
5. **Two independent Neighborhood grids** exist on Business Checking (main site + branch/warehouse). Confirm both are captured separately.
6. **Repeating rows are fixed at 3 informants** on both sheets — confirm whether the system should allow more.
7. **Field data types** are inferred from labels throughout; none are declared in the file.

---

## 8. Implementation notes

- Target storage already exists, unused: `verifications.field_visit` (jsonb) and `verifications.sme_reloan_verification` (jsonb), added by `20260727005404_sme_segment_schema_foundation.sql`. Sheets 1–3 map to `field_visit`; sheet 4 maps to `sme_reloan_verification`.
- This maps to **Phase 6** of `docs/sme-segment-implementation-plan.md`.
- **CM Inspection / REM Inspection sheets are deliberately excluded** — collateral products are out of scope per the 2026-07-27 decision.
- The Recommendation sheet's business-income block is the natural place for an SME affordability rule; it interacts with plan item **3.5.4** (coverage ratio for business borrowers).

## 9. Reproducing

Scripts in the session scratchpad: `21_ci_extract.py` (layout), `23_ci_fields.py` (fields + tick boxes
via border styles), `24_ci_formulas.py` (formulas), reusing the self-tested parser from `03_dump.py`.
