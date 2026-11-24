# Committee summary Principal Amount

Completed on local staging, 2026-11-25. This is an additional improvement explicitly requested by the user after QA discovery, not an original client report.

## Finding and change

Committee's read-only From CSA computation summary omitted Principal Amount although its API already supplied the saved principal. Added a formatted row below Monthly Amortization, matching the shared editable calculator. No calculations, database schema or saved financial records were changed.

Source: src/app/committee/applications/[id]/page.tsx. Branch: staging. Local app: http://localhost:3000; configured staging database: ddsvqjaknuniekygpbdr.supabase.co.

## Verification

- Reproduced the missing row with Quick Login UAT Committee before editing.
- Reloaded after the change and verified exactly one Principal Amount row, displaying 201,100.00, equal to the authenticated Committee API's saved principal.
- Used existing staging application 36383139-36fd-437b-ab35-a33de6797ae3 (AN300023); no computation/recalculation/save action was performed.
- Visually inspected the after screenshot. Browser task closed after verification.
- git diff --check passed. Existing unrelated working changes were preserved.
- File-scoped ESLint reports an existing react-hooks/set-state-in-effect violation at line 494 (`void load()`); the added display row does not modify that effect. Lint is not fully passing.

[Before screenshot](../output/reports/committee-summary-principal-2026-11-25/before.png) (lower summary viewport; full pre-change summary text was inspected during reproduction).

[After screenshot](../output/reports/committee-summary-principal-2026-11-25/after.png) and [verification values](../output/reports/committee-summary-principal-2026-11-25/verification.json).

## Client-document wording

Additional improvement: Committee can now see the Principal Amount directly in its read-only From CSA computation summary.

## Remaining

- [ ] Review/release the frontend change and verify the deployed view. Production was not changed.
- [ ] Broader input-mode/loan-segment UI checks, if required for release; this live check used the existing Seafarer PRINCIPAL record.
