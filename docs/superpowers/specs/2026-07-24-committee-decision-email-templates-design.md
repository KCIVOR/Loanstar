# Committee Decision Email Templates — Design

**Date:** 2026-07-24  
**Status:** Validated against live DB + codebase (ready for implementation)

## Goal

Superadmin can edit polite email templates for committee **Accept** and **Reject**. On final committee action, the system sends that template via existing SMTP (`sendEmail`). Deny never discloses reasons. Approve keeps today’s in-app notification **and** adds email.

## Workflow rules (product)

- Only Committee final action denies/approves (not CIG).
- Denial email: no specific reason — prevent “gaming” on reapply.
- Tone: polite, professional (credit-card denial style).
- Accept: SMTP email + existing in-app notice.

## Live DB baseline (verified via Supabase MCP, 2026-07-24)

| Item | Status |
|------|--------|
| `application_denied` template | **Present** — subject `LoanStar — Application Update`; body uses `{{borrower_name}}` only (no reason) |
| `application_approved` template | **Missing** — must be seeded in Phase 1 and **applied** to remote |
| Other templates | `test`, `payment_due_reminder`, `borrower_email_confirm` exist — **out of scope** for this editor |
| SMTP (`email_enabled`) | **Enabled** on this project; host/user/from configured |
| Migration `smtp_config_settings` | Applied |

## Current code (verified)

| Path | Today |
|------|--------|
| Deny | `attemptApplicationDeniedEmail` → slug `application_denied` → SMTP; failure does not roll back decision |
| Approve | In-app `notifyBorrowerForApplication` only — **no** email |
| Templates table | `email_templates` (slug UNIQUE); RLS `system_config`; **no** Superadmin editor UI |
| Transport | Nodemailer SMTP from `/admin/config` |

## Design decisions (locked)

1. **Slugs (fixed):** `application_denied`, `application_approved` — not free-form create.
2. **Allowed merge vars (v1):** `{{borrower_name}}` **only**. No `application_no` in v1.
3. **Forbidden merge vars (blocked on save):** `reason`, `denial_reason`, `comment`, `committee_comment`, `finding`, `finding_notes`, `notes`.
4. **UI:** Meridian Admin Console — same patterns as Config / Email Test (`PageHeader`, `Card`, `Label`, `Input`, `Textarea`, `Alert`, `Button`). Subject + HTML body + **simple HTML preview panel** (sandbox `iframe` or `dangerouslySetInnerHTML` in a bordered preview box — not a WYSIWYG editor).
5. **Send contract frozen:** `sendEmail({ to, templateSlug, variables })` throws on failure; decision helpers `attempt*` audit and never throw / never roll back the decision.
6. **Phased delivery:** deny path unchanged until Approve SMTP is wired in **Phase 6**.

## Out of scope

- CIG denying borrowers
- Putting denial reason in email
- Changing SMTP transport
- Full rich-text WYSIWYG
- Editing `test` / reminder / auth-confirm templates in v1

## UI placement

- Nav: Admin → **Decision Emails** (next to Email Test), module `system_config`
- Route: `/admin/email-templates` — two Cards: Reject | Accept
- Preview / test: link to `/admin/email-test` with selectable decision slug (Phase 7)

## Approve email default copy (seed)

Subject: `LoanStar — Application Approved`  
Body: thank you; application approved; team will contact about next steps; contact office if questions; — LoanStar. Vars: `{{borrower_name}}` only.
