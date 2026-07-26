# Committee Decision Email Notice + Resend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On committee application detail after Approve/Deny, show whether the decision email was already sent and always offer a confirmed Resend that reuses existing SMTP helpers.

**Architecture:** Derive send status from `audit_events` (`committee_approve_email` / `committee_deny_email`) via service-role reads. Extend GET detail with `decisionEmail`. Add POST resend that calls `attemptApplication*Email` with `isResend: true` in audit `afterData`. UI lives in the **Latest committee action** card.

**Tech Stack:** Next.js App Router, Supabase `audit_events`, Meridian `Alert` / `Button` / `ConfirmDialog`, existing `attemptApplicationApprovedEmail` / `attemptApplicationDeniedEmail`, node:test.

**Spec:** `docs/superpowers/specs/2026-07-24-committee-decision-email-resend-design.md`

**Safety freeze (do not break):**
- Initial approve/deny decision flow and status transitions
- `attempt*` never throws / never rolls back decision
- SMTP transport / template editor
- In-app notifications (do not resend)
- Audit SELECT RLS for portal users (status helper must use **service client**)

**DO NOT git commit unless the user explicitly asks.**

---

## File map

| File | Responsibility |
|------|----------------|
| `src/lib/committee/decision-email-status.ts` | Trigger map, derive status from audit rows, fetch status |
| `src/lib/committee/__tests__/decision-email-status.test.mts` | Unit tests for derive / trigger helpers |
| `src/lib/committee/approval-email.ts` | Optional `isResend` on attempt → audit `afterData` |
| `src/lib/committee/denial-email.ts` | Same `isResend` support |
| `src/app/api/committee/applications/[id]/route.ts` | Attach `decisionEmail` on GET |
| `src/app/api/committee/applications/[id]/decision-email/resend/route.ts` | POST resend |
| `src/app/committee/applications/[id]/page.tsx` | Notice + Resend + ConfirmDialog |

---

## Phase 1 — Status helper (pure + fetch)

### Task 1: `decision-email-status` + tests (TDD)

**Files:**
- Create: `loanstar/src/lib/committee/decision-email-status.ts`
- Create: `loanstar/src/lib/committee/__tests__/decision-email-status.test.mts`

- [ ] **Step 1: Write failing tests**

```typescript
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  decisionEmailTriggerForAction,
  deriveDecisionEmailStatus,
  type DecisionEmailAuditRow,
} from "../decision-email-status";

describe("decisionEmailTriggerForAction", () => {
  it("maps approve/deny to audit triggers", () => {
    assert.equal(
      decisionEmailTriggerForAction("approve"),
      "committee_approve_email",
    );
    assert.equal(
      decisionEmailTriggerForAction("deny"),
      "committee_deny_email",
    );
    assert.equal(decisionEmailTriggerForAction("hold"), null);
    assert.equal(decisionEmailTriggerForAction("revisit"), null);
  });
});

describe("deriveDecisionEmailStatus", () => {
  const rows: DecisionEmailAuditRow[] = [
    {
      created_at: "2026-07-24T10:00:00.000Z",
      after_data: {
        trigger: "committee_deny_email",
        emailSent: false,
        reason: "borrower_email_missing",
      },
    },
    {
      created_at: "2026-07-24T11:00:00.000Z",
      after_data: {
        trigger: "committee_deny_email",
        emailSent: true,
      },
    },
  ];

  it("marks sent when any successful attempt exists; uses latest for last*", () => {
    const status = deriveDecisionEmailStatus(rows, "borrower@example.com");
    assert.equal(status.sent, true);
    assert.equal(status.lastAttemptAt, "2026-07-24T11:00:00.000Z");
    assert.equal(status.lastEmailSent, true);
    assert.equal(status.lastFailureReason, null);
    assert.equal(status.borrowerEmail, "borrower@example.com");
  });

  it("returns failure reason from latest failed attempt when never sent", () => {
    const failedOnly: DecisionEmailAuditRow[] = [
      {
        created_at: "2026-07-24T09:00:00.000Z",
        after_data: {
          trigger: "committee_approve_email",
          emailSent: false,
          reason: "channel_pref_blocked",
        },
      },
    ];
    const status = deriveDecisionEmailStatus(failedOnly, null);
    assert.equal(status.sent, false);
    assert.equal(status.lastEmailSent, false);
    assert.equal(status.lastFailureReason, "channel_pref_blocked");
    assert.equal(status.borrowerEmail, null);
  });

  it("handles empty history", () => {
    const status = deriveDecisionEmailStatus([], "a@b.com");
    assert.equal(status.sent, false);
    assert.equal(status.lastAttemptAt, null);
    assert.equal(status.lastEmailSent, null);
    assert.equal(status.lastFailureReason, null);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `cd loanstar && node --import tsx --test src/lib/committee/__tests__/decision-email-status.test.mts`  
Expected: FAIL (module missing).

- [ ] **Step 3: Implement helper**

Create `loanstar/src/lib/committee/decision-email-status.ts`:

```typescript
import { createServiceClient } from "@/lib/supabase/server";

export type DecisionEmailTrigger =
  | "committee_approve_email"
  | "committee_deny_email";

export type DecisionEmailStatus = {
  sent: boolean;
  lastAttemptAt: string | null;
  lastEmailSent: boolean | null;
  lastFailureReason: string | null;
  borrowerEmail: string | null;
};

export type DecisionEmailAuditRow = {
  created_at: string;
  after_data: {
    trigger?: string;
    emailSent?: boolean;
    reason?: string;
    [key: string]: unknown;
  } | null;
};

export function decisionEmailTriggerForAction(
  action: string,
): DecisionEmailTrigger | null {
  if (action === "approve") return "committee_approve_email";
  if (action === "deny") return "committee_deny_email";
  return null;
}

/** Rows must already be filtered to one trigger and ordered newest-first. */
export function deriveDecisionEmailStatus(
  rowsNewestFirst: DecisionEmailAuditRow[],
  borrowerEmail: string | null | undefined,
): DecisionEmailStatus {
  const email = borrowerEmail?.trim() || null;
  if (rowsNewestFirst.length === 0) {
    return {
      sent: false,
      lastAttemptAt: null,
      lastEmailSent: null,
      lastFailureReason: null,
      borrowerEmail: email,
    };
  }

  const latest = rowsNewestFirst[0];
  const latestSent = Boolean(latest.after_data?.emailSent);
  const sent = rowsNewestFirst.some((r) => Boolean(r.after_data?.emailSent));
  const lastFailureReason =
    !latestSent && typeof latest.after_data?.reason === "string"
      ? latest.after_data.reason
      : null;

  return {
    sent,
    lastAttemptAt: latest.created_at,
    lastEmailSent: latestSent,
    lastFailureReason,
    borrowerEmail: email,
  };
}

export async function getCommitteeDecisionEmailStatus(opts: {
  applicationId: string;
  action: string;
  borrowerEmail: string | null | undefined;
}): Promise<DecisionEmailStatus | null> {
  const trigger = decisionEmailTriggerForAction(opts.action);
  if (!trigger) return null;

  const admin = createServiceClient();
  const { data, error } = await admin
    .from("audit_events")
    .select("created_at, after_data")
    .eq("module_slug", "committee")
    .eq("action", "execute_trigger")
    .eq("entity_type", "loan_application")
    .eq("entity_id", opts.applicationId)
    .eq("after_data->>trigger", trigger)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    throw new Error(`Failed to load decision email status: ${error.message}`);
  }

  return deriveDecisionEmailStatus(
    (data ?? []) as DecisionEmailAuditRow[],
    opts.borrowerEmail,
  );
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `cd loanstar && node --import tsx --test src/lib/committee/__tests__/decision-email-status.test.mts`  
Expected: all PASS.

---

## Phase 2 — `isResend` on attempt helpers

### Task 2: Thread `isResend` into approval + denial audit

**Files:**
- Modify: `loanstar/src/lib/committee/approval-email.ts`
- Modify: `loanstar/src/lib/committee/denial-email.ts`

- [ ] **Step 1: Extend approval helper**

Add optional `isResend?: boolean` to `attemptApplicationApprovedEmail` opts. On every `writeAuditEvent` `afterData` object, include:

```typescript
...(opts.isResend ? { isResend: true } : {}),
```

Do not change return type or throw behavior. Initial action route continues calling without `isResend`.

- [ ] **Step 2: Extend denial helper**

Same optional `isResend?: boolean` + spread into every `afterData` in `attemptApplicationDeniedEmail`.

- [ ] **Step 3: Sanity**

Run: `cd loanstar && node --import tsx --test src/lib/committee/__tests__/approval-email.test.mts src/lib/committee/__tests__/denial-email.test.mts`  
Expected: PASS (build helpers unchanged).

---

## Phase 3 — GET detail attaches `decisionEmail`

### Task 3: Wire status into committee detail API

**Files:**
- Modify: `loanstar/src/app/api/committee/applications/[id]/route.ts`

- [ ] **Step 1: Import + compute**

After `latestAction` is loaded and `borrower` is known:

```typescript
import { getCommitteeDecisionEmailStatus } from "@/lib/committee/decision-email-status";

const decisionEmail =
  latestAction != null
    ? await getCommitteeDecisionEmailStatus({
        applicationId: id,
        action: latestAction.action,
        borrowerEmail: (borrower?.email as string | null) ?? null,
      })
    : null;
```

- [ ] **Step 2: Include in `jsonOk` payload**

Add top-level field next to `latestAction`:

```typescript
decisionEmail,
```

When action is hold/revisit, helper returns `null` — correct.

- [ ] **Step 3: Manual check**

Open a denied/approved application detail in Network tab: response includes `decisionEmail` with `sent` / `borrowerEmail`. For `for_approval` with no final action, `decisionEmail` is `null`.

---

## Phase 4 — Resend API

### Task 4: POST `decision-email/resend`

**Files:**
- Create: `loanstar/src/app/api/committee/applications/[id]/decision-email/resend/route.ts`

- [ ] **Step 1: Implement route**

```typescript
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { getLatestCommitteeAction } from "@/lib/committee/actions";
import { attemptApplicationApprovedEmail } from "@/lib/committee/approval-email";
import { attemptApplicationDeniedEmail } from "@/lib/committee/denial-email";
import { getApplicationForStaff } from "@/lib/csa/application";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission("committee", "execute_trigger");
    const { id } = await params;
    const supabase = await createClient();

    const application = await getApplicationForStaff(supabase, id);
    const latestAction = await getLatestCommitteeAction(supabase, id);

    if (
      !latestAction ||
      (latestAction.action !== "approve" && latestAction.action !== "deny")
    ) {
      return Response.json(
        { error: "Resend is only available after Approve or Deny." },
        { status: 400 },
      );
    }

    if (
      application.status !== "approved" &&
      application.status !== "denied"
    ) {
      return Response.json(
        { error: "Application is not in an approved or denied state." },
        { status: 400 },
      );
    }

    const borrowerRaw = application.borrowers;
    const borrower = Array.isArray(borrowerRaw)
      ? borrowerRaw[0]
      : borrowerRaw;
    const borrowerPayload = borrower
      ? {
          email: borrower.email as string | null,
          first_name: borrower.first_name as string | null,
          last_name: borrower.last_name as string | null,
          user_id: borrower.user_id as string | null,
        }
      : null;

    const result =
      latestAction.action === "approve"
        ? await attemptApplicationApprovedEmail({
            actorId: user.id,
            applicationId: id,
            supabase,
            borrower: borrowerPayload,
            isResend: true,
          })
        : await attemptApplicationDeniedEmail({
            actorId: user.id,
            applicationId: id,
            supabase,
            borrower: borrowerPayload,
            isResend: true,
          });

    return jsonOk({
      emailSent: result.emailSent,
      reason: result.emailSent
        ? undefined
        : !borrowerPayload?.email?.trim()
          ? "borrower_email_missing"
          : undefined,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
```

Note: if `attempt*` later returns `reason`, prefer that; otherwise the UI reloads status from GET. Keeping this response minimal is fine.

- [ ] **Step 2: Smoke**

With SMTP on, POST resend on a denied app → `emailSent: true` (or false with reason). Confirm new audit row has `isResend: true`. Do **not** change application status.

---

## Phase 5 — Committee detail UI

### Task 5: Notice + Resend + ConfirmDialog

**Files:**
- Modify: `loanstar/src/app/committee/applications/[id]/page.tsx`

- [ ] **Step 1: Extend `CommitteeDetail` type**

```typescript
  decisionEmail: {
    sent: boolean;
    lastAttemptAt: string | null;
    lastEmailSent: boolean | null;
    lastFailureReason: string | null;
    borrowerEmail: string | null;
  } | null;
```

- [ ] **Step 2: State for resend confirm**

Near other confirm state:

```typescript
const [resendOpen, setResendOpen] = useState(false);
const [resending, setResending] = useState(false);
```

- [ ] **Step 3: Handler**

```typescript
async function handleResendDecisionEmail() {
  if (!applicationId) return;
  setResending(true);
  setError(null);
  try {
    const res = await fetch(
      `/api/committee/applications/${applicationId}/decision-email/resend`,
      { method: "POST" },
    );
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(body.error ?? "Failed to resend decision email");
    }
    setMessage(
      body.emailSent
        ? "Decision email resent."
        : "Resend attempted but email was not sent. Check borrower email and SMTP.",
    );
    setResendOpen(false);
    await load({ silent: true });
  } catch (err) {
    setError(err instanceof Error ? err.message : "Resend failed");
  } finally {
    setResending(false);
  }
}
```

Adapt to this page’s existing `load` / `setMessage` / `setError` names (read the file; do not invent parallel toast systems).

- [ ] **Step 4: UI inside Latest committee action card**

After the action summary / comment, when `data.decisionEmail` is non-null:

```tsx
{data.decisionEmail ? (
  <div className="mt-4 space-y-3">
    {data.decisionEmail.sent ? (
      <Alert variant="info">
        Decision email already sent
        {data.decisionEmail.borrowerEmail
          ? ` to ${data.decisionEmail.borrowerEmail}`
          : ""}
        {data.decisionEmail.lastAttemptAt
          ? ` (last attempt ${new Date(data.decisionEmail.lastAttemptAt).toLocaleString()})`
          : ""}
        .
      </Alert>
    ) : (
      <Alert variant="warning">
        Decision email has not been sent successfully
        {data.decisionEmail.borrowerEmail
          ? ` to ${data.decisionEmail.borrowerEmail}`
          : " (borrower has no email on file)"}
        {data.decisionEmail.lastFailureReason
          ? ` — ${data.decisionEmail.lastFailureReason}`
          : ""}
        .
      </Alert>
    )}
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={() => setResendOpen(true)}
      disabled={resending}
    >
      Resend email
    </Button>
    <ConfirmDialog
      open={resendOpen}
      onOpenChange={setResendOpen}
      title="Resend decision email?"
      description={`Send the decision email again to ${
        data.decisionEmail.borrowerEmail ?? "the borrower"
      }?`}
      confirmLabel={resending ? "Sending…" : "Resend"}
      onConfirm={() => void handleResendDecisionEmail()}
      confirmDisabled={resending}
    />
  </div>
) : null}
```

**Important:** Match this page’s actual `ConfirmDialog` prop names (`open` vs `isOpen`, etc.) by copying the existing Final Action `ConfirmDialog` block on the same page — do not invent a different API.

If `Alert` has no `variant="info"`, use the same default/info pattern already used on this page (e.g. plain `<Alert>` for info, `variant="danger"` / success as elsewhere).

- [ ] **Step 5: Manual UI test**

1. Open denied application → warning or info + Resend visible.  
2. Confirm dialog shows borrower email.  
3. Cancel → no POST.  
4. Confirm → toast + status updates; SMTP inbox gets another message when configured.

---

## Phase 6 — Verification

### Task 6: Full test run + checklist

**Files:** none (verify only)

- [ ] **Step 1: Unit tests**

Run: `cd loanstar && npm test`  
Expected: all pass (including new decision-email-status tests).

- [ ] **Step 2: Spec checklist**

| Spec rule | Done? |
|-----------|-------|
| Notice when already sent | |
| Warning when not sent / failed | |
| Resend always for approve/deny | |
| Confirm dialog with email | |
| No status / notification change on resend | |
| `isResend: true` on audit | |
| Hold/revisit: no UI | |
| Service client for audit read | |

- [ ] **Step 3: Report**

List files changed. No commit unless user asks.

---

## Self-review (plan vs spec)

| Spec item | Task |
|-----------|------|
| Audit-derived status | Task 1 |
| GET `decisionEmail` | Task 3 |
| POST resend + `isResend` | Tasks 2, 4 |
| UI notice + always Resend + confirm | Task 5 |
| No new tables / no in-app resend | Out of scope preserved |
| Tests | Tasks 1, 6 |

No TBD placeholders. Types (`DecisionEmailStatus`, `isResend`) consistent across tasks.
