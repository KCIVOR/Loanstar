# Email change completion and presentation

Approved design: after the current-inbox approval API establishes completion, sign out the current session and replace the route with `/login?reauth=email-change`. The login hint is instructional only and never evidence of completion. Failed sign-out offers an independent retry without repeating the credential update. Completed link inspection remains informational and offers a sign-out-only button for the same authenticated account; it does not repeat the email update.

1. Extend `scripts/verify-settings-ui.mjs` with sign-out failure/retry, call scope/count, navigation and no-email-in-URL assertions; observe failure before implementation.
2. Update `src/app/auth/email-change/page.tsx` to use sign-out instead of session refresh, with a retry action, branded responsive card, accessible loading indicator and explicit processing/error/completed states. Preserve fragment cleanup, actor-bound inspection and explicit approval.
3. Add instructional reauthentication text to `src/app/login/page.tsx` for the fixed query hint. Keep login, recovery and native callbacks unchanged.
4. Derive `docs/account-email-change-template.html` from the existing invite template's navy/teal layout and logo. Use only `{{newEmail}}` and `{{approvalUrl}}`, 30-minute expiry, same-account instructions and a warning that the new inbox is unverified. Supply a manually applied, single-row SQL update plus instructions. Do not run it remotely.
5. Run account/Auth tests, isolated browser checks, scoped TypeScript and lint. Inspect desktop/mobile rendering using synthetic data and retain a local preview. No real email change is part of automated validation.

Rollback: restore the previous approval page and login hint; restore the previous template body if manually applied. No database schema or Auth configuration changes are required.
