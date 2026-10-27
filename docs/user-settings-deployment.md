# User Settings deployment

The dropdown opens `/settings`. Users can change their password after verifying the current password. New login-email changes require approval only from the current mailbox. Ownership of the new mailbox is deliberately not verified under the approved policy; users must check the address carefully.

## Current-mailbox approval deployment

Apply `supabase/migrations/20261027065943_current_email_change_approval.sql` after the audit migration below. Set `EMAIL_CHANGE_APP_ORIGIN` to the trusted HTTPS application origin in production (or use `VERCEL_PROJECT_PRODUCTION_URL`). Development allows localhost HTTP. Use the existing transactional SMTP configuration and the migration's `account_email_change_current_approval` template. Supabase's native Auth settings remain unchanged.

The server verifies the current password and records an attempt, then creates a user-bound request with a SHA-256 token digest, 30-minute expiry, and one active request per account. Raw tokens exist only in the approval email's URL fragment and transient browser/server memory. They are removed from the browser URL before requests. The current mailbox receives the link; the new mailbox receives no verification message. Approval requires the same active authenticated account and an explicit button click. The server claims the request, performs the approved same-user Admin email update with `email_confirm: true`, and verifies the transactional completion journal. The original password is preserved. After verified completion, the approval page signs out the current session and redirects to login with an instructional reauthentication hint. If sign-out fails, the completed page offers a sign-out-only retry, including when the completed link is reopened. Existing Auth audit/profile triggers synchronize the profile; a distinct current-address approval audit event is written atomically.

Requests are limited to one per minute and five per hour. A new request supersedes the prior pending request. Duplicate targets receive a generic failure rather than account-existence information. Definite provider rejections close the claim; uncertain network/5xx outcomes deliberately remain processing until support reconciles Auth and the request journal. Do not automatically unlock or replay an uncertain mutation. Expired, superseded, wrong-account and invalid links cannot authorize updates. A completed replay is informational and cannot mutate again.

Existing native confirmation links still use `/auth/confirm`; existing native pending requests may still require both inboxes. Password recovery and its callback are unchanged. No real credential changes or email delivery are performed by the synthetic verification scripts.

Before rollout, use a dedicated test account to verify old-inbox delivery, wrong-account rejection, one successful approval, authoritative Settings/profile email, new-email login with the existing password, audit visibility, replay, expiry, and duplicate-target rejection. Also verify password change and password recovery.

Rollback: first disable the new email-change request UI/endpoint or restore the previous application revision. Reconcile any `processing` requests before removing the two custom Auth triggers and service-only RPC. Retain request/audit history and the original audit/profile-sync trigger. Do not roll back user emails or delete audit events. Restore native email-change requests only after resolving open custom requests, because the guard intentionally blocks conflicting Auth email writes.

## Required database migration

Apply `supabase/migrations/20261026084635_user_settings_security_audit.sql` to the same Supabase project used by the application before enabling this feature in a deployment. Review and apply this specific migration through the normal migration workflow; do not push unrelated pending migrations automatically.

The Settings mutation endpoint returns 503 until `settings_security_audit_ready()` confirms the Auth audit trigger is enabled. This prevents deploying password/email changes without the required logging. Trigger errors roll back the corresponding Auth change; investigate database logs if Auth reports a database error.

Application requests record the server-verified user, role and request IP before mutation. Database events record actual password changes, pending email verification requests, confirmed email changes, and recovery requests. Database-originated events may have no authenticated actor or IP; their target account is identified by `entity_id` and account email. Anonymous recovery is never falsely attributed to the account owner as an authenticated action. Passwords, password hashes, session tokens and verification tokens are excluded.

Confirmed email changes update `profiles.email` in the same transaction. Pending verification does not change the profile's email.

## Supabase Auth configuration

- Retain existing email confirmations and Secure Email Change for native Auth flows. The approved current-mailbox-only flow uses a separate privileged completion path; it does not change provider configuration.
- Allow the production and intended development URLs ending in `/auth/confirm` and `/reset-password` in Auth redirect URLs.
- Recovery templates must honor the supplied `/reset-password` redirect. Email-change templates must honor `/auth/confirm`.
- The confirmation handler supports PKCE codes in the same browser, legacy implicit access/refresh tokens, and `token_hash` links with type `email_change`. Recovery also supports type `recovery`.
- PKCE links need the verifier created in the initiating browser. If cross-browser confirmation is required, configure token-hash templates with the appropriate allowlisted type instead.
- Retain the provider's password strength and authentication rate limits. The app additionally enforces an eight-character minimum and asks for the current password for Settings changes.

Applied to Loanstar (acopcwlhkovssjnrqygk) on 2026-10-26 as migration 20261026084635. Verified the audit trigger is enabled and function permissions are restricted correctly. Auth configuration was not changed. Real email delivery and confirmation must be checked after deploying the application with a dedicated test account.

## Local verification

```powershell
node --import tsx --test src/lib/account/__tests__/security.test.mts src/lib/auth/__tests__/*.mts src/lib/audit/__tests__/*.mts src/lib/permissions/__tests__/navigation.test.mts
npm install --prefix tmp/settings-audit-qa --no-save --ignore-scripts --package-lock=false @electric-sql/pglite
node scripts/verify-settings-audit.mjs ./tmp/settings-audit-qa/node_modules/@electric-sql/pglite/dist/index.js
node scripts/verify-current-email-approval.mjs
node scripts/verify-settings-ui.mjs
```

The SQL check uses an isolated PostgreSQL runtime with synthetic Auth/profile fixtures. The browser check renders the real Settings component against a mock API; it does not authenticate to Supabase or change real credentials. It does not replace an authenticated deployment test of the full application shell and provider email delivery.



The current-mailbox migration was applied to Loanstar (`acopcwlhkovssjnrqygk`) as version `20261027065943` on 2026-10-27. Verified RLS, no anonymous/authenticated RPC execution, service-role execution, enabled Auth guard/completion/original audit triggers, and template presence. No real credential mutation was performed. The private request table intentionally has no client RLS policies; all direct table access is revoked and transitions use the service-only RPC.
