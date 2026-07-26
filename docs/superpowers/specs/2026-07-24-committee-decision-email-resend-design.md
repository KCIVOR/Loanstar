# Committee Decision Email Notice + Resend — Design

**Date:** 2026-07-24  
**Status:** Approved for planning  
**Depends on:** Committee decision email templates + SMTP (`attemptApplicationApprovedEmail` / `attemptApplicationDeniedEmail`, audit triggers)

## Goal

On the committee application detail page, after a final **Approve** or **Deny**, staff can see whether the decision email was already sent and can **resend** it (with confirmation).

## Product rules

- Apply only when latest committee action is `approve` or `deny` (status `approved` / `denied`).
- Always show a **Resend** control in that state (whether last send succeeded or failed).
- Show an informational notice when at least one successful send exists; show a warning when the latest attempt failed or never succeeded.
- Resend requires a confirm dialog naming the borrower email.
- Resend does not change application status, votes, or in-app notifications.
- Hold / revisit: out of scope (no decision email).

## Status source (no new tables)

Email attempts are already audited on `audit_events`:

| Field | Value |
|-------|--------|
| `module_slug` | `committee` |
| `action` | `execute_trigger` |
| `entity_type` | `loan_application` |
| `entity_id` | application UUID |
| `after_data.trigger` | `committee_approve_email` or `committee_deny_email` |
| `after_data.emailSent` | boolean |
| `after_data.reason` | optional (`borrower_email_missing`, channel prefs, etc.) |

Resend writes the same shape and adds `after_data.isResend: true`.

Derive status with a service-role query (committee roles cannot SELECT `audit_events` under RLS):

- `sent` — true if any matching row has `emailSent: true`
- `lastAttemptAt` — `created_at` of the latest matching row (or null)
- `lastEmailSent` — `emailSent` of the latest matching row
- `lastFailureReason` — `reason` from latest row when `emailSent` is false
- `borrowerEmail` — from application borrower (for UI copy)

Trigger must match decision: approve → `committee_approve_email`; deny → `committee_deny_email`.

## API

### Extend GET `/api/committee/applications/[id]`

When `latestAction.action` is `approve` or `deny`, include:

```ts
decisionEmail: {
  sent: boolean;
  lastAttemptAt: string | null;
  lastEmailSent: boolean | null;
  lastFailureReason: string | null;
  borrowerEmail: string | null;
} | null
```

Otherwise `decisionEmail: null`.

### POST `/api/committee/applications/[id]/decision-email/resend`

- Auth: `requireModulePermission("committee", "execute_trigger")`
- Guard: application status `approved` or `denied`; latest action matches approve/deny
- Load borrower; call existing `attemptApplicationApprovedEmail` or `attemptApplicationDeniedEmail`
- Prefer extending those helpers (or a thin wrapper) so audit `afterData` includes `isResend: true` on this path
- Response: `{ emailSent: boolean, reason?: string }`
- Failure to send returns 200 with `emailSent: false` (same best-effort contract as initial send) — do not roll back anything

## UI

**File:** `src/app/committee/applications/[id]/page.tsx`  
**Placement:** inside **Latest committee action** card (post-decision).

| Condition | UI |
|-----------|-----|
| `decisionEmail.sent` | Info `Alert`: decision email already sent to `{borrowerEmail}` (include last successful / last attempt time when available) |
| `!decisionEmail.sent` | Warning `Alert`: not sent yet / last attempt failed; show `lastFailureReason` when present; note missing email if `borrowerEmail` empty |
| Always (approve/deny) | Secondary **Resend email** `Button` → `ConfirmDialog` (“Send the decision email again to {email}?”) → POST resend → toast → silent reload |

Use existing Meridian `Alert`, `Button`, `ConfirmDialog`, toast patterns on this page.

## Out of scope

- New DB tables or columns
- Editing templates / SMTP from this card
- Resending in-app notifications
- CIG denial queue resend
- Hold / revisit

## Testing

- Approved app with prior successful audit → info notice + resend confirm sends again and audit gains `isResend: true`
- Denied app with failed/missing email audit → warning + resend still offered
- Non–approve/deny latest action → no `decisionEmail` UI
- Resend without `execute_trigger` → 403
