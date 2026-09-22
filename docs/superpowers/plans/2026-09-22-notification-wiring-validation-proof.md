# Notification Wiring Validation Proof

Validated: 2026-09-22. Scope: all current in-app notification dispatches in `src/`, the borrower-account/payment-proof implementation, and read-only checks against Supabase project `acopcwlhkovssjnrqygk`.

## Evidence summary

| Evidence | Result |
|---|---|
| Targeted workflow, borrower-link, payment-review, RLS-policy, and catalog tests | 56 passed, 0 failed |
| Full Node suite | 1,778 passed, 0 failed, 7 skipped |
| Lint | passed |
| Production build | passed |
| Live database | borrower-link RPC exists and is owned by `postgres`; payment update policy exists |
| Live notification rows | existing rows prove inserts for `application_account_connected` (2), `application_endorsed_to_cig` (1), `application_for_verification` (51), `application_for_approval` (46), `application_approved` (45), `computation_signed_by_borrower` (3), `lead_converted` (4), `dcr_rejected` (17), and `application_denied` (1) |
| Browser smoke suite | **not green**: 2 failed (stale/ambiguous assertions), 1 skipped (no seeded credentials) |

The full authenticated notification journey was not executed against production: it requires designated staging test identities and would create real payment/application records and inbox rows. This report therefore separates source/contract proof from a live user-journey proof.

## Visual proof

A live CIG inbox capture was taken during this validation and displayed in the associated Codex task. It shows the in-app notification bell with an unread `New application endorsed for verification` item, its relative timestamp, and the rendered catalog message. The image is intentionally not embedded in this repository report because it contains production borrower information; this report preserves the redacted, reproducible evidence instead.

## Recipient rules

- Every notification is inserted through `src/lib/notifications/write.ts`. It honors `preferences.notifications.inApp === false`, catches failures, and returns without breaking the business operation.
- Borrower notifications resolve `loan_applications.borrower_id -> borrowers.user_id`; an unclaimed borrower is skipped with reason `borrower_unclaimed`.
- Role notifications resolve active users with the target role and exclude the acting user. They are shared-queue broadcasts, not per-application ownership assignment.
- Payment-proof owner is remedial when `assignments.remedial_user_id` exists; otherwise collector. No assignment means no staff notification.

## Workflow catalog notifications

`<application>` below renders as application number and borrower name where available. Trigger locations are source paths, and all catalog entries are verified by `src/lib/notifications/__tests__/workflow-wiring.test.mts` to occur after their named state-changing marker.

| Trigger / location | Recipient | Title | Body |
|---|---|---|---|
| Borrower submits application — `src/app/api/borrower/applications/[id]/submit/route.ts` | active CSA users, excluding borrower actor | Borrower submitted an application | `<application> was submitted by the borrower and is ready for intake review.` |
| Borrower signs computation — `src/app/api/borrower/applications/[id]/computation/route.ts` | active CSA users | Borrower approved the computation | `<application>: the borrower signed the loan computation. The file can move forward.` |
| Borrower replaces a revision-requested document — `src/app/api/borrower/applications/[id]/documents/route.ts` | active CSA users | Borrower uploaded a document | `<application>: a new document is ready for review. Replacement for: <file>.` |
| Staff requests document revision — `src/app/api/documents/[id]/request-revision/route.ts` | linked borrower | A document needs revision | `A document on your application needs to be replaced. Please upload a new copy. Reason: <remarks>.` |
| CSA endorses — `src/app/api/csa/applications/[id]/endorse/route.ts` | active CIG users | New application endorsed for verification | `<application> was endorsed by CSA and is waiting in the CIG verification queue.` |
| CIG returns file — `src/lib/cig/receipt.ts` | endorser; otherwise active CSA users | Application returned to CSA | `<application> was returned by CIG for correction. Note: <note>.` |
| CIG cancels — `src/lib/cig/cancel.ts` | endorser; otherwise active CSA users | Application cancelled by CIG | `<application> was cancelled during verification. Reason: <reason>.` |
| CIG cancels — `src/lib/cig/cancel.ts` | linked borrower | Application cancelled | `Your loan application was cancelled. Please contact Loan Star for guidance.` |
| CIG forwards — `src/lib/cig/forward.ts` | active committee users | Application ready for committee review | `<application> was verified by CIG and is waiting for the committee.` |
| Revision completed — `src/lib/negotiation/service.ts` | active committee users | Revision complete — back for approval | `<application> was revised and is back with the committee.` |
| Committee approves — `src/lib/committee/actions.ts` | active CSA users | Approved — disclose terms to the borrower | `<application> was approved by the committee. Disclose the approved terms to the borrower.` |
| Committee denies — `src/lib/committee/actions.ts` | active CIG users | Denial call needed | `<application> was denied by the committee. Call the borrower to inform them.` |
| Committee revisits CSA — `src/lib/committee/actions.ts` | active CSA users | Committee sent a file back to CSA | `<application> needs revision before it returns to the committee. <detail>` |
| Committee revisits CIG — `src/lib/committee/actions.ts` | active CIG users | Committee sent a file back to CIG | `<application> needs re-verification before it returns to the committee. <detail>` |
| CSA discloses terms — `src/lib/negotiation/service.ts` | linked borrower | Approved terms ready for your review | `The approved loan terms are ready. Please review and sign in your portal.` |
| Borrower counter-offers — `src/lib/negotiation/service.ts` | active committee users | Counter-offer received | `<application>: a counter-offer needs the committee's response. Proposed amount: ₱<amount>.` |
| Committee revises amount — `src/lib/negotiation/service.ts` | linked borrower | Loan amount updated | `The committee updated your loan amount. Please review and sign the new terms.` |
| Committee accepts counter-offer — `src/lib/negotiation/service.ts` | linked borrower | Counter-offer accepted | `The committee accepted your counter-offer. Your application is moving to release.` |
| Borrower negotiation message — `src/lib/negotiation/service.ts` | active committee users | New message from the borrower | `<application>: the borrower posted a negotiation message.` |
| Committee negotiation message — `src/lib/negotiation/service.ts` | linked borrower | New message about your loan terms | `The committee posted a message on your application.` |
| Signed file queues for LRA — `src/lib/negotiation/service.ts` | active LRA users | New file ready for release | `<application> was signed and is queued for release processing.` |
| Release files signed — `src/lib/lra/release-service.ts` | active collection-head users | Release briefing needed | `<application>: all release documents are signed. The borrower briefing is next.` |
| Briefing acknowledged — `src/lib/lra/release-service.ts` | active LRA users | Briefing done — ready for release | `<application>: the briefing was acknowledged. The file is ready for disbursement.` |
| Loan released — `src/lib/lra/release-service.ts` | linked borrower | Your loan was released | `Your loan proceeds have been released. Thank you for choosing Loan Star.` |
| AR masterlist created — `src/lib/ar/masterlist.ts` | active AR users | New account needs a collector | `<application> was released and transmitted. The account is active — assign a collector.` |
| AR masterlist created — `src/lib/ar/masterlist.ts` | linked borrower | Your loan account is active | `Your loan account is now active. You can view your schedule and payments in the portal.` |
| AR marks paid off — `src/lib/ar/masterlist.ts` | linked borrower | Loan fully paid | `Your loan is fully paid. Thank you!` |

## Direct notifications outside the catalog

| Trigger / location | Recipient | Title | Body |
|---|---|---|---|
| CSA connects a walk-in application — `src/app/api/csa/applications/[id]/connect-borrower/route.ts` | target borrower's linked user | Loan application linked to your account | `A Loan Star application has been linked to your borrower account. You can now review it in your portal.` |
| CSA endorses — `src/app/api/csa/applications/[id]/endorse/route.ts` | linked borrower | Application sent for verification | `Your loan application was endorsed to CIG for credit verification.` |
| CIG forwards — `src/lib/cig/forward.ts` | linked borrower | Application under committee review | `Verification is complete. Your file is now with the Approving Committee.` |
| Committee approves — `src/lib/committee/actions.ts` | linked borrower | Application approved | `The committee approved your loan application. Next steps will follow for disclosure and release.` |
| Committee denies — `src/lib/committee/actions.ts` | linked borrower | Application decision | `A decision was recorded on your loan application. Please check your email for the written notice.` |
| Borrower uploads proof — `src/app/api/borrower/applications/[id]/loan/route.ts` | remedial owner, else collector | Payment proof awaiting verification | `A borrower submitted a payment proof that requires review.` |
| Current owner confirms proof — `src/app/api/collector/payments/[id]/route.ts` | linked borrower | Payment proof confirmed | `Your submitted payment proof was confirmed and is awaiting posting to your loan account.` |
| Current owner rejects proof — `src/app/api/collector/payments/[id]/route.ts` | linked borrower | Payment proof needs attention | `Your submitted payment proof could not be verified. Please contact Loan Star for guidance.` |
| CSA converts lead — `src/app/api/csa/leads/[id]/convert/route.ts` | originating agent | Lead converted to application | `Your lead for <borrower> was converted to an application.` |
| AR assigns collector — `src/lib/ar/masterlist.ts` | newly assigned collector | New account assigned to you | `<loan account> was assigned to you for collection.` |
| AR turns account over — `src/lib/ar/masterlist.ts` | remedial officer | Account turned over to you | `<loan account> was turned over to you for remedial handling.` |
| AR turns account over — `src/lib/ar/masterlist.ts` | former collector | Account turned over to remedial | `<loan account> was turned over to a remedial officer and is no longer on your desk.` |
| Collector submits DCRR — `src/app/api/collector/dcr/route.ts` | active AR users | DCRR submitted for reconciliation | `A collection report was submitted and is waiting for AR reconciliation.` |
| AR reconciles DCRR — `src/app/api/ar/dcr/[id]/reconcile/route.ts` | DCRR owner | DCRR reconciled | `AR reconciled and posted your DCRR.` |
| AR reconciles DCRR item — `src/app/api/ar/dcr/items/[itemId]/reconcile/route.ts` | DCRR owner | DCRR item reconciled | `AR reconciled and posted an item on your DCRR.` |
| AR rejects DCRR/item — `src/app/api/ar/dcr/[id]/reject/route.ts`, `src/app/api/ar/dcr/items/[itemId]/reject/route.ts` | collector and linked borrower | DCRR rejected / Payment needs re-verification | Collector: `AR rejected your DCRR: <reason>` (or one payment). Borrower: `Your recent payment report was returned for correction. Your account balance will update once it's re-processed — no action needed from you.` |

## Payment-proof authorization finding — not production-ready

The API and download routes select the correct current owner. However, the live `payments_collector_update` RLS policy still permits **any** `collection:edit` user to update any payment other than `confirmed` or `posted`, without an assignment existence check. A user can bypass the application route with direct PostgREST access.

Until that policy makes the collector branch assignment-scoped *and* requires `remedial_user_id IS NULL`, the rule “remedial if set, otherwise collector” is not enforced at the database boundary.

## Required final live proof

Use dedicated staging accounts—not production users—to run these cases and query the resulting `notifications` rows by generated entity ID:

1. Link a walk-in application to a portal borrower: one borrower notification; all related borrower IDs update together.
2. Upload proof with collector only: collector receives one notification.
3. Turn over to remedial then upload proof: remedial receives one; former collector receives none.
4. Review as former collector: route and direct database update both fail; status remains `pending_verification`.
5. Review as remedial: status changes once and linked borrower gets one outcome notification.
6. Repeat with `inApp: false` and with an unclaimed borrower: business action succeeds and no inbox row is created.
