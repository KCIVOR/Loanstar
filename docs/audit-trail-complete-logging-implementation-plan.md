# Complete Audit Trail + Plain-Language Audit Log Implementation Plan

**Goal:** Every meaningful action by any user (staff or borrower) is recorded with who did it, their role, what they did, the outcome (approve/reject/etc.), the reason, what changed (before → after), and which loan/borrower it concerned — and the Super Admin "Audit Log" page shows this in plain, non-technical language with filters and export.

**Root cause:** Logging exists and is append-only, but (1) the writer never records the actor's role — `actor_role_id` is NULL on 4,851 / 4,851 rows because no caller passes it (`src/lib/audit/writer.ts:56`); (2) nine mutation endpoints write no audit row, including login/logout and payment-proof approve/reject; (3) only 408 rows carry a "before" snapshot; (4) the viewer (`src/app/admin/audit/page.tsx:81-110`) renders raw machine values — truncated user UUIDs, module slugs, and generic actions (`execute_trigger` 2,131 rows, `update` 1,929 rows) — and never displays `after_data`, which is where the actual decision/reason lives.

**Approach:** Keep the existing `audit_events` table, action names, and `after_data` shapes unchanged (three features read them); harden the writer (auto-role, loan linkage), add the missing log calls, add before-snapshots on decision routes, tighten one RLS policy, and rebuild the viewer + API around a plain-language label catalog that also makes the 4,811 historic rows readable.

**Tech stack:** Next.js 16.2.10 (App Router, route handlers), Supabase (Postgres 17, RLS, service-role client), TypeScript, Zod, node:test via tsx (`package.json:10`).

**Source:** User request 2026-10-01, following the audit-trail audit in the same session. Expected Result (quoted): *"every actions will be recorded, make sure its detailed, complete details, who act, etc, then make sure that its shown in non technical"* — on the Super Admin side.

## Open questions (resolve before implementing)

| # | Question | Why it matters | Recommended answer |
| --- | --- | --- | --- |
| 1 | Record **failed** login attempts (wrong password)? | No user ID exists for a failed attempt; we'd log the typed email + IP with no actor. Useful for spotting break-in attempts, but stores emails of non-users. | Yes — log `login_failed` with the typed email (lower-cased) and IP, actor empty. |
| 2 | Require a **reason** when a Collector/Remedial rejects a borrower's payment proof? | Today the PATCH body is only `{status}` (`src/app/api/collector/payments/[id]/route.ts:21-23`), so "why rejected" cannot be logged. Requiring it changes the reviewer UI. | Yes — required `note` (max 500 chars) when `status = "rejected"`, optional when confirmed. |
| 3 | Log **views/downloads** of borrower files (documents, PDFs), not only changes? | "Every action" could include reads. Volume is much higher; only case-file views are logged today (`case_file.view`, 73 rows). | No for this plan — log exports (masterlist CSV, audit CSV) only; revisit document-download logging separately. |
| 4 | Who besides Super Admin may see the Audit Log? | RLS allows any role with `audit_log` → view (`audit_select` policy). The new API returns staff names and borrower names. | Keep as-is (Super Admin + roles explicitly granted `audit_log` view). No change. |

---

## Live database/system validation: 2026-10-01

Read-only; no data changed. Project `acopcwlhkovssjnrqygk` (Loanstar).

1. **Volume:** `audit_events` = 4,811+ rows; 1,859 in last 30 days; latest 2026-09-30 23:20 UTC. Logging is live.
2. **Columns:** `id uuid`, `actor_id uuid NULL`, `actor_role_id uuid NULL`, `module_slug text NOT NULL`, `action text NOT NULL`, `entity_type text NULL`, `entity_id text NULL`, `before_data jsonb NULL`, `after_data jsonb NULL`, `ip_address inet NULL`, `created_at timestamptz NOT NULL default now()`.
3. **Role never recorded:** `actor_role_id IS NULL` on 4,851 / 4,851 rows. `user_roles` has 0 users with more than one role (so a single role per user is safe to resolve).
4. **Before-snapshots rare:** `before_data IS NOT NULL` on 408 rows. `entity_id IS NULL` on 36. `actor_id IS NULL` on 2.
5. **Generic actions:** by action — `execute_trigger` 2,131, `update` 1,929, `create` 551, `case_file.view` 73, `delete` 55, `ask` 49, `edit` 16, `avatar_upload` 4, `generate` 3. The specific step lives in `after_data->>'trigger'`: 49 distinct values (e.g. `submit_dcr` 138, `generate_document` 134, `csa_witness_sign_computation` 125, `endorse_to_cig` 86, `committee_approve_email` 81, `committee_deny_email` 8, `reject_dcr_item` 6, `committee_override` 7, `cig_return_to_csa` 2, …). Decisions also live in plain keys: committee vote rows carry `"vote":"approve"` + tally; check rows carry `"result":"pass"|"fail"`; cancellations carry `"reason"`.
6. **Entity types:** 43 distinct; top: `document` 772, `loan_application` 738, `release_file` 541, `computation` 443, `verification` 349, `masterlist` 267, `checks_recorded` 218, `dcr` 176.
7. **Loan linkage:** 2,464 rows have `after_data ? 'applicationId'` or `entity_type = 'loan_application'`. The rest point at child tables whose FK column is `loan_application_id`: `release_files`, `masterlist`, `computations`, `verifications`, `documents`, `payments`, `committee_votes`. `loan_applications` has `application_no` + `borrower_id`; `borrowers` has `first_name`, `last_name`.
8. **Names:** `profiles(id, email, full_name, is_active, …)`; `roles(id, slug, name, …)`; `user_roles(user_id, role_id, assigned_at, assigned_by)`.
9. **Indexes:** only `audit_events_pkey` and `idx_audit_events_created_at (created_at DESC)` — filtering by person/area/loan would scan.
10. **Policies:** `audit_select` SELECT to authenticated: `is_super_admin() OR has_module_permission('audit_log','view')`. `audit_insert` INSERT to authenticated WITH CHECK `actor_id = auth.uid() OR is_super_admin()`. **Bypass:** any logged-in user (incl. borrowers) can insert arbitrary rows under their own ID straight from the browser client — e.g. a fake "committee approved" entry. All legitimate writers use the service role (`src/lib/audit/writer.ts:47`, `src/app/api/borrower/register/route.ts:78`), so the policy is unused by the app.
11. **Tamper-proof:** trigger `audit_events_no_update BEFORE DELETE OR UPDATE … EXECUTE FUNCTION prevent_audit_mutation()` → `RAISE EXCEPTION 'audit_events are append-only'`. Consequence: **no backfill of historic rows is possible** (and none is planned).
12. **Supabase auth log:** `auth.audit_log_entries` = 0 rows → logins are not captured anywhere; the app must log them.

## Audit findings

**F1 — Single representation.** `audit_events` is the only audit store; `src/lib/audit/writer.ts` (`writeAuditEvent`, 130 call sites) is the canonical writer; `src/app/api/borrower/register/route.ts:65-96` has a private copy (`writeServiceAudit`) because the user isn't fully provisioned yet. No competing log table. Canonical stays `audit_events`.

**F2 — Readers that depend on current shapes (must not break):**
- `src/lib/account/rate-limit.ts:20-27` — counts `module_slug='account_settings' AND action='avatar_upload'` per actor.
- `src/lib/committee/decision-email-status.ts:75-84` — reads `module_slug='committee' AND action='execute_trigger' AND entity_type='loan_application' AND after_data->>trigger = …`.
- `src/lib/dashboard/aggregates.ts:498-520` — `buildAuditWidget` reads `action, module_slug, entity_type, created_at` for the dashboard widget.
- `src/app/api/admin/audit/route.ts` — current viewer API.
→ Existing `action`, `module_slug`, `entity_type`, and `after_data.trigger` values are **frozen**. Plain language is produced at read time, not by renaming.

**F3 — Writers missing (mutation routes with no audit call, verified by grep of every `POST|PATCH|PUT|DELETE` route lacking `writeAuditEvent` directly or via an imported lib):**

| Route | Change made | Log needed? |
| --- | --- | --- |
| Login (`src/app/login/page.tsx:164`, browser `signInWithPassword`) | session start | **Yes** |
| Logout (`src/components/admin/Header.tsx:317-322`, browser `signOut`) | session end | **Yes** |
| `src/app/api/collector/payments/[id]/route.ts` PATCH | payment `status` → confirmed/rejected, `reviewed_by` (lines 52-60) | **Yes — money decision** |
| `src/app/api/admin/legacy-import/runs/route.ts` POST | inserts `legacy_import_runs` (line 31) | **Yes** |
| `src/app/api/admin/legacy-import/mappings/route.ts` POST/DELETE | inserts/updates/deletes `legacy_import_mappings` (lines 45-52, 62+) | **Yes** |
| `src/app/api/ar/masterlist/route.ts` POST | CSV export of full masterlist (lines 96-114) | **Yes — data export** |
| `src/app/api/collector/reminders/route.ts` POST | sends borrower reminders (`collection` edit, line 16) | **Yes** |
| `src/app/api/documents/[id]/sign/route.ts` | retired, always 403 | No |
| `src/app/api/account/notifications/route.ts` PATCH | read/unread flag | No (personal UI state) |
| `src/app/api/admin/document-templates/preview`, `.../docx`, `.../[id]/docx-preview` | render-only, nothing saved (`docx/route.ts` comment) | No |
| `src/app/api/demo/computation/route.ts` | demo calculator | No |
| `src/app/api/reports/assistant/threads*` | AI chat threads | No |
| `src/app/api/cron/reminders/route.ts` | system job, no human actor | Optional — see Out of scope |

Middleware forced sign-out of deactivated users (`src/lib/supabase/middleware.ts:41-47`) runs on the edge without the service client → out of scope (the deactivation itself is already logged by `admin/users/[id]`).

**F4 — Role resolution.** `getUserPermissions` already loads `user_roles → roles` via service client (`src/lib/permissions/server.ts:80-210`). The writer can resolve the role with one `user_roles` select when `actorRoleId` isn't passed.

**F5 — Viewer gaps** (`src/app/admin/audit/page.tsx`): columns Time/Module/Action/Entity/Actor/IP only (lines 81-110); actor shown as `actor_id.slice(0, 8)…` (line 104); module shown as slug (line 97); no filters, search, detail view, or export; API uses session client and returns raw rows (`src/app/api/admin/audit/route.ts:12-22`).

**F6 — Reusable pieces:** `MODULES` with display `name` (`src/lib/constants.ts:29+`); `DateRangeFilter` + `resolveDateBounds` (`src/components/history/DateRangeFilter.tsx:21,58`); `Modal` (`src/components/ui/Modal.tsx:15`), `Table`, `Select`, `Input`, `Badge`, `Pagination`, `Button` in `src/components/ui/`; CSV helper pattern in `src/lib/reports/csv.ts`; IP helper `getRequestIp` (`src/lib/permissions/server.ts:240`).

**F7 — Variants (per role who acts):** staff portals CSA/intake, CIG/verification, Committee, LRA/release, AR/accounting, Collector, Remedial, Agent/leads, Super Admin/system config, plus Borrower portal. All already route through `writeAuditEvent` except the F3 gaps → the writer fix (role + loan link) covers every variant at once.

**F8 — Prior decisions:** writer is deliberately best-effort — a failed log write must not fail the user's action (`src/lib/audit/writer.ts:36-41`). Kept. Append-only trigger is deliberate. Project works directly on `main` (memory: single-branch workflow, 2026-09-11). Migrations applied via Supabase MCP (memory: document template system). Test runner executes only `src/lib/**/__tests__/*.mts` (`package.json:10`).

---

## Scope and constraints

### In scope
1. Writer auto-records the actor's role and a loan link on every event.
2. Log the 7 missing actions in F3 marked **Yes** (+ failed logins if Q1 = yes).
3. Add before-snapshots (`before_data`) on the decision/money/config routes listed in Phase 4.
4. Drop the unused browser INSERT policy; add filter indexes.
5. Plain-language label catalog covering all 49 existing triggers, all 43 entity types, and the base actions.
6. New Audit Log API (names, roles, loan no., borrower name, readable sentence, filters) + CSV export (export itself logged).
7. Rebuilt Super Admin Audit Log page.

### Out of scope: do not change
- Existing `action` / `module_slug` / `entity_type` / `after_data.trigger` values (F2 readers).
- The append-only trigger; no backfill/UPDATE of historic rows.
- Document view/download logging (Q3), cron/system-job logging, edge-middleware sign-out.
- Retention/archiving, IP-spoofing hardening of `x-forwarded-for`.
- Dashboard audit widget (`buildAuditWidget`) — may adopt labels later.

### Non-negotiable safety constraints
- Writes to `audit_events` only via service role on the server; no browser INSERT after Phase 1.
- Logging remains best-effort: never turn a successful action into an error.
- Audit API checks `requireModulePermission("audit_log", "view")` **before** using the service client.
- No passwords, tokens, or full file contents in `after_data`. Login rows store email + IP only.
- Filters come from query params but are validated with Zod (UUIDs, enum module slugs, ISO dates, `application_no` text ≤ 40 chars); never interpolated into SQL.

### Contract

**`POST /api/auth/session-event`** body `{ event: "login" | "logout" }` → `204`. Requires session (`requireAuth`); writes `{module_slug:"auth_admin", action: event, entity_type:"user", entity_id:user.id, after_data:{ email }}`. Unauthenticated → 401.
**`POST /api/auth/login-failed`** (only if Q1 = yes) body `{ email }` → `204`, no session; writes actor NULL, `action:"login_failed"`, `after_data:{ email: lower(email) }`; rate-limited to 10/min/IP via a count on `audit_events` (same pattern as `src/lib/account/rate-limit.ts`).
**`GET /api/admin/audit`** query: `limit` (1-200, default 50), `offset`, `actorId` (uuid), `module` (ModuleSlug), `from`/`to` (ISO date), `applicationNo` (text), `kind` (`decision|money|document|access|settings|all`). Response:
```ts
{ events: Array<{
    id: string; createdAt: string;
    who: { id: string | null; name: string; email: string | null; role: string | null; roleIsCurrent: boolean };
    area: string;            // MODULES name, e.g. "Committee"
    summary: string;         // "Voted to APPROVE the loan"
    outcome: "approved" | "rejected" | "returned" | "cancelled" | "completed" | "changed" | "created" | "deleted" | "viewed" | "signed_in" | "signed_out" | null;
    loan: { applicationId: string; applicationNo: string | null; borrowerName: string | null } | null;
    details: Array<{ label: string; before: string | null; after: string | null }>;
    technical: { moduleSlug: string; action: string; entityType: string | null; entityId: string | null; ipAddress: string | null };
  }>; total: number; limit: number; offset: number }
```
**`GET /api/admin/audit/export`** same filters → `text/csv` columns `Date & time, Person, Role, Area, What happened, Outcome, Loan no., Borrower, Details, IP`; max 10,000 rows; writes its own event `{module_slug:"audit_log", action:"export", after_data:{rowCount, filters}}`.

| Case | Actor | Input | Required outcome |
| --- | --- | --- | --- |
| Committee member votes approve | Committee | vote approve | Row with role "Committee", summary "Voted to APPROVE", loan no. + borrower shown |
| Collector rejects payment proof | Collector | `{status:"rejected", note}` | Row: before "Pending review" → after "Rejected", reason shown, amount in ₱ |
| Reject without note (Q2 yes) | Collector | `{status:"rejected"}` | 400 validation error, nothing changed, nothing logged |
| Staff signs in / out | any staff | login / logout | "Signed in" / "Signed out" rows with name, role, IP |
| Wrong password (Q1 yes) | anonymous | bad credentials | "Failed sign-in attempt for x@y" row, no person |
| Super Admin exports masterlist | AR/SA | POST export | "Exported the loan masterlist (N rows)" |
| Legacy import mapping deleted | Super Admin | DELETE | before = mapping, after = null, "Deleted import field mapping" |
| Historic row (no role, generic action) | — | existing data | Readable sentence via trigger map; role shown with "(current role)"; loan resolved via child table |
| Unknown future trigger | — | trigger not in map | Falls back to "<Area>: <humanized trigger>" — never blank, never crash |
| Non-audit role calls API | CSA | GET /api/admin/audit | 403 |
| Borrower inserts row from browser | Borrower | supabase `.from('audit_events').insert` | Rejected by RLS (no INSERT policy) |
| Audit write fails | any | DB error | User's action still succeeds; error in server log |
| Filter by loan no. | Super Admin | `applicationNo=AN300496` | Only events linked to that loan, any child entity |

## Files

| File | Change | Responsibility |
| --- | --- | --- |
| `supabase/migrations/20261001150000_audit_events_hardening.sql` | new | drop `audit_insert`, add helper fn + 4 indexes |
| `src/lib/audit/writer.ts` | modify | auto role, `applicationId` input → `after_data.applicationId` |
| `src/lib/audit/labels.ts` | new | trigger/action/entity/field → plain words; `describeAuditEvent()` |
| `src/lib/audit/resolve.ts` | new | batch-resolve names, roles, loan no., borrower for a page of rows |
| `src/lib/audit/csv.ts` | new | rows → CSV |
| `src/lib/audit/__tests__/labels.test.mts` | new | label catalog tests |
| `src/lib/audit/__tests__/writer.test.mts` | new | role/app-link merge tests (pure helper) |
| `src/lib/audit/__tests__/resolve.test.mts` | new | application-id derivation tests |
| `src/app/api/auth/session-event/route.ts` | new | login/logout logging |
| `src/app/api/auth/login-failed/route.ts` | new (only if Q1 = yes) | failed sign-in logging |
| `src/app/login/page.tsx` | modify | call session-event after success; login-failed on error |
| `src/components/admin/Header.tsx` | modify | call session-event before `signOut()` |
| `src/app/api/collector/payments/[id]/route.ts` | modify | audit + before/after + note (Q2) |
| `src/app/api/admin/legacy-import/runs/route.ts` | modify | audit create |
| `src/app/api/admin/legacy-import/mappings/route.ts` | modify | audit create/update/delete with before |
| `src/app/api/ar/masterlist/route.ts` | modify | audit export |
| `src/app/api/collector/reminders/route.ts` | modify | audit reminder send |
| Phase 4 route list (12 files, below) | modify | add `beforeData` |
| `src/app/api/admin/audit/route.ts` | rewrite | filtered, enriched, plain-language API |
| `src/app/api/admin/audit/export/route.ts` | new | CSV export + self-audit |
| `src/app/admin/audit/page.tsx` | rewrite | non-technical page |
| `src/components/admin/AuditEventDetail.tsx` | new | detail modal (Before → After) |
| Payment reviewer UI component that PATCHes `/api/collector/payments/[id]` | modify (only if Q2 = yes) | reason textarea on Reject — implementer: `grep -rn "api/collector/payments/" src/app src/components` to locate; UNVERIFIED which file |

## Phase 0: Failing tests first

### Task 0.1: label catalog
**File:** `src/lib/audit/__tests__/labels.test.mts`
- [ ] Tests:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { describeAuditEvent, TRIGGER_LABELS } from "../labels.ts";

const base = { module_slug: "committee", action: "update", entity_type: "committee_vote",
  entity_id: "x", before_data: null, after_data: null };

test("committee vote approve reads plainly", () => {
  const d = describeAuditEvent({ ...base, after_data: { vote: "approve", comment: null } });
  assert.equal(d.summary, "Voted to APPROVE the loan");
  assert.equal(d.outcome, "approved");
});
test("every live trigger has a label", () => {
  for (const t of ["submit_dcr","generate_document","csa_witness_sign_computation",
    "lra_witness_sign_release_doc","reconcile_dcr_item","privacy_orientation_given",
    "initial_interview_recorded","endorse_to_cig","committee_approve_email","submit_ci_report",
    "generate_documents","collector_briefing_ack","release_disbursement","close_release",
    "pdc_physical_collect","ar_receive_file","lra_witness_sign_all_release_docs",
    "committee_adjust_pre_decision","borrower_sign_computation","reconcile_post","mark_paid_off",
    "remove_generated_document","csa_disclose","move_of_payment","internal_transfer_posted",
    "csa_connect_borrower_account","generate_demand_letter","borrower_counter","bounce_dcr_item",
    "generate_final_computation_sheet","committee_deny_email","remedial_turnover",
    "generate_acknowledgement_receipt","committee_override","reject_dcr_item","clear_hold",
    "csa_lead_convert","committee_accept_counter_offer","reject_dcr","lra_unwitness_sign_release_doc",
    "revision_complete","move_of_payment_surcharge","cig_return_to_csa","cig_callback_resolved",
    "move_of_payment_replacement_check","csa_change_application_owner","generate_bank_authorization",
    "internal_transfer_rejected","generate_application_form"]) {
    assert.ok(TRIGGER_LABELS[t], `missing label for ${t}`);
  }
});
test("unknown trigger falls back, never blank", () => {
  const d = describeAuditEvent({ ...base, action: "execute_trigger", after_data: { trigger: "brand_new_step" } });
  assert.equal(d.summary, "Committee: Brand new step");
});
test("check result fail is rejected outcome", () => {
  const d = describeAuditEvent({ ...base, module_slug: "verification", entity_type: "checks_recorded",
    after_data: { slug: "poea", result: "fail" } });
  assert.equal(d.outcome, "rejected");
  assert.match(d.summary, /POEA/);
});
test("details use plain labels and pesos", () => {
  const d = describeAuditEvent({ ...base, module_slug: "accounting_ar", entity_type: "dcr",
    action: "execute_trigger", after_data: { trigger: "reconcile_post", status: "reconciled", depositAmount: 65841.92 } });
  assert.deepEqual(d.details.find((x) => x.label === "Deposit amount")?.after, "₱65,841.92");
  assert.deepEqual(d.details.find((x) => x.label === "Status")?.after, "Reconciled");
});
test("login/logout", () => {
  assert.equal(describeAuditEvent({ ...base, module_slug: "auth_admin", action: "login", entity_type: "user" }).summary, "Signed in");
});
```
- [ ] Run: `npm test` → Expected: FAIL, `Cannot find module '../labels.ts'`.

### Task 0.2: writer merge helper
**File:** `src/lib/audit/__tests__/writer.test.mts`
- [ ] Test exported pure fn `mergeApplicationLink(afterData, applicationId)`: adds `applicationId` when absent; never overwrites an existing one; returns `null` unchanged when both null.
- [ ] Run `npm test` → FAIL (export missing).

### Task 0.3: application-id derivation
**File:** `src/lib/audit/__tests__/resolve.test.mts`
- [ ] Test exported pure fn `directApplicationId(row)`: `entity_type in ('loan_application','application')` → `entity_id`; else `after_data.applicationId` ?? `after_data.loanApplicationId` ?? `before_data.applicationId`; else `null`. And `childLookupTable(entity_type)` returns `release_files` for `release_file`, `masterlist` for `masterlist`, `computations` for `computation`, `verifications` for `verification`, `documents` for `document`, `payments` for `payment`, `null` for `user`.
- [ ] Run `npm test` → FAIL.

## Phase 1: Database hardening (migration)

### Task 1.1
**File:** `supabase/migrations/20261001150000_audit_events_hardening.sql`
```sql
-- Writes go through the service role only (writer.ts, borrower/register).
-- The authenticated INSERT policy let any signed-in user forge rows under their own id.
DROP POLICY IF EXISTS audit_insert ON public.audit_events;

CREATE OR REPLACE FUNCTION public.audit_event_application_id(
  p_entity_type text, p_entity_id text, p_after jsonb, p_before jsonb)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(
    CASE WHEN p_entity_type IN ('loan_application','application') THEN p_entity_id END,
    p_after->>'applicationId', p_after->>'loanApplicationId', p_before->>'applicationId')
$$;

CREATE INDEX IF NOT EXISTS idx_audit_events_actor_created
  ON public.audit_events (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_module_created
  ON public.audit_events (module_slug, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_entity
  ON public.audit_events (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_application
  ON public.audit_events (public.audit_event_application_id(entity_type, entity_id, after_data, before_data));
```
- [ ] Apply via Supabase MCP `apply_migration` (project convention), **before** deploying code (code does not depend on the dropped policy; indexes are additive).
- [ ] Verify (read-only):
```sql
SELECT policyname, cmd FROM pg_policies WHERE tablename='audit_events';        -- only audit_select
SELECT indexname FROM pg_indexes WHERE tablename='audit_events';                -- 6 rows
SELECT count(*) FROM audit_events
 WHERE audit_event_application_id(entity_type, entity_id, after_data, before_data) IS NOT NULL; -- ≈ 2,464+
```
**Phase constraints:** no change to `audit_select`, the append-only trigger, or existing rows.

## Phase 2: Writer — role + loan link on every event

### Task 2.1
**File:** `src/lib/audit/writer.ts`
- [ ] Add optional `applicationId?: string | null` to `WriteAuditEventInput`.
- [ ] Export pure `mergeApplicationLink(afterData, applicationId)` (Task 0.2).
- [ ] Inside the existing `try`, before insert: if `input.actorRoleId` is undefined and `input.actorId` is set, `select role_id from user_roles where user_id = actorId order by assigned_at desc limit 1` using the same service client; use it (or null). Errors here are swallowed (best-effort, same as today).
- [ ] Insert `after_data: mergeApplicationLink(input.afterData ?? null, input.applicationId ?? null)`.
- [ ] Do **not** change `action`, `module_slug`, or existing keys.
- [ ] Same role lookup in `writeServiceAudit` in `src/app/api/borrower/register/route.ts`? **No** — role is assigned after the audit call in that flow; leave it.
- [ ] Run `npm test` → Task 0.2 passes.
- [ ] Manual: perform any CSA action → `select actor_role_id from audit_events order by created_at desc limit 1` is non-null.

## Phase 3: Log the missing actions

### Task 3.1 — Login / logout
**Files:** `src/app/api/auth/session-event/route.ts`, `src/app/login/page.tsx`, `src/components/admin/Header.tsx`
- [ ] Route: `POST`, Zod `{event: z.enum(["login","logout"])}`, `const user = await requireAuth()`, `writeAuditEvent({ actorId: user.id, moduleSlug: "auth_admin", action: event, entityType: "user", entityId: user.id, afterData: { email: user.email ?? null } })`, return 204.
- [ ] `login/page.tsx` `signIn()`: after `signInWithPassword` succeeds and before `router.push`, `await fetch("/api/auth/session-event", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ event: "login" }) }).catch(() => {})`. On `signInError` and Q1 = yes: same pattern to `/api/auth/login-failed` with `{ email: emailValue }`.
- [ ] `Header.tsx` `handleSignOut()`: call session-event `logout` **before** `supabase.auth.signOut()` (the session is needed to identify the user); ignore failures.
- [ ] Borrower portal sign-out: implementer greps `auth.signOut(` again after this change — currently only `Header.tsx`, middleware, and admin users route (verified); if a borrower header exists separately, apply the same call.
- [ ] Manual: sign in as CSA, sign out → two rows "Signed in" / "Signed out" with CSA name + role.

### Task 3.2 — Payment proof approve/reject
**File:** `src/app/api/collector/payments/[id]/route.ts`
- [ ] Extend schema (Q2 = yes): `note: z.string().trim().max(500).optional()` + `.refine(b => b.status !== "rejected" || !!b.note, { message: "A reason is required when rejecting", path: ["note"] })`. Save `note` only if `payments` has a suitable column — **UNVERIFIED**: run `select column_name from information_schema.columns where table_name='payments'`; if none, keep the reason in the audit row only (no migration).
- [ ] After successful update: `writeAuditEvent({ actorId: user.id, moduleSlug: <"remedial" when the reviewer passed only the remedial permission at lines 33-35, else "collection">, action: "update", entityType: "payment", entityId: id, applicationId: <payment.loan_application_id from context or a select>, beforeData: { status: "pending_verification" }, afterData: { trigger: body.status === "confirmed" ? "payment_proof_confirmed" : "payment_proof_rejected", status: body.status, amount, reason: body.note ?? null } })`. Use remedial module slug when the reviewer acted through remedial permission (both permissions computed at lines 33-35).
- [ ] Add the two triggers to `TRIGGER_LABELS`.

### Task 3.3 — Legacy import
**Files:** `src/app/api/admin/legacy-import/runs/route.ts`, `.../mappings/route.ts`
- [ ] runs POST: after insert `.select("id")`, audit `{moduleSlug:"system_config", action:"create", entityType:"legacy_import_run", entityId, afterData:{ trigger:"legacy_import_run", ...summary counts from parsed.data (no row payloads) }}`.
- [ ] mappings POST: when updating, select the existing row first → `beforeData`; audit `update` or `create`, `entityType:"legacy_import_mapping"`. DELETE: select row first → `beforeData`, `action:"delete"`.

### Task 3.4 — Masterlist export
**File:** `src/app/api/ar/masterlist/route.ts`
- [ ] Capture `const user = await requireModulePermission(...)` at line 98; after CSV build: audit `{moduleSlug:"accounting_ar", action:"export", entityType:"masterlist", afterData:{ trigger:"masterlist_export", rowCount: data.length }}`.

### Task 3.5 — Collector reminders
**File:** `src/app/api/collector/reminders/route.ts`
- [ ] After send: audit `{moduleSlug:"collection", action:"execute_trigger", entityType:"masterlist" or "assignment" per request body, afterData:{ trigger:"send_payment_reminder", channels, sentCount }}` — field names from the route's existing body/result (read the route; do not invent).

**Phase constraints:** primary responses unchanged except Task 3.2's new 400.

## Phase 4: "Before" snapshots on decisions

For each route: where the route **already loads** the record before mutating, pass `beforeData` with the fields being changed (at minimum `{ status }`); where it does not, add one `select` of only those columns. Add `applicationId` where known.

| File | Before fields |
| --- | --- |
| `src/lib/committee/actions.ts` | application `status` |
| `src/app/api/committee/applications/[id]/vote/route.ts` | member's previous vote (if re-voting) |
| `src/app/api/committee/applications/[id]/override/route.ts` | prior decision/status |
| `src/app/api/cig/applications/[id]/forward/route.ts` | `status` |
| `src/app/api/cig/applications/[id]/return/route.ts` | `status` |
| `src/app/api/cig/applications/[id]/cancel/route.ts` | `status` |
| `src/app/api/ar/dcr/[id]/reconcile/route.ts` | dcr `status` |
| `src/app/api/ar/dcr/[id]/reject/route.ts` | dcr `status` |
| `src/app/api/ar/dcr/items/[itemId]/reject/route.ts` | item `status` |
| `src/app/api/ar/dcr/items/[itemId]/bounce/route.ts` | item `status` |
| `src/app/api/ar/masterlist/[id]/write-off/route.ts` | outstanding balance, status |
| `src/app/api/admin/roles/[id]/permissions/route.ts` | already passes `beforeData` (verified) — confirm it holds the full previous permission set; otherwise no change |

- [ ] Skip any file that already passes `beforeData` (grep `beforeData` in it first).
- [ ] Manual: return a file CIG → CSA → event detail shows "Status: For verification → Returned to CSA".

## Phase 5: Plain-language catalog

### Task 5.1 — `src/lib/audit/labels.ts`
- [ ] `AREA_LABEL(slug)` from `MODULES` (`src/lib/constants.ts`), plus `audit_log` → "Audit log".
- [ ] `TRIGGER_LABELS: Record<string, { summary: string; outcome: Outcome }>` — all 49 live triggers + new ones (`payment_proof_confirmed`, `payment_proof_rejected`, `legacy_import_run`, `masterlist_export`, `send_payment_reminder`). Examples (implementer writes all, same tone — past tense, staff-readable):
  - `endorse_to_cig` → "Endorsed the application to CIG for verification" / completed
  - `cig_return_to_csa` → "Returned the application to CSA for revision" / returned
  - `submit_ci_report` → "Submitted the CI report to Committee" / completed
  - `committee_approve_email` → "Sent the approval notice to the borrower" / approved
  - `committee_deny_email` → "Sent the denial notice to the borrower" / rejected
  - `committee_override` → "Overrode the committee decision" / changed
  - `reject_dcr` / `reject_dcr_item` → "Rejected the daily collection report" / "…a DCR line" / rejected
  - `bounce_dcr_item` → "Marked a check as bounced" / rejected
  - `release_disbursement` → "Released the loan proceeds" / completed
  - `mark_paid_off` → "Marked the loan as fully paid" / completed
  - `csa_change_application_owner` → "Changed the borrower on the application" / changed
- [ ] Entity+action fallbacks: `committee_vote` → "Voted to {VOTE} the loan"; `checks_recorded` → "Recorded {CHECK NAME} check: {Passed|Failed}" (check slugs upper-cased: `poea` → "POEA", `ncl` → "NCL"); `document` update → "Uploaded {fileName}"; `document` execute_trigger with `status: confirmed` → "Confirmed document {file_name}"; `application_cancellation` → "Cancelled the application"; `user` create/update/delete → "Created/Updated/Deactivated user account"; `role_module_permissions` → "Changed role permissions"; `config_settings` → "Changed system settings"; `case_file.view` → "Viewed the account case file"; `ask` → "Asked the Reports assistant a question"; base `create/update/delete/edit` → "Created/Updated/Deleted/Edited {entity words}".
- [ ] Final fallback: `"{Area}: {Humanized trigger or action}"` (Task 0.1).
- [ ] `FIELD_LABELS` for detail rows: `status`→"Status", `reason`→"Reason", `note`→"Note", `comment`→"Remarks", `vote`→"Vote", `result`→"Result", `amount`/`depositAmount`/`netReleased`/`surchargeAmount`/`newBalance`→peso labels, `depositReference`→"Deposit reference", `fileName`/`file_name`→"File", `checkNumber`→"Check no.", `checkDate`/`deadlineDate`/`extensionDueDate`/`signedAt`/`submittedAt`→dates (`Oct 1, 2026, 9:12 AM`, Asia/Manila), `email`→"Email". Money keys formatted `₱#,##0.00`; status values humanized (`for_verification` → "For verification"). Keys holding IDs (`*Id`, `id`, `batchId`, arrays of IDs) and large objects (`borrower`, `tally.votes`) are **excluded from `details`** and only shown under "Technical details".
- [ ] `describeAuditEvent(row) → { summary, outcome, details }`.
- [ ] Run `npm test` → Task 0.1 passes.

### Task 5.2 — `src/lib/audit/resolve.ts`
- [ ] Export `directApplicationId`, `childLookupTable` (Task 0.3).
- [ ] `resolveAuditRows(service, rows)`: one query each, batched by distinct IDs on the page: `profiles(id, full_name, email)` for actors; `user_roles → roles(name)` for actors (used when `actor_role_id` null → `roleIsCurrent: true`); `roles(id,name)` for non-null `actor_role_id`; per child table `select id, loan_application_id … in (ids)`; then `loan_applications(id, application_no, borrower_id)` + `borrowers(id, first_name, last_name)`. Missing actor → name "System" (actor null) or "Deleted user".
- [ ] Run `npm test` → Task 0.3 passes.

## Phase 6: API + export

### Task 6.1 — `src/app/api/admin/audit/route.ts`
- [ ] `await requireModulePermission("audit_log", "view")` first; then `createServiceClient()` (needed so non-super-admin audit viewers can resolve staff/borrower names blocked by `profiles`/`borrowers` RLS).
- [ ] Zod-validate the Contract query. Filters: `actorId` → `.eq("actor_id")`; `module` → `.eq("module_slug")`; `from/to` via `resolveDateBounds`; `applicationNo` → look up `loan_applications.id` by `application_no ilike` (exact, case-insensitive), then filter by `entity_id.eq.{id}` OR `after_data->>applicationId.eq.{id}` OR child-table entity IDs (pre-fetch child IDs for that loan from the 6 child tables, capped at 500) using `.or(...)`; `kind` → module/entity groups defined in `labels.ts` (`decision`: committee, verification, intake endorse/return; `money`: accounting_ar, collection payments; `document`: document/generated_document/rendered_document; `access`: login/logout/login_failed/export/case_file.view; `settings`: system_config, auth_admin).
- [ ] Map rows → Contract shape via `describeAuditEvent` + `resolveAuditRows`.
- [ ] Also return `actors: Array<{id, name}>` (distinct staff from `profiles` where active, for the "Person" filter) on first page only (`offset=0`).

### Task 6.2 — `src/app/api/admin/audit/export/route.ts`
- [ ] Same permission + filters, `limit 10000`, `src/lib/audit/csv.ts` with the Contract columns, `Content-Disposition: attachment; filename="audit-log-YYYY-MM-DD.csv"`; then `writeAuditEvent({ moduleSlug: "audit_log", action: "export", afterData: { trigger: "audit_log_export", rowCount, filters } })` and add that trigger label.

## Phase 7: Audit Log page (non-technical)

### Task 7.1 — `src/app/admin/audit/page.tsx` + `src/components/admin/AuditEventDetail.tsx`
- [ ] Header: title "Activity Log", description "Every action taken in LoanStar — who did it, when, and what changed. Entries cannot be edited or deleted."
- [ ] Filter bar: **Person** (`Select`, from `actors`), **Area** (`Select`, `MODULES` names), **Type** (`SegmentedControl`/`Select`: All, Decisions, Money, Documents, Sign-ins & exports, Settings), **Date** (`DateRangeFilter`), **Loan no.** (`Input`), **Export CSV** (`Button`, downloads `/api/admin/audit/export?...same filters`).
- [ ] Table columns: **When** (`Oct 1, 2026 · 9:12 AM`, Asia/Manila) · **Who** (full name bold + role as `Badge`; "(current role)" hint when `roleIsCurrent`) · **What happened** (`summary`, with outcome `Badge`: green Approved/Completed, red Rejected/Cancelled, amber Returned, gray others) · **Loan / Borrower** (`AN300496 · Juan Dela Cruz`, links to the application page) · **Area**.
- [ ] No UUIDs, slugs, or raw JSON visible in the table.
- [ ] Row click → `Modal` (`AuditEventDetail`): headline sentence, person + role + email, date/time, loan + borrower, a **Changes** table (`Detail | Before | After`), "Device IP" line, and a collapsed "Technical details" `Accordion` with module slug/action/entity IDs/raw JSON for support use.
- [ ] Empty state (`EmptyState`): "No activity matches these filters."
- [ ] Keep `Pagination` (50/page).
- [ ] Manual: as Super Admin open `/admin/audit` → see names, plain sentences; filter Person = a Committee user + Type = Decisions → only that user's votes/decisions; open one → Before/After shown; Export → CSV opens in Excel with the same rows, and a new "Exported the activity log" row appears.

## Phase last: Regression verification and rollout

- `npm test` (all `src/lib/**/__tests__/*.mts`) → pass.
- `npm run lint` → clean. `npx tsc --noEmit` → clean. `npm run build` → success.
- Regression of F2 readers: upload avatar 6× quickly → rate limit still triggers; Committee decision-email status still shows on an approved file; dashboard audit widget still renders.

| Role | Action | Expected in Activity Log |
| --- | --- | --- |
| CSA | sign in, endorse to CIG, sign out | 3 rows, role "CSA", loan no. on endorse |
| CIG | return to CSA with reason | "Returned the application to CSA for revision", Status before/after, reason |
| Committee | vote approve | "Voted to APPROVE the loan", role Committee |
| AR | reconcile DCR / reject DCR item | Reconciled with ₱ deposit; Rejected with status change |
| Collector | reject payment proof (with reason) | Rejected, reason, amount |
| Borrower | sign computation | "Borrower signed the loan computation", role Borrower |
| Super Admin | change role permissions, export masterlist, export log | 3 rows with before/after on permissions |
| Borrower (browser console) | `supabase.from('audit_events').insert(...)` | RLS error |

Post-deploy read-only checks:
```sql
SELECT count(*) FILTER (WHERE actor_role_id IS NULL) AS no_role, count(*) AS total
FROM audit_events WHERE created_at > '<deploy time>';            -- no_role = 0 except borrower-register/login_failed rows
SELECT action, count(*) FROM audit_events
WHERE action IN ('login','logout','login_failed','export') GROUP BY 1; -- non-zero after smoke test
```

## Rollback

1. Code: `git revert` the commit; the old page/API work against the same table (no columns removed).
2. Rows written during rollout (new actions, role IDs, `applicationId` keys) stay valid and harmless to old readers.
3. If the INSERT policy must return, forward migration: `CREATE POLICY audit_insert ON public.audit_events FOR INSERT TO authenticated WITH CHECK ((actor_id = auth.uid()) OR is_super_admin());`. Indexes and the helper function can stay.
4. Never edit `20261001150000_audit_events_hardening.sql` after it is applied.

## Commit

On `main` (project rule). Two commits:
1. `git add supabase/migrations/20261001150000_audit_events_hardening.sql src/lib/audit/writer.ts src/lib/audit/labels.ts src/lib/audit/resolve.ts src/lib/audit/csv.ts src/lib/audit/__tests__/labels.test.mts src/lib/audit/__tests__/writer.test.mts src/lib/audit/__tests__/resolve.test.mts src/app/api/auth/session-event/route.ts src/app/login/page.tsx src/components/admin/Header.tsx "src/app/api/collector/payments/[id]/route.ts" src/app/api/admin/legacy-import/runs/route.ts src/app/api/admin/legacy-import/mappings/route.ts src/app/api/ar/masterlist/route.ts src/app/api/collector/reminders/route.ts` + the 12 Phase 4 files + (if Q1) `src/app/api/auth/login-failed/route.ts` + (if Q2) the payment reviewer component
   Message: `feat(audit): record role, loan link, sign-ins, payment reviews, imports, exports and before-snapshots`
2. `git add src/app/api/admin/audit/route.ts src/app/api/admin/audit/export/route.ts src/app/admin/audit/page.tsx src/components/admin/AuditEventDetail.tsx`
   Message: `feat(audit): plain-language Activity Log with filters, details and CSV export`

Both end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Self-review

1. **Contradictions:** "Do not change action names" vs "readable labels" — resolved by read-time catalog. "No backfill" vs "historic rows readable" — resolved by read-time role fallback + child-table loan lookup. OK.
2. **Goal reachability:** Future rows — every writer goes through `writeAuditEvent` (role auto-filled) and gaps are closed. Existing rows — readable via trigger/entity catalog; role shown as current role (cannot recover historic role — stated, not hidden). Rows with no trigger and generic action fall back to entity sentence.
3. **Bypass:** Browser INSERT closed by dropping `audit_insert`. Service-role reads only after permission check. Remaining unlogged paths are documented out-of-scope (cron, edge sign-out, document downloads Q3).
4. **Existence:** Verified: `audit_events` columns, `profiles.full_name`, `roles.name`, `user_roles.assigned_at`, `loan_applications.application_no`, `borrowers.first_name/last_name`, child `loan_application_id` columns, `MODULES`, `DateRangeFilter`, `resolveDateBounds`, `Modal`, `getRequestIp`, `requireAuth`, `hasModulePermission`, `requireSuperAdmin` (already imported by the legacy-import routes), all 12 Phase 4 files, `SegmentedControl`/`Accordion`/`EmptyState` files, test glob. Fixed during review: removed a non-existent `context.desk` (module now derived from the permission flags). UNVERIFIED: `payments` reason column; payment reviewer component path; reminder route body field names; `SegmentedControl`/`Accordion`/`EmptyState` props (components exist in `src/components/ui/`).
5. **Consistency:** Files table ↔ phases ↔ commit list match (Phase 4 table referenced as "12 files" in both).
6. **Duplication:** No new audit table; `borrower/register`'s private writer left as-is (documented).
7. **Placeholders:** `<deploy time>` in the post-deploy SQL is intentional operator input; no TODO/TBD.

Not applicable: checklist A2 (DB-stored templates — audit labels aren't template content); E per-segment (logging is segment-agnostic).

---

## Implementation log — 2026-10-01

Implemented directly (user instruction), recommended answers taken for Q1–Q4 (failed sign-ins logged; reject reason required; no document-view logging; viewer access unchanged).

- Migration `20261001150000_audit_events_hardening` applied live via Supabase MCP; verified: only `audit_select` policy remains, 6 indexes.
- Writer auto-resolves the role; `applicationId` input merged into `after_data` (pure helpers in `src/lib/audit/link.ts`).
- New logging: sign-in / sign-out (`/api/auth/session-event`), failed sign-in (`/api/auth/login-failed`, 10/min/IP, email + IP only), payment-proof confirm/reject (reason required on reject; stored in the audit row — `payments` has no reason column for this), legacy import runs + mapping create/update/delete (with before), masterlist CSV download, collector reminders, Activity Log CSV download.
- Before-snapshots added on CIG forward/return/cancel, AR DCR reconcile/reject, DCR item reject/bounce, committee final action, committee override/adjust, committee vote (previous vote). Write-off left as-is (the written-off amount is the change); role permissions route already had before.
- Deviations from plan: loan linkage extended — `committee_vote` and `verification` rows store the loan id in `entity_id` (verified live: 95/96 and 349/349), and 8 more child tables resolve to loans (`committee_assessments`, `negotiations`, `negotiation_messages`, `callbacks`, `file_holds`, `rendered_documents`, `application_cancellations`, `checks_recorded`). Check names mirror `check_types.name`. Detail modal shows stacked Before → After lines instead of a 3-column table (modal too narrow).
- Verified live in browser (Super Admin): readable table with names/roles/sentences/outcome badges/loan + borrower; "Decisions" filter; loan filter (AN300516 → 84 events across 9 areas); invalid filter → 400; non-audit role → 403; sign-in, sign-out and failed sign-in rows written with role and IP.
- Not verified live: payment reject with reason and CSV download click — the shared dev server on :3000 began returning 500 for every route because another session saved `src/components/collector/ContactLogModal.tsx` with an invalid UTF-8 byte (0x85 at byte 3829). Two rows written at 08:42–08:43 by pre-existing routes lack a role; most likely stale server compilation — re-check after a dev-server restart with: `SELECT count(*) FROM audit_events WHERE created_at > now() - interval '1 hour' AND actor_id IS NOT NULL AND actor_role_id IS NULL;` (expect 0).
