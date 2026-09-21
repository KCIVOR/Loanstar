# Surgical Workflow Notifications and Borrower-Link Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Notify the correctly assigned existing user for borrower-account linking and payment-proof events, prevent unauthorized proof review, and make borrower linking atomic.

**Architecture:** Preserve the notifications inbox, preferences, queues, loan statuses, payment statuses, and walk-in borrower workflow. Add only targeted recipient resolution using existing assignment fields and one service-role RPC for the existing multi-table borrower re-link.

**Tech Stack:** Next.js 16, TypeScript, Supabase/Postgres RPC and RLS, Node test runner with `tsx`.

---

## Live database validation — 2026-09-22

Validated read-only against Supabase project `acopcwlhkovssjnrqygk`.

- `borrowers.user_id` is nullable. There are **80 unclaimed borrowers**; this is an intentional, active walk-in/staff-only state, not an error condition.
- `loan_applications.borrower_id`, `masterlist.borrower_id`, and `payments.borrower_id` are non-null. The live integrity check found **zero** application, masterlist, or payment records without a matching borrower.
- `assignments` contains nullable `collector_user_id` and `remedial_user_id`; 20 current assignments have neither. Therefore the no-assignment upload path must remain successful and silent—never broadcast.
- `loan_applications.status_history` is non-null JSONB. Existing entries use exactly `status`, `note`, `at`, and usually `actorId`; the RPC must preserve that camel-case shape.
- `notifications` requires a non-null `user_id`, and the live check found no notification whose user has no profile. Notifications must continue to resolve a concrete user ID before write.
- The live schema did not report foreign-key constraints for the linked borrower columns. Treat the application/masterlist/documents/payments re-link as application-enforced consistency; this strengthens (rather than removes) the need for a single transactional RPC and rollback test.

This validation changes no database data or schema.

---

## Scope and constraints

### In scope

1. CSA connects application to a portal borrower → notify that borrower.
2. Portal borrower submits payment proof → notify only the account's current owner: the assigned remedial officer if one is set (the account has been handed over), otherwise the assigned collector.
3. Assigned reviewer confirms/rejects proof → notify linked borrower.
4. A payment reviewer must be the account's current owner (remedial if set, else collector), except super-admin. Remedial officers can review and download proofs for their own accounts (decision: Option A, 2026-09-22 validation).
5. Re-linking application, masterlist, documents, and payments must be all-or-nothing.

### Out of scope — do not change

- CSA→CIG, CIG→Committee, Committee→LRA, release, AR, document, SMS, or email notifications.
- Loan state transitions, queue membership, payment status names, RLS ownership model, or notification preferences.
- Existing walk-in behavior: a borrower with `user_id = null` has no portal inbox and must not receive an invented notification.
- Global role broadcasts. Never query all CIG, collectors, staff, or users with a role.

### Non-negotiable safety constraints

- Notification writes are best-effort (`await notify…`, which never throws) and never undo a completed link, upload, or review.
- The working tree has unrelated uncommitted changes (`reloan/route.ts`, `borrower/page.tsx`, deleted `borrower/profile/page.tsx`). Commit only the explicit paths listed per task; never `git add -A`.
- Keep the existing `.eq("status", "pending_verification")` guard on the review update.
- Keep unlinked borrowers functional in staff-only workflows.
- Do not delete the original walk-in borrower row or merge profile data into the target account.
- Do not add a database table, trigger, or status column. The only permitted policy change is the additive remedial branch on `payments_collector_update` (`20260922100000_payments_remedial_review_update.sql`), assignment-scoped, with existing branches copied verbatim.
- Use a new forward-only migration; never edit an applied migration.

### Recipient contract

| Event | Exact recipient | If no recipient |
|---|---|---|
| CSA account connection | target borrower’s existing `user_id` | Connection is rejected before mutation if target has no account |
| Borrower proof submitted | `assignments.remedial_user_id` if set, else `collector_user_id` (matches existing convention: collector routes filter `remedial_user_id IS NULL`) | Upload succeeds; no broadcast |
| Proof confirmed/rejected | application borrower’s `user_id` | Review succeeds; existing `borrower_unclaimed` skip applies |

## Files

| File | Responsibility |
|---|---|
| `supabase/migrations/<new>_connect_application_borrower_account.sql` | Atomic security-definer RPC |
| `src/lib/csa/connect-borrower.ts` | RPC caller; exposes target portal user ID internally |
| `src/lib/notifications/workflow-recipients.ts` | Pure recipient/authorization predicates plus small assignment loaders |
| `src/lib/notifications/__tests__/workflow-recipients.test.mts` | Recipient and authorization unit tests |
| `src/lib/csa/__tests__/connect-borrower-contract.test.mts` | RPC/route source contract tests |
| `src/app/api/csa/applications/[id]/connect-borrower/route.ts` | Borrower notification after success |
| `src/app/api/borrower/applications/[id]/loan/route.ts` | Assigned-staff notification after proof insert |
| `src/app/api/collector/payments/[id]/route.ts` | Assignment authorization (collector or remedial permission) and borrower outcome notification |
| `src/app/api/collector/payments/[id]/download/route.ts` | Allow the current owner (remedial if set, else collector) to open the proof; same not-found error otherwise |
| `src/lib/collector/__tests__/payment-review-authorization.test.mts` | Review authorization contract tests |

## Phase 0 — Baseline tests

### Task 1: Define the policy as failing pure tests

**Files:**
- Create: `src/lib/notifications/__tests__/workflow-recipients.test.mts`
- Create: `src/lib/collector/__tests__/payment-review-authorization.test.mts`

- [ ] Write failing tests for these exact cases:

    import assert from "node:assert/strict";
    import test from "node:test";
    // Use a relative import (repo convention for .mts tests), not "@/".
    import {
      chooseProofReviewRecipient,
      canReviewAssignedPayment,
    } from "../workflow-recipients"; // adjust relative path per test file location

    test("prefers remedial over collector (account handed over)", () => {
      assert.equal(
        chooseProofReviewRecipient({ collectorUserId: "collector-1", remedialUserId: "remedial-1" }),
        "remedial-1",
      );
    });
    test("uses collector when no remedial is set", () => {
      assert.equal(
        chooseProofReviewRecipient({ collectorUserId: "collector-1", remedialUserId: null }),
        "collector-1",
      );
    });
    test("collector loses review rights once remedial is set", () => {
      assert.equal(
        canReviewAssignedPayment("collector-1", { collectorUserId: "collector-1", remedialUserId: "remedial-1" }, false),
        false,
      );
    });
    test("remedial owner can review", () => {
      assert.equal(
        canReviewAssignedPayment("remedial-1", { collectorUserId: "collector-1", remedialUserId: "remedial-1" }, false),
        true,
      );
    });
    test("does not broadcast without an assignment", () => {
      assert.equal(chooseProofReviewRecipient({ collectorUserId: null, remedialUserId: null }), null);
    });
    test("rejects an unassigned reviewer", () => {
      assert.equal(
        canReviewAssignedPayment("collector-2", { collectorUserId: "collector-1", remedialUserId: null }, false),
        false,
      );
    });
    test("allows super-admin", () => {
      assert.equal(
        canReviewAssignedPayment("admin-1", { collectorUserId: null, remedialUserId: null }, true),
        true,
      );
    });

- [ ] Run: `npm test -- src/lib/notifications/__tests__/workflow-recipients.test.mts src/lib/collector/__tests__/payment-review-authorization.test.mts`
  Expected: FAIL because the module does not exist.

- [ ] Inspect migrations before naming the new one:

    Get-ChildItem supabase/migrations/*.sql | Sort-Object Name | Select-Object -Last 10

  Use a timestamp later than the newest migration; the sample name below is illustrative only.

- [ ] Commit:

    git add src/lib/notifications/__tests__/workflow-recipients.test.mts src/lib/collector/__tests__/payment-review-authorization.test.mts
    git commit -m "test: define workflow notification recipient contracts"

## Phase 1 — Shared minimal helpers

### Task 2: Implement no-broadcast recipient resolution

**Files:**
- Create: `src/lib/notifications/workflow-recipients.ts`
- Test: both Phase 0 test files

- [ ] Implement these pure functions exactly:

    export type ProofReviewAssignment = {
      collectorUserId: string | null;
      remedialUserId: string | null;
    };

    // Current owner: remedial if set (account handed over), else collector.
    export function chooseProofReviewRecipient(
      assignment: ProofReviewAssignment,
    ): string | null {
      return assignment.remedialUserId ?? assignment.collectorUserId;
    }

    export function canReviewAssignedPayment(
      userId: string,
      assignment: ProofReviewAssignment,
      isSuperAdmin: boolean,
    ): boolean {
      return isSuperAdmin || chooseProofReviewRecipient(assignment) === userId;
    }

  Keep this file's runtime imports empty (`import type` only for the Supabase client) so unit tests never load server-only code.

- [ ] Add `getProofReviewRecipient(supabase, masterlistId)`. It selects only `collector_user_id, remedial_user_id` from the assignment for that one masterlist, returns `chooseProofReviewRecipient(...)`, and returns `null` for no row or query error.

- [ ] Add `getPaymentReviewContext(supabase, paymentId)`. It loads the payment’s `loan_application_id, masterlist_id`, then that masterlist’s assignment, and returns `{ applicationId, assignment }` or `null`. It must not enumerate roles.

- [ ] Run focused tests; expected PASS.

- [ ] Commit:

    git add src/lib/notifications/workflow-recipients.ts src/lib/notifications/__tests__/workflow-recipients.test.mts src/lib/collector/__tests__/payment-review-authorization.test.mts
    git commit -m "feat: add scoped payment proof recipient resolution"

## Phase 2 — Atomic CSA borrower connection

### Task 3: Replace sequential re-link writes with an RPC

**Files:**
- Create: `supabase/migrations/<timestamp>_connect_application_borrower_account.sql`
- Modify: `src/lib/csa/connect-borrower.ts`
- Create: `src/lib/csa/__tests__/connect-borrower-contract.test.mts`

- [ ] Write a failing contract test. It must assert that `connect-borrower.ts` calls `rpc("connect_application_to_borrower_account"`) and no longer contains direct `masterlist`, `documents`, or `payments` update calls.

- [ ] Create a `security definer`, `set search_path = public` RPC with input parameters `p_application_id uuid`, `p_target_borrower_id uuid`, and `p_actor_id uuid`. Inside one function transaction:

  1. Lock (`for update`) and load the application and its current borrower; fail when absent.
  2. Lock and load target borrower; fail when absent or `user_id` is null.
  3. Fail if the current (source) borrower already has a `user_id` (already connected), and fail if target equals current borrower. These guards live **inside** the RPC under the lock — not in TypeScript — to avoid a read-then-write race.
  4. Update only rows scoped by `loan_application_id = p_application_id`: `loan_applications.borrower_id`, `masterlist.borrower_id/borrower_no/borrower_name`, `documents.borrower_id`, and `payments.borrower_id`.
  5. Append the existing status-history shape exactly as `{ status, note, at, actorId }`, retaining the unchanged current status and note `CSA connected application to an existing borrower account`.
  6. Return `borrower_id` and `borrower_user_id`.

- [ ] Revoke public execute and grant execute only to `service_role`.

- [ ] In `connectApplicationToBorrowerAccount`, remove the TypeScript pre-checks and target lookup (the RPC now owns them) and map RPC errors to the existing user-facing messages. Replace all sequential updates and `appendStatusHistory` with one service-client RPC call. Return:

    { borrowerId: row.borrower_id as string, borrowerUserId: row.borrower_user_id as string }

- [ ] Run the focused contract test; expected PASS.

- [ ] Apply only in non-production first. Induce an RPC failure using an invalid target and verify every affected borrower ID remains unchanged. This proves transaction rollback.

- [ ] Commit:

    git add supabase/migrations/<timestamp>_connect_application_borrower_account.sql src/lib/csa/connect-borrower.ts src/lib/csa/__tests__/connect-borrower-contract.test.mts
    git commit -m "fix: make borrower account connection atomic"

### Task 4: Notify borrower only after successful linking

**Files:**
- Modify: `src/app/api/csa/applications/[id]/connect-borrower/route.ts`
- Test: `src/lib/csa/__tests__/connect-borrower-contract.test.mts`

- [ ] Add a failing route-source assertion for `notifyUser`, `userId: result.borrowerUserId`, and kind `application_account_connected`.

- [ ] After the RPC and audit event, add this non-blocking write:

    await notifyUser({
      userId: result.borrowerUserId,
      title: "Loan application linked to your account",
      body: "A Loan Star application has been linked to your borrower account. You can now review it in your portal.",
      link: "/borrower",
      kind: "application_account_connected",
      entityType: "loan_application",
      entityId: id,
    });

- [ ] Do not return `borrowerUserId` from the HTTP response.

- [ ] Manual non-production checks:
  1. Enabled inbox: exactly one target-borrower notification.
  2. `inApp: false`: connection succeeds, zero new notification rows.
  3. Original walk-in borrower row remains intact.

- [ ] Commit:

    git add src/app/api/csa/applications/[id]/connect-borrower/route.ts src/lib/csa/__tests__/connect-borrower-contract.test.mts
    git commit -m "feat: notify borrower when loan account is linked"

## Phase 3 — Payment-proof notifications and authorization

### Task 5: Notify exactly one assigned reviewer after borrower upload

**Files:**
- Modify: `src/app/api/borrower/applications/[id]/loan/route.ts`
- Test: `src/lib/notifications/__tests__/workflow-recipients.test.mts`

- [ ] After successful proof/payment insert and audit write, call `getProofReviewRecipient(supabase, ctxData.masterlistId)`.

- [ ] Only when it returns an ID, add (use `await`, matching the AR reject routes; `notifyUser` never throws, and an unawaited promise can be dropped on serverless. Apply the same `await` in Tasks 4 and 6):

    await notifyUser({
      userId: reviewerUserId,
      title: "Payment proof awaiting verification",
      body: "A borrower submitted a payment proof that requires review.",
      link: "/collector/proofs",
      kind: "payment_proof_submitted",
      entityType: "payment",
      entityId: data.id as string,
    });

- [ ] Add a source contract test that confirms this route uses `getProofReviewRecipient` and does not query `user_roles`.

- [ ] Verify a remedial-only user can open `/collector/proofs` (the page fetches `scope=desk`, which already filters by `remedial_user_id` for non-collectors). If the collector layout blocks them, use an existing remedial page as the link for the remedial recipient instead of adding a new page.

- [ ] Verify unassigned account behavior: insert succeeds with no staff notification.

- [ ] Commit:

    git add src/app/api/borrower/applications/[id]/loan/route.ts src/lib/notifications/__tests__/workflow-recipients.test.mts
    git commit -m "feat: notify assigned staff of payment proofs"

### Task 6: Block unassigned reviewers and notify outcome

**Files:**
- Modify: `src/app/api/collector/payments/[id]/route.ts`
- Test: `src/lib/collector/__tests__/payment-review-authorization.test.mts`

- [ ] Replace `requireModulePermission("collection", "edit")` with `requireAuth()` plus `hasModulePermission("collection", "edit")` and `hasModulePermission("remedial", "edit")` (a remedial-only user would otherwise get 403 before the assignment check). Also load the existing super-admin check and `getPaymentReviewContext`.

- [ ] Return forbidden unless the user has one of those edit permissions and `canReviewAssignedPayment(user.id, context.assignment, isSuperAdmin)` is true. An unassigned reviewer and a nonexistent payment must return the same not-found/forbidden error (no payment-ID enumeration). Reuse existing permission helpers; do not add another role implementation.

- [ ] In `payments/[id]/download/route.ts`, replace the `collector_user_id = user.id` match with the same owner rule (`canReviewAssignedPayment`), requiring `collection:view` or `remedial:view`. Keep the existing not-found error for non-owners.

- [ ] Preserve the current update predicates `.eq("id", id)` and `.eq("status", "pending_verification")`.

- [ ] After a successful update only, write:

    await notifyBorrowerForApplication(context.applicationId, {
      title: body.status === "confirmed" ? "Payment proof confirmed" : "Payment proof needs attention",
      body: body.status === "confirmed"
        ? "Your submitted payment proof was confirmed and is awaiting posting to your loan account."
        : "Your submitted payment proof could not be verified. Please contact Loan Star for guidance.",
      link: `/borrower/applications/${context.applicationId}`,
      kind: body.status === "confirmed" ? "payment_proof_confirmed" : "payment_proof_rejected",
      entityType: "payment",
      entityId: id,
    });

- [ ] Do not expose reviewer identity, internal rejection reasons, balances, or accounting status in inbox copy.

- [ ] Add route-source contracts for assignment check, pending-only guard, and borrower notification.

- [ ] Manual non-production checks:
  1. Collector A assigned (no remedial): receives upload notice and can review and download.
  2. Collector B unassigned: gets 403; payment stays pending.
  2b. Account handed to remedial officer R: R gets the notice and can review/download; former collector A gets no notice and gets 403.
  3. Assigned reviewer confirms/rejects: linked borrower gets one correct inbox item.
  4. Inbox disabled and walk-in borrower: business action succeeds without inbox error.

- [ ] Commit:

    git add src/app/api/collector/payments/[id]/route.ts src/lib/collector/__tests__/payment-review-authorization.test.mts
    git commit -m "fix: scope payment proof review and notify borrowers"

## Phase 4 — Regression verification and rollout

### Task 7: Verify surgical scope

- [ ] Run focused tests:

    npm test -- src/lib/notifications/__tests__/workflow-recipients.test.mts src/lib/collector/__tests__/payment-review-authorization.test.mts src/lib/csa/__tests__/connect-borrower-contract.test.mts

  Expected: PASS.

- [ ] Run full tests: `npm test`. Expected: PASS.

- [ ] Run lint: `npm run lint`. Expected: PASS.

- [ ] Run build: `npm run build`. Expected: PASS. Before changing any Next.js behavior to address a warning, read the relevant guide in `node_modules/next/dist/docs/`.

- [ ] Complete this smoke matrix:

| Case | Expected result |
|---|---|
| Walk-in loan remains unlinked | Staff workflow works; no portal/inbox expectation |
| CSA link succeeds | Application, documents, payments, and masterlist point to target; one borrower inbox row |
| RPC fails | No borrower IDs change anywhere |
| Linked borrower proof upload | Pending payment; one assigned reviewer notice |
| No assignment | Pending payment; no broadcast; no error |
| Wrong collector review | 403; status remains pending |
| Assigned review | Status changes once; borrower notice if linked |
| Disabled inbox / unlinked borrower | Business transition succeeds |

- [ ] Before production migration, inspect that it creates only one function, grants it only to `service_role`, and changes no existing table/policy/index/status.

## Rollback

1. If notification copy or selection is wrong, revert only its route-level commit; business transitions remain intact.
2. If the RPC has a defect after deployment, ship a forward migration correcting the function; never edit the deployed migration.
3. Do not delete notification rows during rollback.
4. If a legitimate reviewer is blocked, correct the account assignment first. Do not restore global Collection-role access as a workaround.

## Self-review

This plan covers all audited gaps requested: account-connection notification, proof submission notification, proof outcome notification, unlinked borrower safety, connection atomicity, and review authorization. The live database validation confirms the unclaimed-borrower and unassigned-account paths are real production cases. It deliberately excludes broader staff workflow notification fan-out so the change remains surgical.
