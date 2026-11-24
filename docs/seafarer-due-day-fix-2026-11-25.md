# Seafarer due-day selection — implementation and verification

Date: 2026-11-25, Asia/Manila. Original report #4: 89ce2a58-83f5-46e0-a229-766209e5cf1a. Original priority: medium. Production source status remains the original open snapshot, not a live closure check.

## Requirement and workbook evidence

Client report requests the 10th and future flexibility across CSA, Committee and LRA. The user approved a clean 1–31 dropdown, then explicitly chose the last day of the payment month when the selected day does not exist.

The supplied SF Calculator.xlsm already offers the 10th through SEAMAN (offset)!H5's R5:R39 validation list. The list duplicates 19/20 and omits 24 on the offset sheet; these list defects were not copied. Printing H5 links to offset H5.

Native Microsoft Excel was run invisibly with macros/events disabled, links not updated, and the source opened read-only. Input changes were in memory only; the workbook was closed without saving. Results are in [native-excel.json](../output/reports/due-day-audit-2026-11-25/native-excel.json).

| Release / selected day / add-on | Native workbook first payment | App expected under approved rule |
|---|---|---|
| 2026-01-20 / 10 / 1 | 2026-02-10 | 2026-02-10 |
| 2026-01-22 / 10 / 1 | 2026-03-10 | 2026-03-10 |
| 2026-01-20 / 31 / 1 | 2026-02-02 | 2026-02-28 |
| 2028-01-20 / 31 / 1 | 2028-02-02 | 2028-02-29 |
| 2026-03-20 / 31 / 1 | 2026-04-02 | 2026-04-30 |

Thus this matches the workbook's flexible day selection and ordinary 10th/cutoff behavior, with a specifically approved correction to its overflow behavior. It is not a claim of exact workbook parity for every date/formula/document. Native Excel printing was not performed.

## Reproduced cause and fix

Before editing, Egolite confirmed LRA only offered 5/15/25. A new validation test failed because calendar days were rejected. The shared panel and service validator restricted Seafarer days to 5/15/25; all three API schemas separately capped the day at 28.

Changes:

- Shared CSA/Committee/LRA panel now offers exactly 1–31 with correct ordinal labels and a short-month explanation.
- Shared validation and CSA/Committee/LRA API schemas accept integer days 1–31 and reject missing Seafarer days, fractions and out-of-range values.
- Existing 22nd release cutoff/add-on behavior is preserved. First-payment calculation already clamps to month-end.
- Recurring monthly AR, discount-unit, PDC draft/validation and BLRI fallback schedule paths now retain an explicitly selected 29–31 after a clamped first month. For example Feb 28 returns to Mar 31. Anchors inconsistent with the selected day remain authoritative; generic SME/Individual due-day defaults do not override their payment date.
- BLRI recurring-day wording retains 31st while its February payment date is February 28. Existing date formatting is preserved.
- No database schema/migration, historical loan rewrite, production deployment or remote report closure.

## Verification

635 tests passed across computation, CSA, LRA and negotiation suites. Includes all 31 allowed days, invalid values, real CSA initial computation/Committee adjustment/LRA recomputation services, the 10th, 22nd cutoff, add-on months, day 24, year rollover, February in leap/non-leap years, recurring schedule recovery, PDC date helper, discount units, BLRI schedule and stamp reconciliation. Service tests use offline persistence stubs, not live CSA/Committee writes.

Scoped ESLint on the changed computation/service/API files passed. git diff --check passed. Repository-wide TypeScript still has 16 diagnostics outside this change. Broader AR tests contain three date-sensitive move-of-payment failures (their deadline is no longer after today); those are not treated as passing or fixed here.

Final broader run: **901 tests, 898 passed, 3 failed** (the move-of-payment cases above). [Targeted log](../output/reports/due-day-audit-2026-11-25/tests-targeted.txt), [broader log](../output/reports/due-day-audit-2026-11-25/tests-broad.txt), [TypeScript diagnostics](../output/reports/due-day-audit-2026-11-25/typecheck.txt).

## Browser evidence and cleanup

Egolite used local http://localhost:3000, branch staging, configured development database ddsvqjaknuniekygpbdr.supabase.co. Existing authorized UAT application AN300023 (36383139-36fd-437b-ab35-a33de6797ae3) was used.

- [Before](../output/reports/due-day-audit-2026-11-25/before.png): original 5/15/25 options.
- Before-options evidence was extracted directly from the live select: blank, 5th, 15th, 25th. The screenshot shows the selected 15th rather than an expanded native popup.
- [LRA 10th](../output/reports/due-day-audit-2026-11-25/lra-after.png): selected day 10 saved; verified after reload against authenticated API. The legacy cutoff rule with Dec 12 release/add-on 0 produces Dec 10 first payment; this existing cutoff behavior was not changed.
- [LRA 31st](../output/reports/due-day-audit-2026-11-25/lra-31.png): Jan 20 release, one add-on month, day 31; saved first payment Feb 28.
- [PDC preview](../output/reports/due-day-audit-2026-11-25/pdc-31.png): Feb 28, Mar 31, Apr 30, May 31. Draft only; no PDC schedule submitted.
- Original financial inputs and values restored and compared with baseline: principal 201100, release Dec 12, due 15, add-on 0, terms 4, first payment Dec 15, stamp 384.29, admin 5630.43, discounts/deductions and totals unchanged. Version 32 advanced to 35 as normal; audit/version/signature refresh history remains. No generated documents, acknowledged briefing or saved PDCs existed before/after. [Restoration](../output/reports/due-day-audit-2026-11-25/restored.json).
- [CSA editable view](../output/reports/due-day-audit-2026-11-25/csa-after.png): UAT CSA opened existing submitted dummy application AN300007 (663fb79f-ec83-4714-91ca-47784370e164), verified all 31 options and selected 10th without submitting. Selection was discarded on navigation.
- [Committee editable view](../output/reports/due-day-audit-2026-11-25/committee-after.png): UAT Committee opened AN300025 (d66147df-30ef-4f94-84ce-4382209a21ba), verified all 31 options and selected 10th without recalculating/voting. Selection was discarded when the browser task closed. These screenshots demonstrate selection, not saved role-specific recalculations.
- Browser task closed after all role checks; the local dev server was restarted after a connection interruption. No production access or writes were required.

## Client-document wording

The Seafarer calculator now supports due days from the 1st through the 31st, including the 10th. When a month does not have the selected day, its last day is used, and later months return to the selected day. The 10th and month-end payment dates passed staging checks. Production deployment and final document rendering checks remain pending.

## Remaining release work

**Strict pre-push update (2026-11-25):** A new negative test exposed day-31 recovery leaking into SME/Individual legacy monthly anchors. Corrected by requiring explicit Seafarer segment context throughout AR/discount/PDC/BLRI paths; both other segments retain their original release-based anchor. Candidate production build and 721 targeted tests pass. Full baseline/candidate checks still have identical existing failures. See [scope audit and smoke report](prepush-smoke-audit-2026-11-25.md).

- [ ] Review/release and verify deployed behavior before closing the production report.
- [ ] Generate and visually inspect the final documents with a month-end schedule; automated template/BLRI data checks and a browser PDC preview do not prove rendered documents or physical printing.
- [ ] Resolve unrelated repository TypeScript and date-sensitive AR test failures separately.
