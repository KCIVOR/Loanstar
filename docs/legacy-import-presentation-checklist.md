# Legacy import presentation checklist

## What is ready

Seafarer, SME and Individual workbooks can be uploaded, mapped, reviewed and saved as active or already-paid legacy loan records. The importer checks that unpaid installments and unpaid fees add up to the declared opening balance. Paid loans require a historical closing date and fully settled source installments covering the original loan. It creates an unlinked borrower and reports success or failure for each account.

Imported loans appear in **AR Masterfile**, not LRA's new-release queue or release history. They are already-issued loans, so importing does not invent release documents. Ordinary payment collection can reduce their balances after import.

## Demo steps

1. Sign in as Super Admin and open Admin → Legacy Import.
2. Upload a fresh dummy workbook from `outputs/legacy-import-dummy-data-20261007/`. Each file contains partial (001), paid (002) and unpaid (003) loans. Use a loan number not already imported. Do not import test data into a production database for a presentation.
3. Select the matching segment and Accounts sheet. Continue to mapping; check all required fields are mapped.
4. Validate and review. Continue only when balances are verified and no opening-balance errors remain.
5. Click Import and confirm. This writes real records. Check each account's result and download the results CSV.
6. Open AR Masterfile, set Source to Imported, and find the exact legacy loan number. Paid shows the fully paid example; Active shows partial and unpaid examples. Inspect the original due dates and unpaid balance on active loans. Paid-at-import loans show zero balance and a settlement notice, not a fabricated transaction ledger.
7. In a test environment, post one payment using the normal collection workflow and verify the balance falls by the posted amount. Old snapshot dates may accrue additional penalties under normal policy.

If a network error leaves the result uncertain, check AR Masterfile before uploading again. Do not assume failure means nothing was saved. Duplicate loan numbers are rejected.

## What not to promise yet

- Creating a new login with the same imported email and automatically linking it is not finished. Linking to an existing portal borrower is supported and database-tested.
- Payments and PDC reference sheets do not become historical receipts or PDC transactions through this import.
- The full project type check is not clean: existing unrelated errors remain.

## Suggested presentation wording

“The system can bring old active loans into the masterfile while preserving their unpaid balances and due dates. Staff can continue collecting payments. The import gives a result for every account. The separate workflow for creating a new borrower login after import still needs completion.”
