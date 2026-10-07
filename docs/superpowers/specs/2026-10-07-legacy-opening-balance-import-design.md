# Legacy Opening-Balance Import Design

## Purpose

Allow a super admin to turn a validated legacy SF or SME Accounts sheet into live LoanStar borrower and loan-account records without recreating unverified historical receipts or payments.

## Scope

Each accepted row creates one borrower, one `loan_applications` record, one computation, one `masterlist` account, and one pending amortization-schedule row. The schedule row's amount due equals the imported outstanding balance. It is the sole amount future LoanStar payments can collect.

The import does not create payments, DCRs, postings, historical installments, release files, or PDC records. Uploaded non-Accounts sheets remain reference material only.

## Balance Rule

The source sheet must map both **Outstanding Balance** and **Balance As Of**. Balance As Of is a snapshot date, not a payment due date. It must never be used automatically as the due date of the entire remaining balance.

### Live database audit correction

On 2026-10-07, MCP inspection of LoanStar project `acopcwlhkovssjnrqygk` confirmed that `refresh_one_masterlist_aging` calculates aging and compounded monthly penalties from each unpaid schedule row's `due_date`. An account with an unpaid row over 90 days old can become remedial. Therefore, the originally proposed single row dated Balance As Of is not approved for implementation: it could penalize the entire remaining balance, including installments not yet due.

Before enabling the write path, select the actual repayment representation: either import the remaining unpaid installments with their real due dates and amounts, or explicitly treat the whole balance as one payment with a separately supplied contractual due date. Historical receipts are unnecessary in either approach. Importing remaining unpaid installments does not recreate historical payment receipts.

The earlier proposed rule that Outstanding Balance cannot exceed Total Loan Amount also needs revision when verified legacy penalties or charges are included. A balance must reconcile to its imported unpaid schedule amounts and any explicitly supplied penalty components rather than be silently capped at the original total.

This matches the live `recompute_outstanding_balance` function, which derives the account balance from unpaid schedule rows. It prevents later LoanStar payments from restoring the full original loan amount.

## Import Transaction

The server validates every row again immediately before import. For each valid row it calls a database RPC that runs as the authenticated super admin and uses the database transaction for that RPC call.

Within one row transaction, the RPC:

1. Re-checks that the legacy loan number does not already exist in `loan_applications` or `masterlist`.
2. Inserts the borrower with the mapped identity, contact, address, and segment details.
3. Inserts a `loan_active` application using the legacy loan number as its application number.
4. Inserts an active computation using the mapped financial values.
5. Inserts an active masterlist account using the imported outstanding balance.
6. Inserts the unpaid schedule representation selected by the user, using actual payment due dates rather than the snapshot date.
7. Returns the created IDs and loan number.

If any of those steps fails, PostgreSQL rolls back that row. Other rows are independently reported as imported or failed. The RPC uses `SECURITY INVOKER`, explicitly checks `is_super_admin()`, has a locked search path, and is executable only by `authenticated` users.

## User Experience

Validation will block import unless each row has a positive Outstanding Balance, Balance As Of date, and a complete unpaid schedule representation with actual due dates. The final screen replaces the temporary lock after these requirements are implemented. The Import button sends only eligible rows to a new protected import route and then shows imported and failed counts with row-level messages.

The run record is updated from `validated` to `imported` or `partially_imported`, with imported and failed row counts. An audit event records the import run and created account identifiers.

## Data Changes

The migration is limited to legacy-import support:

- Add opening-balance result counts to `legacy_import_runs`.
- Add the protected per-row import RPC.
- Add no columns, policies, or behavior to borrowers, applications, computations, masterlist, schedules, payments, DCRs, or postings beyond inserting the new records through the RPC.

## Verification

Tests cover validation requirements, normalized import payloads, duplicate protection, UI confirmation, and import-result rendering. A database integration check verifies the imported account's stored outstanding balance equals the single pending schedule balance and that no payment, DCR, or posting records are created.
