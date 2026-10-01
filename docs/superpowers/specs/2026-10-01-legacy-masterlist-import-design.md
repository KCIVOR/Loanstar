# Legacy Masterlist Import Design

## Goal

Import historical Seafarer, SME, and Individual loans as accurate, released accounts in AR Masterlist, while allowing a borrower portal account to be connected later.

## Scope

The import creates the released-account record chain needed by the current system:

```text
Borrower → Loan application → Computation → Release file → Masterlist → Amortization schedule
```

Where source data exists, it also imports historical payments and PDC checks. It does not send historical loans through the normal LRA processing queue.

## Import workbook design

Create one Excel workbook template for each segment: Seafarer, SME, and Individual. Each workbook has the same operational tabs, with segment-specific borrower and collateral columns.

1. `Accounts`: one row per loan. Contains borrower identity/contact details, original loan and fee values, loan dates, product/schedule details, current account status, and balance cut-off date.
2. `Installments`: one row per scheduled payment. Contains the account number, installment number, due date, original amount due, amount paid, paid date, remaining amount, status, discounts, and penalties.
3. `Payments`: one row per historical payment when available. Contains the account number, payment date, amount, payment channel, reference number, and verified status.
4. `PDC Checks`: one row per check when available. Contains the account number, check number, bank, account reference, amount, check date, and check status.
5. `Instructions`: explains required fields, permitted values, how account numbers connect tabs, and validation/reconciliation rules.

The `Installments` tab is authoritative for the live account position. A balance-only account is rejected because it cannot establish which installments are paid, partial, overdue, discounted, or penalty-bearing.

## Minimum data rules

Every account needs a unique legacy loan/account number, borrower name, usable email, segment, release date, first payment date, term, payment frequency, due day, original loan amounts, balance-as-of date, outstanding balance, account status, aging bucket, and an installment schedule.

The importer verifies that the account outstanding balance equals the sum of the remaining installment balances at the declared balance-as-of date. When payment rows are provided, it also reconciles their total to the schedule's recorded payments. A row failing either check is not imported.

`Payments` is optional only when `Installments` accurately records the paid and remaining state of every installment at cut-off. If a historical payment trail is available, it is imported as an audit trail. PDC checks are optional unless the lender still holds or intends to use them.

## Account creation behavior

For every validated legacy account, import service creates a borrower without a portal `user_id`, an application marked as a legacy released account, its computation snapshot, and a minimal historical release record. It then creates the Masterlist account, imports the schedule, and applies its verified opening state.

The Masterlist record includes a clear legacy-import source marker and audit event. It starts in AR Masterlist. It does not enter LRA, because LRA handles current loans that still need release processing.

No login, password, or Auth user is imported. Later, an authorized staff member can create/invite a borrower portal account and connect that user to the existing imported borrower. The borrower then sees the connected legacy account in the portal.

## Segment distinctions

Seafarer includes birthday, manning agency, vessel, and seafarer-specific data. SME includes entity type, business details, representative/co-borrower data, and vehicle/property collateral fields. Individual includes personal identity/contact details and individual-loan/collateral fields, but excludes corporate business/representative fields.

## Safety and errors

The import is dry-run first. It rejects duplicate account numbers, duplicate borrower email conflicts, missing cross-tab account references, invalid enum values, invalid installment totals, and attempts to re-import an already-imported legacy account. A validated run presents a row-level error report before any write. A committed run is atomic per account: no partially-created borrower, application, or Masterlist account remains after a failure.

## Testing

Tests cover the cross-tab reconciliation, each segment's required fields, duplicate prevention, historical schedule states, direct Masterlist creation without an LRA queue item, and later portal-account linking.
