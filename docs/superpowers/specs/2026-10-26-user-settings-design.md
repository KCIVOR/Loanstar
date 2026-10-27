# User Settings design

Date: 2026-10-26
Status: Approved by user; implemented locally; database migration applied to Loanstar on 2026-10-26

## Scope and navigation
Create a dedicated authenticated /settings page using the existing AppShell and UI components. The profile dropdown Settings link opens /settings and closes the dropdown. Account remains the profile and preferences page. Protect /settings for all active authenticated users, without requiring administrative permissions.

## Password
Provide current password, new password, and confirmation fields. Verify the current password before updating the authenticated user's password through a server-controlled flow. Enforce the configured provider policy and at least the application's existing eight-character minimum. Do not expose passwords, verification tokens, or session tokens in audit metadata or application logs. Show actionable validation and provider errors, prevent duplicate submissions, and clear password fields after success.

## Email
Confirmed requirement: users can change their login email, with verification sent to the new address. Show the current authenticated email and a new email field, with current-password verification for the request. Use the provider's verified email-change flow, preserving any confirmation required for the existing address. Show pending verification separately from completed changes; never describe a request as a completed change. Synchronize the profile email only after the provider confirms the new identity. Account data and headers must reflect the confirmed identity.

## Recovery and callbacks
Repair the existing authenticated /reset-password redirect conflict. Explicitly support the callback formats used by the configured recovery and email-change templates, preserving the intended destination. Handle invalid, expired, and reused links with clear messages. Keep forgotten-password recovery available from Login.

## Audit visibility and reliability
Use the existing audit_events pipeline and Superadmin Activity/Audit Log. Add readable events for password changes, recovery requests, email-change requests, and confirmed email changes. Attribute each authenticated action to the server-verified user, including normal audit timestamp, role and IP metadata. Store old/new email only where needed; never store passwords or tokens. Anonymous recovery requests must not be falsely attributed to an authenticated user.

The existing audit writer can return null after a failed write. New Settings operations require an audit request record before mutating identity; a failed record blocks the operation. A private database trigger records actual password/email/recovery changes in the same database transaction and synchronizes confirmed profile email. A readiness RPC blocks Settings mutations until this trigger is installed and enabled. Database callback events without a verified actor retain a null actor and identify the target account separately. Do not claim atomicity between an external HTTP call and an application log write; the transactional guarantee comes from the database trigger.

## Verification
Test authenticated route access, unauthenticated redirect, current-password failure, validation, provider errors, successful password change, pending versus confirmed email, audit failure reporting, audit labels, and callback destination preservation. Verify the dropdown opens the separate Settings page. Never change real user credentials during testing. Report any external provider configuration or real-email delivery checks that could not be verified.

## Alternatives
Recommended: server-controlled password/email operations with application audit events and verified callbacks. Alternative: send reset emails only from Settings; this is simpler but does not give signed-in users a direct password-change flow. Browser-only mutation plus a client-submitted log is insufficient because log delivery and action authenticity are weaker.
