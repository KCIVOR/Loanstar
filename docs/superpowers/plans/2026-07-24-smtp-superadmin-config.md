# Google SMTP Superadmin Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Resend with Google SMTP for all app transactional email, with credentials managed on Superadmin `/admin/config` (same pattern as Twilio SMS).

**Architecture:** Seed SMTP keys into `config_settings`. Extend admin config GET/PATCH + UI to edit them (mask `smtp_password`). Rewrite `src/lib/email/send.ts` to load those keys via the service client and send with nodemailer. Keep `SendEmailInput` / callers (`denial-email`, reminders, admin email-test) unchanged. Leave Supabase Auth email alone.

**Tech Stack:** Next.js, Supabase `config_settings`, nodemailer, existing `config-mask` helpers, node:test (`.mts`).

**Spec:** `docs/superpowers/specs/2026-07-24-smtp-superadmin-config-design.md`  
**Audit canvas:** `smtp-email-audit.canvas.tsx`

---

## File map

| File | Responsibility |
|------|----------------|
| `supabase/migrations/YYYYMMDDHHMMSS_smtp_config_settings.sql` | Seed SMTP `config_settings` rows |
| `src/lib/sms/config-mask.ts` | Reuse mask/patch helpers (optionally rename mask fn comment) |
| `src/lib/email/smtp-config.ts` | Load + parse SMTP settings from DB (pure helpers + loader) |
| `src/lib/email/__tests__/smtp-config.test.mts` | Unit tests for parse / enabled gate |
| `src/lib/email/send.ts` | Nodemailer transport; drop Resend |
| `src/app/api/admin/config/route.ts` | CONFIG_KEYS + zod + SECRET_KEYS for SMTP |
| `src/app/admin/config/page.tsx` | Email (SMTP) card + fields + save |
| `src/app/admin/email-test/page.tsx` | Copy: SMTP / config, not Resend |
| `package.json` | Add `nodemailer` + `@types/nodemailer`; remove `resend` |
| `.env.local.example`, `docs/DEPLOYMENT.md` | Document SMTP via admin; remove Resend vars |

**Out of scope files:** denial-email callers, reminder logic, Auth register, email template CRUD.

---

### Task 1: Migration — seed SMTP config keys

**Files:**
- Create: `loanstar/supabase/migrations/20260724120000_smtp_config_settings.sql`

- [ ] **Step 1: Add migration**

```sql
-- Google SMTP / transactional email (Superadmin Config UI).
-- Secrets stored plaintext in JSONB (same as twilio_auth_token).

INSERT INTO public.config_settings (key, value, description) VALUES
  ('email_enabled', 'false'::jsonb, 'Enable transactional email via SMTP'),
  ('smtp_host', '"smtp.gmail.com"'::jsonb, 'SMTP hostname'),
  ('smtp_port', '587'::jsonb, 'SMTP port (587 STARTTLS or 465 SSL)'),
  ('smtp_secure', 'false'::jsonb, 'true = TLS/SSL on connect (use with port 465)'),
  ('smtp_user', '""'::jsonb, 'SMTP username (Gmail address)'),
  ('smtp_password', '""'::jsonb, 'SMTP password / Gmail App Password (masked on GET)'),
  ('smtp_from', '""'::jsonb, 'From header, e.g. LoanStar <you@gmail.com>')
ON CONFLICT (key) DO NOTHING;
```

- [ ] **Step 2: Apply locally**

Run: `cd loanstar && npx supabase db push`  
(or project’s usual migration apply).  
Expected: keys appear in `config_settings`.

- [ ] **Step 3: Commit** (only if user asked to commit)

```bash
git add supabase/migrations/20260724120000_smtp_config_settings.sql
git commit -m "feat: seed SMTP config_settings for Superadmin email"
```

---

### Task 2: SMTP config loader + unit tests (TDD)

**Files:**
- Create: `loanstar/src/lib/email/smtp-config.ts`
- Create: `loanstar/src/lib/email/__tests__/smtp-config.test.mts`
- Modify: `loanstar/src/lib/sms/config-mask.ts` (optional alias only — keep existing exports)

- [ ] **Step 1: Write failing tests**

```typescript
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  parseSmtpConfig,
  type SmtpConfigRow,
} from "../smtp-config";

function rows(partial: Record<string, unknown>): SmtpConfigRow[] {
  return Object.entries(partial).map(([key, value]) => ({ key, value }));
}

describe("parseSmtpConfig", () => {
  it("returns enabled=false when email_enabled is false", () => {
    const cfg = parseSmtpConfig(
      rows({
        email_enabled: false,
        smtp_host: "smtp.gmail.com",
        smtp_port: 587,
        smtp_secure: false,
        smtp_user: "a@gmail.com",
        smtp_password: "app-pass",
        smtp_from: "LoanStar <a@gmail.com>",
      }),
    );
    assert.equal(cfg.enabled, false);
    assert.equal(cfg.host, "smtp.gmail.com");
    assert.equal(cfg.port, 587);
  });

  it("treats missing port as 587 and secure false", () => {
    const cfg = parseSmtpConfig(
      rows({
        email_enabled: true,
        smtp_host: "smtp.gmail.com",
        smtp_user: "a@gmail.com",
        smtp_password: "x",
        smtp_from: "a@gmail.com",
      }),
    );
    assert.equal(cfg.port, 587);
    assert.equal(cfg.secure, false);
  });

  it("lists incomplete when required fields blank and enabled", () => {
    const cfg = parseSmtpConfig(
      rows({
        email_enabled: true,
        smtp_host: "",
        smtp_user: "",
        smtp_password: "",
        smtp_from: "",
      }),
    );
    assert.equal(cfg.enabled, true);
    assert.ok(cfg.incomplete.length > 0);
  });

  it("incomplete empty when all required present", () => {
    const cfg = parseSmtpConfig(
      rows({
        email_enabled: true,
        smtp_host: "smtp.gmail.com",
        smtp_port: 465,
        smtp_secure: true,
        smtp_user: "a@gmail.com",
        smtp_password: "app-pass",
        smtp_from: "LoanStar <a@gmail.com>",
      }),
    );
    assert.deepEqual(cfg.incomplete, []);
    assert.equal(cfg.secure, true);
    assert.equal(cfg.port, 465);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `cd loanstar && node --import tsx --test src/lib/email/__tests__/smtp-config.test.mts`  
Expected: FAIL (module not found)

- [ ] **Step 3: Implement `smtp-config.ts`**

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  asConfigBoolean,
  asConfigString,
} from "@/lib/sms/config-mask";

export const SMTP_CONFIG_KEYS = [
  "email_enabled",
  "smtp_host",
  "smtp_port",
  "smtp_secure",
  "smtp_user",
  "smtp_password",
  "smtp_from",
] as const;

export type SmtpConfigRow = { key: string; value: unknown };

export type ParsedSmtpConfig = {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
  /** Missing required field names when enabled. */
  incomplete: string[];
};

function asConfigNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

export function parseSmtpConfig(rows: SmtpConfigRow[]): ParsedSmtpConfig {
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const enabled = asConfigBoolean(map.get("email_enabled"), false);
  const host = asConfigString(map.get("smtp_host")).trim();
  const port = asConfigNumber(map.get("smtp_port"), 587);
  const secure = asConfigBoolean(map.get("smtp_secure"), false);
  const user = asConfigString(map.get("smtp_user")).trim();
  const password = asConfigString(map.get("smtp_password")).trim();
  const from = asConfigString(map.get("smtp_from")).trim();

  const incomplete: string[] = [];
  if (!host) incomplete.push("smtp_host");
  if (!user) incomplete.push("smtp_user");
  if (!password) incomplete.push("smtp_password");
  if (!from) incomplete.push("smtp_from");

  return { enabled, host, port, secure, user, password, from, incomplete };
}

/** Load SMTP settings with service (or any) Supabase client. */
export async function loadSmtpConfig(
  supabase: SupabaseClient,
): Promise<ParsedSmtpConfig> {
  const { data, error } = await supabase
    .from("config_settings")
    .select("key, value")
    .in("key", [...SMTP_CONFIG_KEYS]);

  if (error) {
    throw new Error(`Failed to load SMTP config: ${error.message}`);
  }
  return parseSmtpConfig(data ?? []);
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `cd loanstar && node --import tsx --test src/lib/email/__tests__/smtp-config.test.mts`  
Expected: PASS

---

### Task 3: Rewrite `sendEmail` to nodemailer

**Files:**
- Modify: `loanstar/src/lib/email/send.ts`
- Modify: `loanstar/package.json` (deps)

- [ ] **Step 1: Install nodemailer**

Run:

```bash
cd loanstar && npm install nodemailer && npm install -D @types/nodemailer && npm uninstall resend
```

- [ ] **Step 2: Replace `send.ts`**

```typescript
import nodemailer from "nodemailer";

import { createServiceClient } from "@/lib/supabase/server";
import { loadSmtpConfig } from "@/lib/email/smtp-config";

export type SendEmailInput = {
  to: string | string[];
  templateSlug: string;
  variables?: Record<string, string>;
  from?: string;
};

export type SendEmailResult = {
  id: string;
  to: string[];
  subject: string;
};

function renderTemplate(
  template: string,
  variables: Record<string, string>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    return variables[key] ?? "";
  });
}

/**
 * Sends a transactional email using `email_templates` + SMTP from
 * Superadmin `config_settings` (Google SMTP / nodemailer).
 */
export async function sendEmail(
  input: SendEmailInput,
): Promise<SendEmailResult> {
  const supabase = createServiceClient();
  const smtp = await loadSmtpConfig(supabase);

  if (!smtp.enabled) {
    throw new Error("Transactional email is disabled (email_enabled=false)");
  }
  if (smtp.incomplete.length > 0) {
    throw new Error(
      `SMTP credentials incomplete: ${smtp.incomplete.join(", ")}`,
    );
  }

  const { data: template, error } = await supabase
    .from("email_templates")
    .select("subject, body_html")
    .eq("slug", input.templateSlug)
    .single();

  if (error || !template) {
    throw new Error(
      `Email template '${input.templateSlug}' not found: ${error?.message ?? "missing row"}`,
    );
  }

  const variables = input.variables ?? {};
  const subject = renderTemplate(template.subject, variables);
  const html = renderTemplate(template.body_html, variables);
  const recipients = Array.isArray(input.to) ? input.to : [input.to];
  const from = (input.from?.trim() || smtp.from).trim();
  if (!from) {
    throw new Error("SMTP from address is empty");
  }

  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: {
      user: smtp.user,
      pass: smtp.password,
    },
  });

  const info = await transporter.sendMail({
    from,
    to: recipients.join(", "),
    subject,
    html,
  });

  return {
    id: info.messageId || `smtp-${Date.now()}`,
    to: recipients,
    subject,
  };
}
```

- [ ] **Step 3: Typecheck / smoke**

Run: `cd loanstar && npx tsc --noEmit` (or project’s usual check)  
Expected: no errors related to email/send.

- [ ] **Step 4: Run unit tests**

Run: `cd loanstar && npm test`  
Expected: existing tests + smtp-config tests pass.

---

### Task 4: Admin config API — SMTP keys

**Files:**
- Modify: `loanstar/src/app/api/admin/config/route.ts`

- [ ] **Step 1: Extend CONFIG_KEYS and SECRET_KEYS**

Add to `CONFIG_KEYS`:

```typescript
  "email_enabled",
  "smtp_host",
  "smtp_port",
  "smtp_secure",
  "smtp_user",
  "smtp_password",
  "smtp_from",
```

Add to `SECRET_KEYS`:

```typescript
const SECRET_KEYS = new Set([
  "twilio_auth_token",
  "cron_secret",
  "smtp_password",
]);
```

- [ ] **Step 2: Extend `patchConfigSchema`**

```typescript
  email_enabled: z.boolean().optional(),
  smtp_host: z.string().optional(),
  smtp_port: z.number().int().positive().optional(),
  smtp_secure: z.boolean().optional(),
  smtp_user: z.string().optional(),
  smtp_password: z.string().optional(),
  smtp_from: z.string().optional(),
```

- [ ] **Step 3: Extend PATCH update builders**

Mirror Twilio: trim strings; use `shouldApplySecretPatch(body.smtp_password)` for password; push number/boolean as-is for port/secure/enabled.

```typescript
    if (body.email_enabled !== undefined) {
      updates.push({ key: "email_enabled", value: body.email_enabled });
    }
    if (body.smtp_host !== undefined) {
      updates.push({ key: "smtp_host", value: body.smtp_host.trim() });
    }
    if (body.smtp_port !== undefined) {
      updates.push({ key: "smtp_port", value: body.smtp_port });
    }
    if (body.smtp_secure !== undefined) {
      updates.push({ key: "smtp_secure", value: body.smtp_secure });
    }
    if (body.smtp_user !== undefined) {
      updates.push({ key: "smtp_user", value: body.smtp_user.trim() });
    }
    if (shouldApplySecretPatch(body.smtp_password)) {
      updates.push({
        key: "smtp_password",
        value: body.smtp_password!.trim(),
      });
    }
    if (body.smtp_from !== undefined) {
      updates.push({ key: "smtp_from", value: body.smtp_from.trim() });
    }
```

GET already masks any `SECRET_KEYS` row via `maskTwilioAuthToken` — reuse for `smtp_password` (same `•••last4` behavior).

---

### Task 5: Admin Config UI — Email (SMTP) card

**Files:**
- Modify: `loanstar/src/app/admin/config/page.tsx`

- [ ] **Step 1: Add state**

```typescript
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [smtpHost, setSmtpHost] = useState("smtp.gmail.com");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [smtpFrom, setSmtpFrom] = useState("");
```

- [ ] **Step 2: Hydrate from load()**

```typescript
        if (s.key === "email_enabled") setEmailEnabled(Boolean(s.value));
        if (s.key === "smtp_host") setSmtpHost(String(s.value ?? ""));
        if (s.key === "smtp_port") setSmtpPort(String(s.value ?? "587"));
        if (s.key === "smtp_secure") setSmtpSecure(Boolean(s.value));
        if (s.key === "smtp_user") setSmtpUser(String(s.value ?? ""));
        if (s.key === "smtp_password") setSmtpPassword(String(s.value ?? ""));
        if (s.key === "smtp_from") setSmtpFrom(String(s.value ?? ""));
```

- [ ] **Step 3: Include in PATCH body**

```typescript
          email_enabled: emailEnabled,
          smtp_host: smtpHost,
          smtp_port: Number(smtpPort),
          smtp_secure: smtpSecure,
          smtp_user: smtpUser,
          smtp_password: smtpPassword,
          smtp_from: smtpFrom,
```

- [ ] **Step 4: Add Card UI after SMS card (or before)**

Card title: **Email (SMTP)**  
Help text: Google SMTP uses App Password (not account password). Host `smtp.gmail.com`, port `587` (STARTTLS) or `465` + Secure. Password is masked after save — leave masked value to keep existing. Enable only after credentials work. Link note: Auth confirmation emails are configured in Supabase Auth, not here.

Fields (mirror SMS layout, `max-w-md space-y-4`):
- Checkbox Enable transactional email
- Host, Port (number), Secure checkbox
- Username, Password (`type="password"`), From

Optional: button “Open email test” → `/admin/email-test` (secondary link), keep test send on existing page.

---

### Task 6: Docs + email-test copy + env cleanup

**Files:**
- Modify: `loanstar/src/app/admin/email-test/page.tsx`
- Modify: `loanstar/.env.local.example`
- Modify: `loanstar/docs/DEPLOYMENT.md`

- [ ] **Step 1: Email test page copy**

Replace Resend wording with:

> Uses template slug "test" via SMTP settings on System Config. Requires Email enabled and complete SMTP credentials under Admin → Config.

- [ ] **Step 2: `.env.local.example`**

Remove `RESEND_API_KEY` / `RESEND_FROM_EMAIL`. Add comment:

```bash
# Transactional email: configure SMTP under Admin → System Config (not env).
# Supabase Auth emails (confirm/reset) use Auth SMTP in the Supabase dashboard.
```

- [ ] **Step 3: `DEPLOYMENT.md`**

Replace Email (Resend) section with:

```markdown
## 3. Email (SMTP)

- [ ] In Superadmin → System Config, set Google SMTP (or other) credentials
- [ ] Enable transactional email; From must be allowed for that mailbox
- [ ] Test via `/admin/email-test`
- [ ] Separately configure Supabase Auth SMTP for signup/confirm if needed
```

Remove `RESEND_API_KEY` / `EMAIL_FROM` from the Vercel env table (or mark obsolete).

---

### Task 7: Manual verification

- [ ] **Step 1: Config UI**

1. Sign in as Super Admin → `/admin/config`
2. Confirm Email (SMTP) card loads defaults (`smtp.gmail.com`, 587, disabled)
3. Save with App Password; reload — password shows `•••xxxx`
4. Save again without changing password — token must not wipe (masked skip)

- [ ] **Step 2: Send test**

1. Enable email, save
2. `/admin/email-test` → send to your Gmail
3. Expect inbox delivery; audit row for email test

- [ ] **Step 3: Disabled gate**

1. Disable `email_enabled`, save
2. Email test should fail with clear “disabled” error
3. Re-enable

- [ ] **Step 4: Regression**

Run: `cd loanstar && npm test`  
Expected: all green.

---

## Self-review

| Spec item | Task |
|-----------|------|
| Seed config keys | Task 1 |
| Parse/load SMTP | Task 2 |
| nodemailer sendEmail | Task 3 |
| Admin API | Task 4 |
| Admin UI | Task 5 |
| Docs / remove Resend | Task 6 |
| Manual test | Task 7 |
| Out of scope: templates UI, Auth SMTP, encryption | Explicitly omitted |

No TBD placeholders. Types: `ParsedSmtpConfig`, `SMTP_CONFIG_KEYS`, `SendEmailInput` unchanged for callers.
