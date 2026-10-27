# Current-email-only approval implementation

Approved direction: verify the password and send a single approval email to the current registered mailbox. The new mailbox is not verified. Native Supabase configuration stays unchanged; privileged Auth API completion is confined to this custom, token-authorized workflow.

## Contract

New public RPC `account_email_change(p_action text, p_user_id uuid, p_request_id uuid default null, p_token_hash text default null, p_new_email text default null, p_old_email text default null)` is service-role-only, with a private request store. Actions: start, pending, inspect, claim, delivery_failed, failed. Returns a JSON object {id, oldEmail, newEmail, status, expiresAt} or null for pending. Start uses supplied digest and canonical emails, generates request id, expires after 30 minutes, supersedes previous pending requests, rejects processing, limits 1/minute and 5/hour. Other actions validate user id/request/digest, never raw tokens. Inspect is read-only. Claim atomically changes pending to processing, rejecting replay/concurrency and revalidating current identity, target uniqueness and expiry. Delivery failure/final known provider failure close only the matching request.

A private Auth email trigger guards active custom requests against native/concurrent changes, then atomically completes the processing request and writes a user-attributed event when Auth changes to its bound target. The existing audit trigger continues profile synchronization. An uncertain provider/network failure retains processing state to prevent unsafe automatic retries. No direct application SQL writes to Auth identities.

## Work

- [ ] Implement and test SQL storage/RPC/triggers/template in the new migration.
- [ ] Add server-only token creation and digest helpers, existing SMTP template delivery only to current email, and privileged completion service through Auth admin API.
- [ ] Change email branch of security service to request approval, leaving password behavior unchanged. Return private pending state through the existing GET.
- [ ] Add a dedicated confirmation page with a fragment-only token, immediate URL cleanup, read-only inspection, and explicit approval POST. Require the matching authenticated account. Refresh session after confirmed completion without revoking sessions.
- [ ] Update Settings instructions and audit labels; preserve native legacy callbacks and recovery.
- [ ] Verify service unit tests, isolated PostgreSQL tests, UI behavior, lint and production type checks; independently review sensitive code.
- [ ] Document production origin configuration, deployment migration, uncertainty/recovery behavior and rollback. Do not change real credentials during testing.

Production approval links require EMAIL_CHANGE_APP_ORIGIN or the trusted Vercel production hostname. Development may use a localhost origin. Tokens and passwords must never enter logs, query strings, audit metadata, or persistent browser storage.
