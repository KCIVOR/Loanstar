# Seafarer due-day workbook audit

Historical source-inspection stage. Subsequent native Excel testing, user approval of month-end clamping and the local/staging implementation are recorded in [the completion report](seafarer-due-day-fix-2026-11-25.md).

Read-only audit, 2026-11-25. Source: C:/Users/Rovick/Downloads/SFCalculator/SF Calculator.xlsm. Original client report #4 asks for the 10th and broader future flexibility. No code/workbook changes or runtime Excel recalculation were performed.

## Verified source evidence

- SEAMAN (offset)!H5 is the due-day input (saved value 15). Its list data validation reads $R$5:$R$39. R14 contains 10, confirming the 10th is already a source-list option.
- R5:R26 contains 1 through 22. R27:R28 repeat 19 and 20, R29 is 23, R30 is blank, R31:R37 contains 25 through 31. Therefore **24 is missing**, while 21/22 are present earlier at R25/R26. Duplicates/blanks mean the list is not a clean 1–31 sequence.
- SEAMAN (Printing)!H5 reads ='SEAMAN (offset)'!H5. Its R30 contains 24, so that sheet's separate list includes all 1–31 plus duplicate 19/20 and blanks.
- K25 uses the selected H5 in DATE(YEAR(I30),MONTH(I30)+F8,DAY(H5)); H19 determines first payment, AN17 reads H19, AN18 uses EDATE(AN17,AN11-1). These are inspected formulas, not proof of native Excel recalculation or complete schedule/printing behavior.

## Conclusion and limits

The workbook does not have the web screenshot's 5th/15th/25th-only restriction. It already offers the 10th and a broad range of days. Its offset input list has a missing 24 and duplicate 19/20; do not automatically copy those anomalies into the application.

The report's requested choice between all calendar days and enrollable/configurable days remains unspecified. End-of-month behavior needs explicit verification before establishing an application acceptance rule. This audit does not mark report #4 fixed.
