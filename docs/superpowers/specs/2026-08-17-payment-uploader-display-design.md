# Payment Uploader Display

**Date:** 2026-08-17
**Status:** Approved

## Goal

Identify who recorded each payment wherever payment history is shown, while keeping internal staff names private from borrowers.

## Display rules

- Collector Proofs keeps its existing `Recorded by {staff name}` label.
- Collector History shows `Recorded by {staff name}`.
- Remedial account Payment history shows `Recorded by {staff name}`.
- Borrower Payment history shows `Recorded by Loanstar staff` when a staff member recorded the payment.
- Borrower-submitted payments do not receive the staff label.

## Data flow

Internal APIs resolve `payments.uploaded_by` through `profiles` and return `uploadedByName`. The borrower loan API does not expose profile names; it returns an `uploadedByStaff` boolean derived server-side by comparing the uploader with the authenticated borrower.

No schema, role-permission, or RLS changes are required.

## Testing

Source-level regression tests assert the internal labels, the borrower-safe label, and the absence of staff-name exposure in the borrower response.
