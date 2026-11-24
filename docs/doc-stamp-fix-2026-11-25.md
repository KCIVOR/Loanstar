# Documentary stamp computation — fix and verification

Completed: 2026-11-25 (Asia/Manila). Report ID: 95d7414b-e2be-487d-8ec5-faa82da6e892.
Status: **fixed and verified on local staging for Seafarer loans; production release pending.**

## Report and reproduced finding

Original report: computation only uses Principal Amount × 0.75%. Expected: use that full rate for terms of at least 365 days, otherwise multiply by term days / 365. The original image gives 100,000 principal over 90 days → 184.93.

[Original attachment](../output/reports/production-reports-2026-11-24/95d7414b-e2be-487d-8ec5-faa82da6e892.jpg) was reviewed. It describes the desired rule rather than independently proving the live defect.

The existing LRA staging computation v22 had principal 201,100, release 2026-12-12, first payment 2026-12-15, 4 monthly installments and no add-on months. Its last payment is 2027-03-15, giving 93 actual days. It stored Doc Stamp 1,508.25 (the full-year amount), rather than the required 384.29. [Untouched before screenshot](../output/reports/doc-stamp-2026-11-25/lra-before.png).

Before implementation, real-service regression tests for CSA, Committee and LRA failed the client's 100,000/90-day example, 364-day boundary and supplied workbook example: **9 failed, 6 passed**. The 365/366-day controls already passed. No application source was changed before this reproduction/evidence.

## Client workbook and printing audit

Supplied source: C:/Users/Rovick/Downloads/SFCalculator/SF Calculator.xlsm. Read-only formula extraction was performed; macros and native Excel printing were not executed.

Verified SF chain:

- SEAMAN (offset)!F19 is release date.
- AN17 reads the first scheduled payment.
- AN18 = EDATE(AN17, AN11-1), the final monthly payment.
- M10 = IF(DAYS(AN18,F19)<365, 0.0075*DAYS(AN18,F19)/365, 0.0075).
- F11 = M10*BM13, using principal.
- F9 = G14-F15-F13-F11: Admin Cost is the residual of the fixed fee bundle.
- The printing sheet uses the same documentary-stamp amount; its BA17 prints F11.

The saved workbook example is principal 111,340, release 2026-07-20, first payment 2026-09-15, 6 installments and 2 add-on months. Final payment 2027-02-15 gives **210 days**, stamp **480.44**, residual Admin Cost **4,067.82**. Browser reproduction after the fix matched these stamp and admin values. Other saved source fields, such as its manually stored security fee, were not treated as a complete financial parity target.

The user's scope follow-up asked whether this rule exists in their actual calculator and printing flow. We located and read three actual SME workbooks, rather than relying only on project comments:

- C:/Users/Rovick/Downloads/Calculator SME.xlsm.
- C:/Users/Rovick/Downloads/SYSTEM DEV/Step 1 - Processing-CSA/SME - Individual/Calculator SME.xlsm.
- C:/Users/Rovick/Downloads/LSLGC Calculator and Docs/Calculator SME.xlsm.

All three have SME!B11 = NO, with V22 = IF(AND(B11="yes",U22<365),U22,365). Thus SME proration exists as an **opt-in**, not the automatic default. F11 also honors No DS & Notary and separate collateral branches. SME!BA17 displays that fee. The app's SME/Individual default full-year and No DS & Notary behavior is preserved. Adding an app-facing SME opt-in switch is separate scope, not silently enabled by this SF correction.

Formula evidence is retained locally as workbook-formulas.json and sme-workbook-rules.json under output/reports/doc-stamp-2026-11-25. No source workbook was modified. These are client-supplied business rules, not an independent legal/tax-compliance determination.

## Implementation

- Added src/lib/computation/documentary-stamp.ts: calculate actual calendar-day differences and apply principal × 0.0075 × min(days,365)/365, rounding once at the final centavo.
- Updated shared persistComputation in src/lib/csa/computation.ts. After release/first-payment dates resolve, Seafarer maturity follows the actual monthly schedule, including cutoff and add-on months. Stamp is applied before deactivating/saving snapshots.
- Reallocated the difference to residual Admin Cost, preserving the SF processing-fee bundle. No net-mode principal, security fee, total deductions or net release change occurs solely from changing the bundle's stamp/admin allocation.
- Updated the full-breakdown explanation from Fixed rate to Applied stamp rate, since the effective rate now varies with term days.
- No database columns, migrations, RLS or API changes were required. Raw date-independent fee-component engines retain their existing basis; the shared dated persistence path makes the final SF allocation.
- Invalid/nonfinite maturity ranges before release are rejected before changing stored computation state; negative tax is not silently produced.

Historical saved computations are not retroactively rewritten. Newly computed/recomputed snapshots use the corrected rule.

## Automated verification

**612 tests passed, 0 failed** across computation, CSA, LRA and negotiation suites. This includes 39 additional stamp/printing checks and retains the previous 24 security-rate regression tests.

New coverage:

- Report example: 100,000 / 90 days → 184.93.
- 364 → 747.95; 365, 366 and 730 → 750.00 on 100,000.
- Client workbook principal/date/add-on case → 480.44.
- CSA initial computation, Committee adjustment and LRA recomputation through real service/engine code with offline persistence stubs.
- Both net modes: correct stamp on the solved principal, preserved net target.
- Actual release-to-final-payment dates, add-on months, 22nd cutoff, leap day, daylight-saving calendar-day counting and final-only rounding.
- SME/Individual defaults and No DS & Notary controls.
- Printing context passes the corrected saved stamp/admin figures and reconciles non-finance charges.

Scoped ESLint and git diff --check passed. Repository-wide tsc --noEmit did **not** pass: it reported 16 diagnostics in unrelated AuthPreview/account/AR/CIG/legacy/ledger/existing test files, including missing vitest declarations and existing fixture-shape/import-target problems. None of the diagnostic locations are the changed/new files in this fix. Full output is preserved as typecheck.txt. A full build was not claimed.

## Egolite verification

Environment: localhost:3000, Git staging, effective Supabase ddsvqjaknuniekygpbdr.supabase.co. The running Next.js process was verified to originate from the Loanstar root checkout. Test app AN300023 / 36383139-36fd-437b-ab35-a33de6797ae3. Existing UAT LRA session used for initial recalculations; CSA, Committee and final LRA checks used actual Quick Login buttons.

No generated documents/PDC checks or acknowledged briefing existed before or after these tests.

| Scenario | Actual result | Saved version | Evidence |
|---|---|---|---|
| 90 days, principal 100,000; reload | Stamp 184.93; Admin 2,805.98 | v23 | [90 days](../output/reports/doc-stamp-2026-11-25/01-90-days.png) |
| 364 days, principal 100,000 | Stamp 747.95 | v25 | [364 days](../output/reports/doc-stamp-2026-11-25/02-364-days.png) |
| 365 days, principal 100,000 | Stamp capped at 750.00 | v26 | [365 days](../output/reports/doc-stamp-2026-11-25/03-365-days.png) |
| Leap-year 366 days; reload | Stamp capped at 750.00 | v27 | [366 days](../output/reports/doc-stamp-2026-11-25/04-366-days.png) |
| Client workbook dates, principal 111,340, 210 days | Stamp 480.44; Admin 4,067.82 | v28 | [Workbook example](../output/reports/doc-stamp-2026-11-25/05-client-workbook.png) |
| Net Desired 90,000 over 90 days | Solved principal 101,215.61; stamp 187.18; net exactly 90,000.00 | v29 | [Net Desired](../output/reports/doc-stamp-2026-11-25/06-net-desired.png) |
| Net less security 90,000 over 90 days; reload | Principal 99,000; stamp 183.08; net 88,029.90 + security 1,970.10 = 90,000 | v30 | [Net less security](../output/reports/doc-stamp-2026-11-25/07-net-less-security.png) |
| Repeat original 90-day case; reload | Stamp remains 184.93 | v31 | [Repeat](../output/reports/doc-stamp-2026-11-25/08-repeat-90-days.png) |
| CSA account: open the saved v31 computation | Displays Doc Stamp 184.93 in read-only intake computation | v31 | [CSA](../output/reports/doc-stamp-2026-11-25/csa-after.png) |
| Committee account: open saved v31 computation | Displays Doc Stamp 184.93 in From CSA/read-only summary | v31 | [Committee](../output/reports/doc-stamp-2026-11-25/committee-after.png) |
| Restore original inputs and reload | Stamp correctly becomes 384.29 for original 93-day loan; net unchanged | v32 | [Restoration](../output/reports/doc-stamp-2026-11-25/09-restored-inputs.png) |

All delivered screenshots were visually inspected. LRA performed actual new snapshot writes; CSA/Committee UI checks verified consistent display of the same stored result, not separate live edits. Their write paths were verified automatically. Some surrounding page sections show a separate loading indicator while the fully rendered computation values are already present.

The full printing context was automatically tested and its saved-value wiring inspected. No new DOCX/PDF was generated through the browser and no physical document was printed. Native Excel macros/print rendering were not executed.

## Test-data cleanup and side effects

The original inputs, loan type, rates, terms/add-on, security fee, net release, total deductions, monthly/total loan/interest, schedule anchors, due day, origination discounts and other deductions were compared after restoration: **no differences**.

The two intentional corrected allocations are:

| Field | Before v22 | Restored-input v32 |
|---|---:|---:|
| Doc Stamp | 1,508.25 | 384.29 |
| Admin Cost | 4,506.47 | 5,630.43 |
| Net released | 178,816.29 | 178,816.29 |

This restores inputs while keeping the fix; it does not restore the incorrect old tax allocation. Ten snapshots v23-v32 remain in staging history, including an initial valid 364-day setup v24 that was superseded by v25 to place the first payment after release. Unsaved native date-input attempts were caught before submission; no malformed date was persisted. Witness/signature timestamps and active computation pointers were refreshed normally by the LRA workflow. No audit history was erased.

No production data, remote report status or supplied workbook was changed. No commit, push or deployment was performed.

## Client-document wording

> Documentary stamp calculation for Seafarer loans has been corrected to follow the supplied calculator: it uses actual days from release to the final scheduled payment, prorates terms shorter than 365 days, and applies the full 0.75% at 365 days or longer. The 90-day example now gives 184.93 on a 100,000 principal. We verified boundary dates, add-on months, both net-input modes and consistent displayed values in CSA, Committee and LRA on local staging. The fixed fee bundle is preserved, with the difference allocated to its residual Admin Cost. Production deployment is pending.

## Remaining work and separate findings

- [ ] Review/promote code and verify deployed production behavior using approved test records.
- [ ] Generate/inspect a representative new client document during release validation; the saved-value printing context is tested, but rendered document/physical print verification remains pending.
- [ ] Assess historical stamp allocations separately before correcting signed/released records.
- [ ] Add SME's opt-in proration control only if explicitly requested; the default-off rule was intentionally preserved.
- [ ] Resolve the unrelated repository-wide TypeScript diagnostics separately.
- [ ] Separate #5 follow-up: Committee's read-only From CSA summary still omits a Principal Amount row (visible in committee-after.png), while the previously fixed shared editable calculator has it. This was recorded rather than changed as part of the stamp fix.
