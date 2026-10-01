# Collector Contact History Implementation Plan

**Goal:** A collector opening **Log contact** on an account sees every past contact on that account (who, when, how, notes, callback) before adding a new one.
**Root cause:** No UI reads the history. `ContactLogModal` only POSTs (`src/components/collector/ContactLogModal.tsx:41-42`); the existing `GET /api/collector/contacts` (`src/app/api/collector/contacts/route.ts:17-41`) has no caller. Separately, the SELECT RLS policy only lets a collector read rows **they themselves** wrote (`supabase/migrations/20260707000001_p7_rls.sql:297-304`), so even with a UI a collector could not see a teammate's contacts.
**Approach:** Add a read-only "Contact history" list to the top of `ContactLogModal`, fed by the existing GET (enriched with the collector's name), and widen the SELECT policy so `collection.view` holders can read all contacts. Writing, the table shape, and the "Last Contact" column logic stay as they are.
**Tech stack:** Next.js (App Router) + React client components, Supabase (Postgres + RLS), zod, tests via `node --import tsx --test "src/lib/**/__tests__/*.mts"` (`package.json:10`).
**Source:** Chat with user 2026-10-01. Expected result: "where can I see my already set log contact" → a visible contact history per account.

## Open questions (resolve before implementing)

| # | Question | Why it matters | Recommended answer |
| --- | --- | --- | --- |
| 1 | Should a collector see contacts logged by **other** collectors on the same account? | Today RLS hides them. Handover/coverage is the main reason for history. Needs a migration. | **Yes.** Widen SELECT to `collection.view` (Phase 2). |
| 2 | Where should history appear: in the Log contact pop-up, on the Loan File page, or both? | Changes which files are touched. | **Pop-up only** for now (smallest change, and it's where the collector is about to call). Loan File can follow. |
| 3 | Should collectors be able to edit/delete their own past logs? | The write policy is `FOR ALL` (`p7_rls.sql:306`), so a collector can technically UPDATE/DELETE their own rows directly via Supabase, which weakens the log as evidence. | **No.** Out of scope here; raise as a separate hardening item (restrict policy to INSERT). |

---

## Live database/system validation: 2026-10-01

Read-only; no data changed. Project `acopcwlhkovssjnrqygk`.

- `collector_contacts` rows: 2 total, on 2 accounts, by 1 collector, both with `callback_at` set.
- Columns (`20260707000000_p7_ar_collection.sql:166-174`): `id`, `masterlist_id` (FK masterlist, cascade), `collector_user_id` NOT NULL (FK auth.users), `contact_type` in (call, sms, email, visit), `notes`, `callback_at`, `created_at`.
- Live policies (`pg_policies`):
  - `collector_contacts_select` SELECT: `is_super_admin() OR has_module_permission('accounting_ar','view') OR collector_user_id = auth.uid() OR has_module_permission('remedial','view')`. **No `collection` permission clause.**
  - `collector_contacts_write` ALL: super admin, or own row AND (`collection.edit` OR `remedial.edit`).
- No later migration changes these policies (only `20260712010000_collection_flow_alignment.sql:2` mentions the table, as a comment).

## Audit findings

1. **Readers:** `GET /api/collector/contacts` (unused); `api/collector/accounts/route.ts:149-165` (latest contact per account → Last Contact / Callback due). Both run as the user, so both are RLS-limited to own rows.
2. **Writers:** `POST /api/collector/contacts` (manual log, `route.ts:44-83`); `lib/collector/reminders.ts:232` and `:283` (automatic email/SMS reminder entries, `contact_type` email/sms, auto notes). History will show these too, which is correct (they are real contacts).
3. **Consequence of finding 1:** "Last Contact" on the accounts page currently shows only the viewing collector's own last contact. Widening SELECT fixes this as a side effect (intended).
4. **Name display precedent:** `api/collector/payments/route.ts:157-170` looks up `profiles.full_name || email` via `createServiceClient()`. Reuse the same pattern.
5. **Duplication:** None. No other contact-history concept exists.
6. **Test convention:** existing tests live in `src/lib/collector/__tests__/*.test.mts` (e.g. `payment-uploader-display.test.mts`).

---

## Scope and constraints

### In scope
- Pure helper that maps raw rows + name map to display rows.
- GET route returns `collectorName` per contact.
- History list at top of `ContactLogModal`.
- Migration widening SELECT to `collection.view`.

### Out of scope: do not change
- POST validation and audit event.
- Write policy (see open question 3).
- Accounts list query logic.
- Loan File page.

### Non-negotiable safety constraints
- History is read-only in the UI: no edit/delete buttons.
- Service client is used **only** for the `profiles` name lookup, never for reading `collector_contacts` (RLS must decide visibility).
- GET keeps `requireModulePermission("collection","view")`.

### Contract
`GET /api/collector/contacts?masterlistId=<uuid>` → `200 { contacts: [{ id, contactType, notes, callbackAt, createdAt, collectorName }] }`, newest first. Missing masterlistId → 400. No `collection.view` → 403 (existing handler).

| Case | Actor | Input | Required outcome |
| --- | --- | --- | --- |
| Happy path | Collector A | account with 3 contacts by A | 3 rows newest first, name shown |
| Teammate history | Collector B | account with contacts by A | A's rows visible (after migration) |
| Empty | Collector | account with no contacts | "No contacts logged yet." |
| Auto reminder | Collector | account with reminder row | shown as Email/SMS with auto note |
| Missing profile | Collector | row whose user has no profile | name shows "Unknown" |
| No permission | Borrower | GET | 403 |
| Direct DB read | Borrower via Supabase client | select collector_contacts | 0 rows (no matching policy clause) |
| After save | Collector | logs new contact, reopens modal | new row at top |

## Files

| File | Change | Responsibility |
| --- | --- | --- |
| `src/lib/collector/contact-history.ts` | new | `toContactHistoryRows(rows, nameById)` pure mapper |
| `src/lib/collector/__tests__/contact-history.test.mts` | new | mapper tests |
| `src/app/api/collector/contacts/route.ts` | edit GET | name lookup + mapper |
| `src/components/collector/ContactLogModal.tsx` | edit | fetch + render history |
| `supabase/migrations/20261001120000_collector_contacts_collection_view.sql` | new | widen SELECT policy |

## Phase 0: Failing tests first

### Task 0.1: mapper
**File:** `src/lib/collector/__tests__/contact-history.test.mts`
- [ ] Tests: maps snake_case → camelCase; uses `nameById` value; falls back to `"Unknown"`; preserves input order.
- [ ] Run: `npm test` → Expected: FAIL (module not found).

## Phase 1: Mapper + API

### Task 1.1: helper
**File:** `src/lib/collector/contact-history.ts`
```ts
export type ContactHistoryRow = {
  id: string; contactType: string; notes: string | null;
  callbackAt: string | null; createdAt: string; collectorName: string;
};
export function toContactHistoryRows(
  rows: Array<{ id: string; contact_type: string; notes: string | null; callback_at: string | null; created_at: string; collector_user_id: string }>,
  nameById: Map<string, string>,
): ContactHistoryRow[] {
  return rows.map((r) => ({
    id: r.id, contactType: r.contact_type, notes: r.notes,
    callbackAt: r.callback_at, createdAt: r.created_at,
    collectorName: nameById.get(r.collector_user_id) ?? "Unknown",
  }));
}
```
- [ ] Run: `npm test` → PASS.

### Task 1.2: GET route
**File:** `src/app/api/collector/contacts/route.ts`
- [ ] After the existing select, collect distinct `collector_user_id`s, look up `profiles (id, full_name, email)` with `createServiceClient()` exactly like `api/collector/payments/route.ts:157-170`, return `jsonOk({ contacts: toContactHistoryRows(data ?? [], nameById) })`.
- [ ] Import `createServiceClient` from `@/lib/supabase/server`.

**Phase constraints:** POST untouched.

## Phase 2: Migration (apply before or with the code deploy)

**File:** `supabase/migrations/20261001120000_collector_contacts_collection_view.sql`
```sql
DROP POLICY IF EXISTS collector_contacts_select ON public.collector_contacts;
CREATE POLICY collector_contacts_select ON public.collector_contacts
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.has_module_permission('collection', 'view')
    OR public.has_module_permission('accounting_ar', 'view')
    OR collector_user_id = auth.uid()
    OR public.has_module_permission('remedial', 'view')
  );
```
- [ ] Apply via Supabase MCP `apply_migration` (project convention), only after open question 1 is answered yes.
- [ ] Verify (read-only): `select qual from pg_policies where policyname='collector_contacts_select';` → contains `'collection'`.

## Phase 3: UI

**File:** `src/components/collector/ContactLogModal.tsx`
- [ ] On open, `fetch(\`/api/collector/contacts?masterlistId=${masterlistId}\`)`; keep `history`, `historyLoading`, `historyError` state.
- [ ] Above the form, a "Contact history" section: max-height ~220px, scrollable; each row: date/time, type label (Call/SMS/Email/Visit), collector name, notes, and "Callback: <date>" if set. Empty → "No contacts logged yet." Error → small Alert, form still usable.
- [ ] No edit/delete controls.
- [ ] Manual check: Collector Accounts → AN300422 → Log contact → existing callback entry is listed; save a new one, reopen → it appears on top.

## Phase last: Regression verification and rollout

- [ ] `npm test` all green; `npx tsc --noEmit` clean.
- [ ] Accounts page: Last Contact / Callback due still render for AN300422.
- [ ] Log in as a second collector: sees the first collector's entries (post-migration).
- [ ] Borrower account: GET returns 403.
- [ ] Commit list = Files table (5 files).

## Self-review

1. Contradictions: none; Loan File explicitly out of scope.
2. Goal reachability: existing 2 rows and future rows (manual + reminders) all read by the same GET → shown.
3. Bypass: read-only feature; visibility still decided by RLS; service client limited to profiles.
4. Existence: route, modal, policy names, `createServiceClient`, test dir, `npm test` script all confirmed above.
5. Consistency: 5 files in table, phases, and commit list.
6. Duplication: none.
7. Placeholders: none.
