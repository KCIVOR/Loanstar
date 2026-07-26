# Committee Decision Email Templates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Superadmin edit Accept/Reject email templates (Meridian UI); on committee Approve send SMTP `application_approved` **and** keep in-app notice; Deny continues using editable `application_denied` with **no reason disclosed**.

**Architecture:** Reuse `email_templates` + existing `sendEmail` (SMTP). Add a small allowlist registry for committee decision slugs/vars. Admin CRUD API scoped to those slugs. Mirror `denial-email.ts` for approval. Wire Approve in the action route only after the helper is tested. Phase gates so each phase leaves deny behavior unchanged until **Phase 6** (Approve SMTP wire).

**Tech Stack:** Next.js App Router, Supabase `email_templates`, Meridian UI (`PageHeader`/`Card`/`Textarea`), nodemailer via `sendEmail`, node:test.

**Spec:** `docs/superpowers/specs/2026-07-24-committee-decision-email-templates-design.md`

**Live DB check (MCP, 2026-07-24):** `application_denied` exists; `application_approved` does **not** — Phase 1 must create **and apply** the seed migration. SMTP is already enabled on this project.

**Safety freeze (do not break):**
- `SendEmailInput` / `SendEmailResult` / throw-on-failure
- `attemptApplicationDeniedEmail` audit + never roll back deny
- In-app notifications on approve/deny in `executeFinalAction`
- SMTP config / `email_enabled` gate
- Decision merge vars = `borrower_name` **only** (no reason, no `application_no` in v1)

**DO NOT git commit unless the user explicitly asks.**

---

## File map

| File | Responsibility |
|------|----------------|
| `supabase/migrations/20260724140000_seed_application_approved_email.sql` | Seed `application_approved` (must be applied to remote) |
| `src/lib/email/decision-templates.ts` | Slug allowlist, allowed vars, validate body/subject |
| `src/lib/email/__tests__/decision-templates.test.mts` | Unit tests for validation |
| `src/app/api/admin/email-templates/route.ts` | GET list (decision slugs) |
| `src/app/api/admin/email-templates/[slug]/route.ts` | GET one + PATCH subject/body_html |
| `src/app/admin/email-templates/page.tsx` | Meridian editor UI |
| `src/components/admin/Sidebar.tsx` | Nav link |
| `src/lib/committee/approval-email.ts` | Build + attempt send (mirror denial) |
| `src/lib/committee/__tests__/approval-email.test.mts` | Payload tests |
| `src/app/api/committee/applications/[id]/action/route.ts` | Call approval attempt on `approve` |
| `src/app/admin/email-test/page.tsx` | Optional: choose decision slug for test |

---

## Phase 0 — Baseline (no product change)

### Task 0: Confirm freeze + run tests

**Files:** none (verify only)

- [ ] **Step 1: Confirm deny path still documented**

Open `src/lib/committee/denial-email.ts` and `src/app/api/committee/applications/[id]/action/route.ts` — deny-only email call remains.

- [ ] **Step 2: Run unit tests**

Run: `cd loanstar && npm test`  
Expected: all pass (baseline).

- [ ] **Step 3: Report**

Note: Phase 0 complete. No code changes.

---

## Phase 1 — Seed approve template (DB only)

### Task 1: Migration `application_approved`

**Files:**
- Create: `loanstar/supabase/migrations/20260724140000_seed_application_approved_email.sql`

- [ ] **Step 1: Write migration**

```sql
-- Committee Accept email (SMTP). Editable by Superadmin; no loan terms required in v1.
INSERT INTO public.email_templates (slug, name, subject, body_html) VALUES
  (
    'application_approved',
    'Application Approved',
    'LoanStar — Application Approved',
    '<p>Dear {{borrower_name}},</p><p>Thank you for your loan application. We are pleased to inform you that your application has been approved.</p><p>Our team will contact you regarding the next steps.</p><p>If you have questions, please contact our office.</p><p>— LoanStar</p>'
  )
ON CONFLICT (slug) DO NOTHING;
```

- [ ] **Step 2: Apply to remote (required — file alone is not enough)**

Use MCP `apply_migration` name `seed_application_approved_email` with the same SQL, or `npx supabase db push`.

**Lesson from SMTP bug:** if the row is missing, `sendEmail` fails with template not found / PATCH editors save nothing useful until the seed exists.

Verify:

```sql
SELECT slug, subject FROM email_templates WHERE slug IN ('application_denied','application_approved');
```

Expected: **both** rows present. **Deny body unchanged.**

---

## Phase 2 — Validation registry (pure, no wiring)

### Task 2: Decision template allowlist + tests (TDD)

**Files:**
- Create: `loanstar/src/lib/email/decision-templates.ts`
- Create: `loanstar/src/lib/email/__tests__/decision-templates.test.mts`

- [ ] **Step 1: Write failing tests**

```typescript
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  COMMITTEE_DECISION_SLUGS,
  assertDecisionTemplateContent,
  listForbiddenMergeVars,
} from "../decision-templates";

describe("decision-templates", () => {
  it("allowlists denied and approved only", () => {
    assert.deepEqual([...COMMITTEE_DECISION_SLUGS].sort(), [
      "application_approved",
      "application_denied",
    ]);
  });

  it("accepts polite denial copy with borrower_name only", () => {
    assert.doesNotThrow(() =>
      assertDecisionTemplateContent({
        slug: "application_denied",
        subject: "LoanStar — Application Update",
        bodyHtml:
          "<p>Dear {{borrower_name}},</p><p>We are unable to proceed at this time.</p>",
      }),
    );
  });

  it("rejects denial content that references reason-like merge vars", () => {
    assert.throws(
      () =>
        assertDecisionTemplateContent({
          slug: "application_denied",
          subject: "Denied",
          bodyHtml: "<p>{{borrower_name}} reason: {{reason}}</p>",
        }),
      /reason|forbidden/i,
    );
  });

  it("lists forbidden vars found in text", () => {
    const found = listForbiddenMergeVars(
      "Hello {{borrower_name}} {{comment}} {{finding}}",
    );
    assert.ok(found.includes("comment"));
    assert.ok(found.includes("finding"));
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

`node --import tsx --test src/lib/email/__tests__/decision-templates.test.mts`

- [ ] **Step 3: Implement `decision-templates.ts`**

```typescript
export const COMMITTEE_DECISION_SLUGS = [
  "application_denied",
  "application_approved",
] as const;

export type CommitteeDecisionSlug = (typeof COMMITTEE_DECISION_SLUGS)[number];

export const ALLOWED_DECISION_VARS = ["borrower_name"] as const;

/** Merge keys that must never appear in decision emails (esp. denial). */
export const FORBIDDEN_DECISION_VARS = [
  "reason",
  "denial_reason",
  "comment",
  "committee_comment",
  "finding",
  "finding_notes",
  "notes",
] as const;

export function isCommitteeDecisionSlug(
  slug: string,
): slug is CommitteeDecisionSlug {
  return (COMMITTEE_DECISION_SLUGS as readonly string[]).includes(slug);
}

export function listForbiddenMergeVars(text: string): string[] {
  const found = new Set<string>();
  const re = /\{\{\s*(\w+)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const key = m[1];
    if ((FORBIDDEN_DECISION_VARS as readonly string[]).includes(key)) {
      found.add(key);
    }
  }
  return [...found];
}

export function assertDecisionTemplateContent(input: {
  slug: string;
  subject: string;
  bodyHtml: string;
}): void {
  if (!isCommitteeDecisionSlug(input.slug)) {
    throw new Error(`Slug '${input.slug}' is not a committee decision template`);
  }
  const subject = input.subject.trim();
  const bodyHtml = input.bodyHtml.trim();
  if (!subject) throw new Error("Subject is required");
  if (!bodyHtml) throw new Error("Body HTML is required");

  const forbidden = [
    ...listForbiddenMergeVars(subject),
    ...listForbiddenMergeVars(bodyHtml),
  ];
  if (forbidden.length > 0) {
    throw new Error(
      `Forbidden merge variables in decision email: ${[...new Set(forbidden)].join(", ")}. Denial reasons must not be disclosed.`,
    );
  }

  // Optional: warn if unknown vars — strip or reject non-allowed
  const unknown: string[] = [];
  const re = /\{\{\s*(\w+)\s*\}\}/g;
  const blob = `${subject}\n${bodyHtml}`;
  let m: RegExpExecArray | null;
  while ((m = re.exec(blob)) !== null) {
    if (!(ALLOWED_DECISION_VARS as readonly string[]).includes(m[1])) {
      if (!(FORBIDDEN_DECISION_VARS as readonly string[]).includes(m[1])) {
        unknown.push(m[1]);
      }
    }
  }
  if (unknown.length > 0) {
    throw new Error(
      `Unknown merge variables (allowed: borrower_name): ${[...new Set(unknown)].join(", ")}`,
    );
  }
}
```

- [ ] **Step 4: Run tests — PASS**

---

## Phase 3 — Superadmin API (edit without changing send)

### Task 3: Admin email-templates API

**Files:**
- Create: `loanstar/src/app/api/admin/email-templates/route.ts`
- Create: `loanstar/src/app/api/admin/email-templates/[slug]/route.ts`

- [ ] **Step 1: GET list**

`GET /api/admin/email-templates`  
- `requireModulePermission("system_config", "view")`  
- Select from `email_templates` where `slug` in `COMMITTEE_DECISION_SLUGS`  
- Return `{ templates: [{ slug, name, subject, bodyHtml, updatedAt }] }`

- [ ] **Step 2: GET one**

`GET /api/admin/email-templates/[slug]`  
- 404 if not decision slug or missing row

- [ ] **Step 3: PATCH**

`PATCH /api/admin/email-templates/[slug]`  
- `requireModulePermission("system_config", "edit")`  
- Body zod: `{ subject: string, bodyHtml: string }`  
- Call `assertDecisionTemplateContent` before update  
- Update `subject`, `body_html`  
- `writeAuditEvent` module `system_config`, entity `email_template`, **do not** log full body if huge — subject + slug is enough  
- Return updated row

- [ ] **Step 4: Manual smoke**

With Superadmin session, GET list returns denied + approved. PATCH denial subject then GET confirms. **Do not** send committee actions yet.

---

## Phase 4 — Meridian Admin UI

### Task 4: `/admin/email-templates` page + sidebar

**Files:**
- Create: `loanstar/src/app/admin/email-templates/page.tsx`
- Modify: `loanstar/src/components/admin/Sidebar.tsx`

**UI design (align with system):**
- Use `@/components/ui`: `PageHeader`, `Card`, `Alert`, `Button`, `Input`, `Label`, `Textarea`, `Badge`, `Spinner`, `Breadcrumbs` if used elsewhere in admin
- Typography: `font-display` titles, `text-ink-500` help text (same as Config / Email Test)
- Layout: one page, **two Cards** side-by-side on `lg:grid-cols-2` (Reject | Accept)
- Each card: name badge, subject `Input`, body `Textarea` (optional `mono`), helper listing **only** allowed var `{{borrower_name}}`
- **Simple HTML preview** under the textarea: bordered box rendering body with sample `borrower_name` (e.g. “Juan Dela Cruz”) — not a WYSIWYG editor
- Callout on Reject card: “Do not include why the loan was denied. Reasons are confidential.”
- Save button per card
- Success/error `Alert`
- Link to `/admin/email-test` and `/admin/config` for SMTP

**Sidebar:** add after Email Test:

```typescript
{ href: "/admin/email-templates", label: "Decision Emails", icon: "emailTest", module: "system_config" },
```

(Reuse `emailTest` icon or add a simple envelope variant — do not invent a new design language.)

- [ ] **Step 1: Implement page load + save**
- [ ] **Step 2: Visual check** — matches admin Config density; no purple/glow/cards-in-hero anti-patterns from marketing rules (this is admin console — follow existing admin pages)
- [ ] **Step 3: Confirm deny send path untouched** (`git diff` should not include `action/route.ts` yet)

---

## Phase 5 — Approval email helper (still unwired)

### Task 5: `approval-email.ts` + tests (TDD)

**Files:**
- Create: `loanstar/src/lib/committee/approval-email.ts`
- Create: `loanstar/src/lib/committee/__tests__/approval-email.test.mts`

Mirror `denial-email.ts`:

```typescript
// buildApplicationApprovedEmail → templateSlug: "application_approved"
// variables: { borrower_name } only
// attemptApplicationApprovedEmail → shouldSendChannel email, sendEmail, audit
// trigger: "committee_approve_email", emailSent true/false
// NEVER throw to caller
```

- [ ] **Step 1: Tests for build* (no reason keys)** — same shape as denial tests  
- [ ] **Step 2: Implement**  
- [ ] **Step 3: Run** `node --import tsx --test src/lib/committee/__tests__/approval-email.test.mts src/lib/committee/__tests__/denial-email.test.mts`  
Expected: all pass. **action route still deny-only.**

---

## Phase 6 — Wire Approve send (behavioral change)

### Task 6: Action route — approve email

**Files:**
- Modify: `loanstar/src/app/api/committee/applications/[id]/action/route.ts`

- [ ] **Step 1: After successful `executeFinalAction`**

```typescript
    if (body.action === "deny") {
      // existing attemptApplicationDeniedEmail — unchanged
    }

    if (body.action === "approve") {
      const application = await getApplicationForStaff(supabase, id);
      const borrowerRaw = application.borrowers;
      const borrower = Array.isArray(borrowerRaw)
        ? borrowerRaw[0]
        : borrowerRaw;
      await attemptApplicationApprovedEmail({
        actorId: user.id,
        applicationId: id,
        supabase,
        borrower: borrower
          ? {
              email: borrower.email as string | null,
              first_name: borrower.first_name as string | null,
              last_name: borrower.last_name as string | null,
              user_id: borrower.user_id as string | null,
            }
          : null,
      });
    }
```

- [ ] **Step 2: Confirm `executeFinalAction` still fires in-app approve notification** (no change to `actions.ts` unless needed)

- [ ] **Step 3: Manual E2E**
  1. SMTP enabled in Config  
  2. Edit Accept template in Decision Emails  
  3. Committee Approve on a test app → borrower inbox + in-app notice  
  4. Committee Deny → denial template, **no reason** in email  
  5. Disable SMTP → decisions still succeed; audit `emailSent: false`

---

## Phase 7 — Polish

### Task 7: Email test slug picker + docs

**Files:**
- Modify: `loanstar/src/app/admin/email-test/page.tsx` — Select: `test` | `application_denied` | `application_approved`
- Modify: `loanstar/docs/DEPLOYMENT.md` or Admin guide — one paragraph on Decision Emails + SMTP
- Run: `npm test`

---

## Phase gate checklist (for reviewers)

| After phase | Must still work |
|-------------|-----------------|
| 0-5 | Deny SMTP email + in-app deny notice unchanged; Approve still in-app only |
| 6+ | Deny unchanged; Approve = in-app **+** SMTP `application_approved` |

| Never | |
|-------|--|
| Put `{{reason}}` / committee comment in templates | Blocked by `assertDecisionTemplateContent` |
| Allow vars other than `borrower_name` in v1 | Blocked by allowlist |
| Let email failure roll back Approve/Deny | attempt* swallows errors |
| Skip applying seed migration | Same class of bug as missing SMTP keys |
| Change Auth register email | Out of scope |

---

## Self-review

- Spec locked: editable deny + approve, SMTP, keep in-app approve, no reason disclosure, Meridian UI + simple HTML preview, vars = `borrower_name` only -> Phases 1-7
- Phased so deny is untouched until Phase 6 only **adds** approve email
- Live DB (MCP): `application_denied` present; `application_approved` must be seeded+applied
- No TBD placeholders
- Types: `CommitteeDecisionSlug`, mirror denial borrower shape for approval
