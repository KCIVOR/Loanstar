# Meridian Transactional Email Shell — Design

**Date:** 2026-07-24  
**Status:** Approved for planning  
**Depends on:** SMTP config, committee decision email templates, public branding logo

## Goal

Replace bare-paragraph decision (and test) emails with a professional Meridian-branded HTML shell so messages look legitimate in Gmail and other clients: navy header with logo + “LoanStar” wordmark, structured body, muted footer.

## Scope

**In scope**
- Shared layout helper reusable by future reminders
- Update stored HTML for `application_denied`, `application_approved`, and `test`
- Keep `{{borrower_name}}` only on decision templates (no denial reasons)
- Apply changes to live DB (migration file alone is not enough)

**Out of scope**
- Redesigning reminder / auth-confirm copy beyond enabling reuse of the helper
- Changing SMTP transport or `sendEmail` throw contract
- New merge variables
- MJML toolchain

## Product / visual rules

| Element | Spec |
|---------|------|
| Canvas | `#F7F9FC` (Meridian `--canvas`) |
| Card | ~600px centered, white surface, light border (`#D9E0EB`) |
| Header | Navy foundation (`#0C2247` / `#071633`), logo via `BRANDING.logoUrl` + **LoanStar** wordmark (white) |
| Accent | Thin teal bar under header (`#0D9488`) |
| Type | Body: Public Sans / system-ui stack; headings: Sora / system-ui (email-safe fallbacks). Inline styles only (no external CSS dependency for layout). |
| Deny | Neutral navy eyebrow (“Application update”); polite body; no red “rejected” drama |
| Approve | Same shell; soft success-tinted eyebrow/badge (“Application approved”) |
| Footer | Muted ink: LoanStar + short “sent by LoanStar” line |
| Logo | Image + wordmark (Option A). `alt="LoanStar"`. If image blocked, wordmark still visible. |

## Architecture

### Shared helper

`src/lib/email/meridian-layout.ts`

```ts
buildMeridianEmailHtml(opts: {
  eyebrow: string;
  title: string;
  bodyHtml: string; // inner paragraphs only; may include {{borrower_name}}
  tone?: "neutral" | "success";
  preheader?: string;
}): string
```

- Table-based layout, inline styles (email clients).
- Imports logo URL from `@/lib/branding` (`BRANDING.logoUrl`).
- Returns a complete HTML document fragment suitable for `email_templates.body_html` (and nodemailer `html`).

### Storage strategy

Store **full wrapped HTML** in `email_templates.body_html` so `/admin/email-templates` preview matches what SMTP sends.

Defaults are generated from the helper (in a seed script/migration content, or a small Node seed used to produce SQL). Live DB updated via `apply_migration` / UPDATE.

Superadmin may still edit HTML in the admin UI; docs note they should preserve the outer shell when changing copy.

### Templates to refresh

| Slug | Subject (unchanged unless noted) | Content tone |
|------|----------------------------------|--------------|
| `application_denied` | `LoanStar — Application Update` | Unable to proceed; contact office; no reason |
| `application_approved` | `LoanStar — Application Approved` | Approved; next steps; contact office |
| `test` | Keep existing subject or align to Meridian test label | Short sample body inside same shell |

## Constraints (frozen)

- Decision merge vars: `{{borrower_name}}` only
- Forbidden reason vars remain blocked on decision template save
- `sendEmail` still loads template + interpolates; no API shape change
- Deny must not disclose committee reasons

## Testing

- Unit: helper includes navy header, logo `src`, LoanStar wordmark, provided body, teal accent
- Manual: `/admin/email-test` for each slug; `/admin/email-templates` preview; real Gmail inbox for deny/approve
- Confirm live DB rows updated (not only local migration file)

## Delivery notes

- Prefer a SQL migration that `UPDATE`s `body_html` for the three slugs with the final HTML (escaped), generated from the helper so code and DB stay aligned.
- Apply migration to remote before claiming done (lesson from prior SMTP silent-fail).
