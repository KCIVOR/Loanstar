# Apply the email-change template manually

This template matches `supabase-invite-email-template.html`: navy brand header, the existing LoanStar logo, teal action button, responsive white card and muted footer.

Use subject **Approve your LoanStar login email change** and the HTML in `account-email-change-template.html`.

The current-inbox-only flow sends mail through the application's SMTP sender and the `public.email_templates` row with slug `account_email_change_current_approval`. Supabase Auth's native Change Email Address template does not control this flow. Do not paste this HTML into that Auth template: the variable syntax differs.

To apply in Supabase:

1. Open the Loanstar project and SQL Editor.
2. Save the existing template's subject and body for rollback, using Table Editor or a read-only SELECT scoped to the slug above.
3. Review and run `account-email-change-template.sql`. It updates only that slug and returns the updated slug. If no row is returned, stop and check the project and migration rather than inserting an unrelated template.
4. Alternatively, paste the HTML into the corresponding application Email Templates editor.
5. With a dedicated test account, request a change and check delivery to the current inbox, proposed email, button and fallback link, 30-minute expiry text, approval, sign-out, new-email login and Superadmin audit event.

Keep `{{newEmail}}` and `{{approvalUrl}}` exactly as written. The server escapes both values for HTML. The approval URL includes a fragment containing the single-use credential; do not replace it with Supabase's `{{ .ConfirmationURL }}`, shorten it, or enable link tracking that removes the fragment.

Applied to Loanstar (`acopcwlhkovssjnrqygk`) on 2026-10-27 after explicit user authorization. Verified the stored subject, exact HTML and both placeholders. This was a single-row template data update; Auth configuration and database schema were unchanged. The previous template is preserved in `account-email-change-template.rollback.sql`. Rendering checks use synthetic values; they do not prove delivery in every email client.
