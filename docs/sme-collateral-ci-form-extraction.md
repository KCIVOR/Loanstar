# CM Inspection / REM Inspection — Field Extraction

**Source:** `C:\Users\Rovick\Downloads\SYSTEM DEV\Step 2 - CIG\SME-IND\FIELD CI FORM (SME) revised.xlsx`, sheets `CM Inspection ` and `REM Inspection ` (trailing space in both sheet names, as stored in the workbook).
**Method:** `openpyxl` (a maintained library, not a hand-rolled parser — avoids the greedy-regex mislabelling bug from the earlier extraction of the other 4 sheets, per `[[project_sme_workflow_gap]]` 2026-08-07). Every value, merge range, and border-boxed cell was read directly from the workbook, then spot-checked against the raw sheet XML inside the `.xlsx` zip to confirm `openpyxl` wasn't misreading anything (confirmed: `"Coolant"` string count matches, sheet names match `xl/workbook.xml` verbatim).
**Result:** 218 non-empty/boxed cells on CM Inspection, 103 on REM Inspection. Merge counts (109 / 58) match the sheet-level metadata already recorded in `docs/sme-field-ci-form-extraction.md` — confirms this is the same file version already on record. **Zero formulas, zero dropdowns/data validation on both sheets** — same "print-and-write" layout convention as the other 4 sheets (blank merged ranges = fill-in fields, bordered cells = tick-boxes).

This closes Phase 0.7 of `docs/individual-collateral-expansion-plan.md` — Phase 8 (CIG collateral inspection) can now be scoped from real fields instead of a placeholder.

---

## CM Inspection (Vehicle / Car Refinancing collateral)

Header: "LOAN STAR LENDING GROUP CORP" / "VEHICLES INSPECTION REPORT"

### 1. Account
| Field | Notes |
|---|---|
| Account Name | free text |
| Address | free text |

### 2. OR/CR Details (sheet labels this section "OR DETAILE")
| Field | Notes |
|---|---|
| MV File | free text |
| Plate Number | free text |
| Engine No. | free text |
| Chasis No. | free text (sheet's own spelling — "Chasis," not "Chassis") |

### 3. Registration
| Field | Notes |
|---|---|
| Registered Owner | free text |
| Address Registered | free text |
| Encumbered To | free text, full-width line |
| LTO Address | free text |
| OR No. | free text |
| OR Date | free text |
| Amount | free text (OR amount) |

### 4. Insurance
| Field | Notes |
|---|---|
| Insurer / provider | free text, unlabeled value cell under "INSURANCE" header |
| Amount Insured | free text |
| Type of Coverage | free text |

### 5. Odometer
| Field | Notes |
|---|---|
| Odometer During Inspection | free text (sheet spelling: "ODOMITER") |

### 6. Vehicles Check List — table, columns: Items / Working / Not Working / Remarks
16 rows, each a tick-one-of (Working / Not Working) + free-text remarks:
Wipers, Battery, Coolant (Min or Low), Radio, Side Mirror, Windows, Lighter (sheet spelling: "Ligther"), Aircon, Head Lights, High, Low, Cabin Lights, Shocks absorber, Brake Fluid (sheet spelling: "Break Fluid"), Horn, Doors.

### 7. Others — sub-grouped, columns: Item / Yes / No / Remarks
- **Keys:** Remote, Ignition, Key less
- **Speedometer** (sheet spelling: "Speed Dometer"): Analog, Digital
- **Steering Wheel:** Power, None Power
- **Tires:** Ordinary, Mags, then a standalone **Thread of Tires %** field (single free-text value, no Yes/No pair) + Remarks

### 8. Vehicles Condition — table, columns: Items / Good / Fair / Poor / Remarks
11 rows: Engine, Bumper, Body, Grills, **Body** *(appears a second time — a duplicate/likely-typo in the source sheet, not fixed here; flag with the client rather than silently renaming one instance)*, Fender, Paint, Floor Matting, Indoor roof ceiling, Upholster, Differential Box.

### 9. Sign-off
Verified by: ______ / Signature: ______ (single field, no separate "Noted by" — unlike SME's Re-loan Verification sheet which has both Verified-by and Noted-by).

---

## REM Inspection (Real Estate collateral)

Header: "LOAN STAR LENDING GROUP CORP" / "REM INSPECTION REPORT"

### 1. Account
Same as CM: Account Name, Address.

### 2. Title Details
| Field | Notes |
|---|---|
| Registered Owner at the Title | free text |
| Year Register | free text |
| Address Registered at the Title | free text |
| Annotated at the Title | 5 blank full-width lines — a free-text block for listing title annotations, not a single field |

### 3. Insurance
Same shape as CM: Insurer/provider, Amount Insured, Type of Coverage.

### 4. ⚠️ "Vehicles Check List" — mislabeled, copy-paste leftover from the CM sheet
The section header literally still reads **"VEHICLES CHECK LIST"** on the REM sheet — the client copied the CM Inspection layout and only partially adapted it. Same columns (Items / Working / Not Working / Remarks), but:
- Only 4 items have labels: **Paint, CR** *(also a leftover — "CR" is a vehicle document, Certificate of Registration, not a real-estate concept)*, **Rooms, Furnitures**.
- The remaining **12 rows are entirely blank** — no item label, just the tick-box/remarks structure — left for the field investigator to hand-write in whatever property-condition items apply (this matches the "print-and-write" convention already established for the other sheets, just with the label column left empty here instead of pre-filled).

**Recommendation for the build:** don't hardcode "CR" as a real-estate check item — treat this section as Paint + Rooms + Furnitures pre-labeled, plus N free-text/blank item rows the field investigator fills in themselves (mirroring the spreadsheet exactly, quirks included, rather than "fixing" the client's template).

### 5. Others
Unstructured — 5 blank, unlabeled full-width lines (no Item/Yes/No/Remarks table here, unlike CM's structured Others section). Free-text only.

### 6. Sign-off
Same as CM: Verified by / Signature, single field.

---

## Cross-cutting notes for Phase 8 of the expansion plan

- **CM and REM are structurally similar but not identical** — REM is shorter (52 rows vs 74), has a title-annotation free-text block CM doesn't have, and its "Others" section is unstructured where CM's is a further sub-tabled checklist (Keys/Speedometer/Steering/Tires). Build them as two distinct schemas (e.g. `CmInspection` / `RemInspection` types), not one generic "collateral inspection" shape with optional fields — same design principle already used for `FieldVisit` vs `SmeReloanVerification` in `src/lib/cig/field-visit.ts`.
- **Both sheets' quirks (duplicate "Body," leftover vehicle wording on REM) are the client's own template as-is.** Don't silently correct them when building the digital form — surface them back to the client as part of confirming the template, the same way `sme-field-ci-form-extraction.md`'s "ask the developer" note was flagged rather than resolved unilaterally.
- Neither sheet has a risk-rating section (Low/Medium/High) the way SME's Recommendation and Re-loan Verification sheets do — CM/REM are pure inspection checklists with a sign-off, not a credit-decision form. If a collateral-specific risk/recommendation is needed, that's a gap to raise with the client, not something to infer from these two sheets.
