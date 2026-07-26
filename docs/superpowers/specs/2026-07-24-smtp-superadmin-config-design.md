# Google SMTP via Superadmin Config — Design

**Date:** 2026-07-24  
**Status:** Approved for implementation (audit + user chose Superadmin UI)

## Goal

Replace Resend with Google SMTP for all app transactional email (`sendEmail`), with credentials editable on Superadmin **System Config** (`/admin/config`), mirroring Twilio SMS.

## In scope

- `config_settings` keys for SMTP + `email_enabled`
- Admin Config UI/API (mask password like Twilio token)
- Rewrite `src/lib/email/send.ts` to nodemailer SMTP
- Keep `email_templates` + existing callers unchanged
- Update docs / remove Resend dependency
- Admin email-test continues to work via the same `sendEmail`

## Out of scope

- Email templates CRUD UI
- Encrypting secrets at rest (same plaintext JSONB as Twilio today)
- Supabase Auth confirmation / reset SMTP (configure separately in Supabase dashboard)
- Changing denial/reminder business logic

## Config keys

| Key | Type | Default | Notes |
|-----|------|---------|-------|
| `email_enabled` | boolean | `false` | Gate sending |
| `smtp_host` | string | `smtp.gmail.com` | |
| `smtp_port` | number | `587` | STARTTLS |
| `smtp_secure` | boolean | `false` | `true` for 465 SSL |
| `smtp_user` | string | `""` | Gmail address |
| `smtp_password` | string | `""` | App Password; masked on GET |
| `smtp_from` | string | `""` | e.g. `LoanStar <you@gmail.com>` |

## Behavior

- When `email_enabled` is false → `sendEmail` throws a clear error (callers already try/catch; denial audits `emailSent: false`).
- Incomplete credentials → throw.
- `input.from` overrides `smtp_from` when provided; otherwise require non-empty `smtp_from`.
- Auth email for borrower register stays on Supabase Auth (not this path).

## Precedent

SMS: `config_settings` + `/admin/config` + `src/lib/sms/send.ts` + `config-mask.ts`.
